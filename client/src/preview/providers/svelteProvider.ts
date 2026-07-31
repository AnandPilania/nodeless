import { compile } from "svelte/compiler";
import { buildGraphBundle } from "../graphBundler";
import { buildShellDocument } from "../shell";
import { buildCssHeadInjection } from "../cssFrameworks";
import { IMPORT_META_SHIM_DECLARATION, importMetaShimPlugin } from "../importMetaShim";
import type { PreviewCompileInput, PreviewCompileOutput, PreviewProvider } from "../types";

async function compileSvelteFile(filePath: string, source: string): Promise<string> {
    const result = compile(source, {
        filename: filePath,
        generate: "client",
        css: "external"
    });

    const cssInjection = result.css?.code
        ? `
(function() {
  var styleTag = document.createElement("style");
  styleTag.textContent = ${JSON.stringify(result.css.code)};
  document.head.appendChild(styleTag);
})();
`
        : "";

    return `${result.js.code}\n${cssInjection}`;
}

export const svelteProvider: PreviewProvider = {
    id: "svelte",
    label: "Svelte",
    extensions: [".svelte"],

    detect(filePath) {
        return filePath.endsWith(".svelte");
    },

    async compile(input: PreviewCompileInput): Promise<PreviewCompileOutput> {
        const Babel = await import("@babel/standalone");
        const svelteFileCache = new Map<string, string>();

        for (const mod of input.modules) {
            if (mod.path.endsWith(".svelte")) {
                svelteFileCache.set(mod.path, await compileSvelteFile(mod.path, mod.content));
            }
        }

        function transpile(filePath: string, source: string): string {
            if (filePath.endsWith(".svelte")) {
                const compiled = svelteFileCache.get(filePath);
                if (compiled === undefined) {
                    throw new Error(`Svelte compilation missing for ${filePath}`);
                }
                const result = Babel.transform(compiled, {
                    filename: filePath,
                    plugins: [importMetaShimPlugin, "transform-modules-commonjs"],
                    sourceType: "module"
                });
                if (!result.code) throw new Error(`Svelte->CJS transform produced no output for ${filePath}`);
                return `${IMPORT_META_SHIM_DECLARATION}\n${result.code}`;
            }

            const isTs = filePath.endsWith(".ts");
            const result = Babel.transform(source, {
                filename: filePath,
                presets: [isTs ? "typescript" : undefined].filter(Boolean) as string[],
                plugins: [importMetaShimPlugin, "transform-modules-commonjs"],
                sourceType: "module",
                retainLines: true
            });
            if (!result.code) throw new Error(`Babel produced no output for ${filePath}`);
            return `${IMPORT_META_SHIM_DECLARATION}\n${result.code}`;
        }

        const bundle = buildGraphBundle(input.entryPath, input.modules, transpile, input.aliases ?? []);

        const externals = new Set(bundle.externalSpecifiers);
        externals.add("svelte");
        externals.add("svelte/internal/client");
        externals.add("svelte/internal/disclose-version");

        const mountElementIdJson = JSON.stringify(input.mountElementId ?? null);

        const mountScript = `
      return loadExternal("svelte").then(function (SvelteRuntime) {
        const entryExports = instantiate(${JSON.stringify(bundle.entryModuleId)});
        const Component = entryExports.default || entryExports;

        if (typeof Component === "function") {
          const rootEl = document.getElementById("preview-root");
          SvelteRuntime.mount(Component, { target: rootEl });
          parent.postMessage({ source: "nodeless-preview", type: "rendered" }, "*");
          return;
        }

        const candidateIds = [${mountElementIdJson}, "app", "root", "preview-root"].filter(Boolean);
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
              reject(new Error("Entry module has no default export component to mount, and did not mount anything into a recognized root element within 1s."));
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
            mountElementId: input.mountElementId,
            aliases: input.aliases
        });

        return { document };
    }
};
