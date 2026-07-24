export const SANDBOX_COMPAT_SHIM = `
    <script>
      (function () {
        try {
          var cookieJar = "";
          Object.defineProperty(document, "cookie", {
            configurable: true,
            get: function () { return cookieJar; },
            set: function (value) {
              var name = String(value).split("=")[0].trim();
              var existing = cookieJar.split("; ").filter(Boolean).filter(function (entry) {
                return entry.split("=")[0].trim() !== name;
              });
              existing.push(String(value).split(";")[0]);
              cookieJar = existing.join("; ");
            }
          });
        } catch (e) {}

        function memoryStorage() {
          var data = {};
          return {
            getItem: function (key) { return Object.prototype.hasOwnProperty.call(data, key) ? data[key] : null; },
            setItem: function (key, value) { data[key] = String(value); },
            removeItem: function (key) { delete data[key]; },
            clear: function () { data = {}; },
            key: function (index) { return Object.keys(data)[index] ?? null; },
            get length() { return Object.keys(data).length; }
          };
        }

        try {
          window.localStorage.getItem("__probe__");
        } catch (e) {
          try {
            Object.defineProperty(window, "localStorage", { configurable: true, get: function () { return memoryStorage(); } });
          } catch (e2) {}
        }
        try {
          window.sessionStorage.getItem("__probe__");
        } catch (e) {
          try {
            Object.defineProperty(window, "sessionStorage", { configurable: true, get: function () { return memoryStorage(); } });
          } catch (e2) {}
        }
      })();
    </script>
`;

function safeJsonForScript(value: unknown): string {
    return JSON.stringify(value)
        .replace(/</g, "\\u003C")
        .replace(/>/g, "\\u003E")
        .replace(/&/g, "\\u0026")
        .replace(/\u2028/g, "\\u2028")
        .replace(/\u2029/g, "\\u2029");
}

export interface ShellOptions {
    moduleSource: Record<string, string>;
    entryModuleId: string;
    externalSpecifiers: string[];
    dependencyVersions: Record<string, string>;
    mountScript: string;
    headInjection: string;
    mountElementId?: string;
}

export function buildShellDocument(options: ShellOptions): string {
    const moduleSourceJson = safeJsonForScript(options.moduleSource);
    const entryModuleId = safeJsonForScript(options.entryModuleId);
    const externalSpecifiersJson = safeJsonForScript(options.externalSpecifiers);
    const dependencyVersionsJson = safeJsonForScript(options.dependencyVersions);

    const needsExtraMountDiv =
        options.mountElementId &&
        options.mountElementId !== "root" &&
        options.mountElementId !== "preview-root";
    const extraMountDiv = needsExtraMountDiv
        ? `<div id="${options.mountElementId!.replace(/"/g, "&quot;")}"></div>`
        : "";

    return `<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    ${SANDBOX_COMPAT_SHIM}
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
    ${options.headInjection}
  </head>
  <body>
    <div id="preview-root"><div id="root"></div><div id="app"></div>${extraMountDiv}</div>
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

      function extractCleanVersion(rawRange) {
        if (!rawRange) return null;
        const firstToken = String(rawRange).trim().split(/\\s+/)[0];
        const cleaned = firstToken.replace(/^[\\^~>=<]+/, "");
        const digitMatch = cleaned.match(/^\\d+(\\.\\d+){0,2}/);
        return digitMatch ? digitMatch[0] : null;
      }

      function packageNameFor(specifier) {
        if (specifier.startsWith("@")) {
          const parts = specifier.split("/");
          return parts.slice(0, 2).join("/");
        }
        return specifier.split("/")[0];
      }

      function esmUrlFor(specifier) {
        const packageName = packageNameFor(specifier);
        const version = extractCleanVersion(dependencyVersions[packageName]);
        if (specifier === packageName) {
          return "https://esm.sh/" + specifier + (version ? "@" + version : "");
        }
        const subpath = specifier.slice(packageName.length);
        return "https://esm.sh/" + packageName + (version ? "@" + version : "") + subpath;
      }

      async function loadExternal(specifier) {
        if (externalModuleCache[specifier]) return externalModuleCache[specifier];
        let mod;
        try {
          mod = await import(/* @vite-ignore */ esmUrlFor(specifier));
        } catch (err) {
          throw new Error("Failed to load dependency '" + specifier + "' from esm.sh: " + err.message);
        }
        if (!mod || typeof mod !== "object") {
          throw new Error("Dependency '" + specifier + "' did not resolve to a valid module");
        }
        externalModuleCache[specifier] = mod;
        return mod;
      }

      async function preloadExternals() {
        for (const specifier of externalSpecifiers) {
          await loadExternal(specifier);
        }
      }

      function interopExternal(mod) {
        const out = {};
        for (const key in mod) {
          out[key] = mod[key];
        }
        if (mod.default !== undefined) {
          out.default = mod.default;
        }
        return out;
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
        const stripped = joined.replace(/\\.(tsx|ts|jsx|js|mjs|vue|svelte)$/, "");
        const candidates = [
          joined,
          stripped + ".tsx", stripped + ".ts", stripped + ".jsx", stripped + ".js",
          stripped + ".vue", stripped + ".svelte",
          stripped + ".css", stripped + ".json",
          stripped + "/index.tsx", stripped + "/index.ts", stripped + "/index.jsx", stripped + "/index.js"
        ];
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
            return interopExternal(mod);
          }
          return requireLocal(moduleId, specifier);
        };

        const fn = new Function("module", "exports", "require", code);
        fn(moduleObj, moduleObj.exports, localRequire);
        return moduleObj.exports;
      }

      preloadExternals()
        .then(function () {
          ${options.mountScript}
        })
        .catch(function (err) {
          reportError(err.message, err.stack);
        });
    </script>
  </body>
</html>`;
}
