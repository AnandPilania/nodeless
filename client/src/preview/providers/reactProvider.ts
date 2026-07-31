import * as Babel from "@babel/standalone";
import { buildGraphBundle } from "../graphBundler";
import { buildShellDocument } from "../shell";
import { buildCssHeadInjection } from "../cssFrameworks";
import { IMPORT_META_SHIM_DECLARATION, importMetaShimPlugin } from "../importMetaShim";
import type { PreviewCompileInput, PreviewCompileOutput, PreviewProvider } from "../types";

const JSX_HINT_PATTERN = /<[A-Za-z][\s\S]*?>|React\.createElement|from ["']react["']/;

function languageForPath(filePath: string): "typescript" | "javascript" {
    return filePath.endsWith(".tsx") || filePath.endsWith(".ts") ? "typescript" : "javascript";
}

function transpile(filePath: string, source: string): string {
    const result = Babel.transform(source, {
        filename: filePath,
        presets: [
            ["react", { runtime: "classic" }],
            languageForPath(filePath) === "typescript" ? "typescript" : undefined
        ].filter(Boolean) as (string | [string, Record<string, unknown>])[],
        plugins: [importMetaShimPlugin, "transform-modules-commonjs"],
        sourceType: "module",
        retainLines: true
    });
    if (!result.code) {
        throw new Error(`Babel produced no output for ${filePath}`);
    }
    return `${IMPORT_META_SHIM_DECLARATION}\n${result.code}`;
}

export const reactProvider: PreviewProvider = {
    id: "react",
    label: "React",
    extensions: [".jsx", ".tsx"],

    detect(filePath, content) {
        if (filePath.endsWith(".jsx") || filePath.endsWith(".tsx")) return true;
        if (filePath.endsWith(".js") || filePath.endsWith(".ts")) {
            return JSX_HINT_PATTERN.test(content);
        }
        return false;
    },

    async compile(input: PreviewCompileInput): Promise<PreviewCompileOutput> {
        const bundle = buildGraphBundle(input.entryPath, input.modules, transpile, input.aliases ?? []);

        const externals = new Set(bundle.externalSpecifiers);
        externals.add("react");
        externals.add("react-dom/client");

        const mountElementId = input.mountElementId;
        const mountElementIdJson = JSON.stringify(mountElementId ?? null);

        const mountScript = `
      return loadExternal("react").then(function (React) {
        window.React = React.default || React;
        const entryExports = instantiate(${JSON.stringify(bundle.entryModuleId)});
        const Component = entryExports.default || entryExports;

        if (typeof Component === "function") {
          return loadExternal("react-dom/client").then(function (ReactDOMClient) {
            const rootEl = document.getElementById("preview-root");
            const root = ReactDOMClient.createRoot(rootEl);
            const element = window.React.createElement(Component);
            root.render(element);
            parent.postMessage({ source: "nodeless-preview", type: "rendered" }, "*");
          });
        }

        const candidateIds = [${mountElementIdJson}, "root", "preview-root"].filter(Boolean);
        function checkMounted() {
          return candidateIds
            .map(function (id) { return document.getElementById(id); })
            .some(function (el) { return el && el.children.length > 0; });
        }

        return new Promise(function (resolve, reject) {
          var attempts = 0;
          var maxAttempts = 60;
          function poll() {
            if (checkMounted()) {
              parent.postMessage({ source: "nodeless-preview", type: "rendered" }, "*");
              resolve();
              return;
            }
            attempts++;
            if (attempts >= maxAttempts) {
              reject(new Error(
                "Entry module has no default export component to render, and did not mount anything into a recognized root element within 1s. " +
                "If this file is a Vite entry point (e.g. main.tsx) that calls createRoot/render internally, make sure it targets an element with id \\"root\\" or \\"preview-root\\"."
              ));
              return;
            }
            requestAnimationFrame(poll);
          }
          poll();
        });
      });
    `;

        const document = buildShellDocument({
            moduleSource: bundle.moduleSource,
            entryModuleId: bundle.entryModuleId,
            externalSpecifiers: Array.from(externals),
            dependencyVersions: input.dependencyVersions,
            mountScript,
            headInjection: buildCssHeadInjection(input.cssFrameworks),
            mountElementId,
            aliases: input.aliases
        });

        return { document };
    }
};
