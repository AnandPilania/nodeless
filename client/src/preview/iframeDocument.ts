import type { BundleOutput } from "./bundler";

export function buildPreviewDocument(
  bundle: BundleOutput,
  dependencyVersions: Record<string, string>
): string {
  const moduleSourceJson = JSON.stringify(bundle.moduleSource);
  const entryModuleId = JSON.stringify(bundle.entryModuleId);
  const externalSpecifiersJson = JSON.stringify(bundle.externalSpecifiers);
  const dependencyVersionsJson = JSON.stringify(dependencyVersions);

  return `<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <style>
      html, body { margin: 0; padding: 0; background: #ffffff; color: #111; font-family: -apple-system, sans-serif; }
      #preview-root { min-height: 100vh; }
      .preview-error-boundary {
        margin: 16px;
        padding: 16px 18px;
        border: 1px solid #e0645a;
        background: #fff5f4;
        border-radius: 8px;
        color: #a8342b;
        font-family: 'SF Mono', 'JetBrains Mono', monospace;
        font-size: 13px;
        white-space: pre-wrap;
        word-break: break-word;
      }
      .preview-error-title {
        font-weight: 700;
        margin-bottom: 8px;
        font-family: -apple-system, sans-serif;
      }
    </style>
  </head>
  <body>
    <div id="preview-root"></div>
    <script>
      const moduleSource = ${moduleSourceJson};
      const entryModuleId = ${entryModuleId};
      const externalSpecifiers = ${externalSpecifiersJson};
      const dependencyVersions = ${dependencyVersionsJson};

      function reportError(message, stack) {
        const root = document.getElementById("preview-root");
        root.innerHTML = "";
        const box = document.createElement("div");
        box.className = "preview-error-boundary";
        const title = document.createElement("div");
        title.className = "preview-error-title";
        title.textContent = "Preview error";
        box.appendChild(title);
        const body = document.createElement("div");
        body.textContent = stack || message;
        box.appendChild(body);
        root.appendChild(box);
        parent.postMessage({ source: "nodeless-preview", type: "error", message, stack }, "*");
      }

      window.onerror = function (message, _source, _line, _col, error) {
        reportError(String(message), error && error.stack ? error.stack : String(message));
        return true;
      };
      window.addEventListener("unhandledrejection", function (event) {
        const reason = event.reason;
        reportError(
          reason && reason.message ? reason.message : String(reason),
          reason && reason.stack ? reason.stack : String(reason)
        );
      });

      const externalModuleCache = {};

      function esmUrlFor(specifier) {
        const versionMatch = dependencyVersions[specifier];
        const versionSuffix = versionMatch ? "@" + versionMatch.replace(/^[\\^~]/, "") : "";
        return "https://esm.sh/" + specifier + versionSuffix;
      }

      async function loadExternal(specifier) {
        if (externalModuleCache[specifier]) return externalModuleCache[specifier];
        const mod = await import(/* @vite-ignore */ esmUrlFor(specifier));
        externalModuleCache[specifier] = mod;
        return mod;
      }

      async function preloadExternals() {
        for (const specifier of externalSpecifiers) {
          await loadExternal(specifier);
        }
      }

      const moduleCache = {};

      function resolveLocal(fromId, specifier) {
        const fromDir = fromId.includes("/") ? fromId.slice(0, fromId.lastIndexOf("/")) : "";
        const combined = (fromDir ? fromDir + "/" + specifier : specifier);
        const parts = combined.split("/");
        const resolved = [];
        for (const part of parts) {
          if (part === "." || part === "") continue;
          if (part === "..") { resolved.pop(); continue; }
          resolved.push(part);
        }
        const joined = resolved.join("/");
        const stripped = joined.replace(/\\.(tsx|ts|jsx|js|mjs)$/, "");
        const candidates = [joined, stripped + ".tsx", stripped + ".ts", stripped + ".jsx", stripped + ".js", stripped + ".css", stripped + ".json", stripped + "/index.tsx", stripped + "/index.ts", stripped + "/index.jsx", stripped + "/index.js"];
        for (const candidate of candidates) {
          if (Object.prototype.hasOwnProperty.call(moduleSource, candidate)) return candidate;
        }
        return null;
      }

      function requireLocal(fromId, specifier) {
        const resolvedId = resolveLocal(fromId, specifier);
        if (!resolvedId) {
          throw new Error("Cannot resolve module '" + specifier + "' from '" + fromId + "'");
        }
        return instantiate(resolvedId);
      }

      function instantiate(moduleId) {
        if (moduleCache[moduleId]) return moduleCache[moduleId].exports;

        const code = moduleSource[moduleId];
        if (code === undefined) {
          throw new Error("Module not found: " + moduleId);
        }

        const moduleObj = { exports: {} };
        moduleCache[moduleId] = moduleObj;

        if (moduleId.endsWith(".css")) {
          const styleTag = document.createElement("style");
          styleTag.textContent = JSON.parse(code);
          document.head.appendChild(styleTag);
          return moduleObj.exports;
        }

        if (moduleId.endsWith(".json")) {
          const fn = new Function("module", "exports", code);
          fn(moduleObj, moduleObj.exports);
          return moduleObj.exports;
        }

        const localRequire = function (specifier) {
          if (externalSpecifiers.indexOf(specifier) !== -1) {
            const mod = externalModuleCache[specifier];
            if (!mod) {
              throw new Error("External module '" + specifier + "' was not preloaded");
            }
            const interopExports = {};
            for (const key in mod) {
              interopExports[key] = mod[key];
            }
            if (mod.default !== undefined) {
              interopExports.default = mod.default;
            }
            return interopExports;
          }
          return requireLocal(moduleId, specifier);
        };

        const fn = new Function("module", "exports", "require", code);
        fn(moduleObj, moduleObj.exports, localRequire);
        return moduleObj.exports;
      }

      preloadExternals()
        .then(function () {
          return loadExternal("react").then(function (React) {
            window.React = React.default || React;
            const entryExports = instantiate(entryModuleId);
            const Component = entryExports.default || entryExports;
            if (typeof Component !== "function") {
              throw new Error("Entry module has no default export component to render.");
            }

            return loadExternal("react-dom/client").then(function (ReactDOMClient) {
              const rootEl = document.getElementById("preview-root");
              const root = ReactDOMClient.createRoot(rootEl);
              const element = window.React.createElement(Component);
              root.render(element);
              parent.postMessage({ source: "nodeless-preview", type: "rendered" }, "*");
            });
          });
        })
        .catch(function (err) {
          reportError(err.message, err.stack);
        });
    </script>
  </body>
</html>`;
}
