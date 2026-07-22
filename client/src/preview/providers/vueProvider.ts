import { compileScript, compileStyle, compileTemplate, parse } from "@vue/compiler-sfc";
import { buildGraphBundle } from "../graphBundler";
import { buildShellDocument } from "../shell";
import { buildCssHeadInjection } from "../cssFrameworks";
import { IMPORT_META_SHIM_DECLARATION, importMetaShimPlugin } from "../importMetaShim";
import type { PreviewCompileInput, PreviewCompileOutput, PreviewProvider } from "../types";

let sfcCounter = 0;

function compileVueSfc(filePath: string, source: string): string {
    const id = `sfc-${sfcCounter++}-${filePath.replace(/[^a-zA-Z0-9]/g, "_")}`;
    const { descriptor, errors } = parse(source, { filename: filePath });

    if (errors.length > 0) {
        throw new Error(errors.map((e) => e.message).join("; "));
    }

    const hasScript = Boolean(descriptor.script || descriptor.scriptSetup);
    const script = hasScript
        ? compileScript(descriptor, { id })
        : { content: "export default {};", bindings: {} };

    let renderSource = "";
    if (descriptor.template) {
        const template = compileTemplate({
            source: descriptor.template.content,
            filename: filePath,
            id,
            compilerOptions: { bindingMetadata: script.bindings }
        });
        if (template.errors.length > 0) {
            throw new Error(template.errors.map((e) => String(e)).join("; "));
        }
        renderSource = template.code;
    }

    let styleInjection = "";
    for (const styleBlock of descriptor.styles) {
        const compiledStyle = compileStyle({
            source: styleBlock.content,
            filename: filePath,
            id: `data-v-${id}`,
            scoped: styleBlock.scoped
        });
        styleInjection += `
(function() {
  var styleTag = document.createElement("style");
  styleTag.textContent = ${JSON.stringify(compiledStyle.code)};
  document.head.appendChild(styleTag);
})();
`;
    }

    const hasScopedStyle = descriptor.styles.some((s) => s.scoped);

    return `
// --- compiled script block ---
${script.content}

// --- compiled template block ---
${renderSource}

// --- style injection ---
${styleInjection}

// --- component assembly ---
${renderSource ? "__vueSfcDefault.render = render;" : ""}
${hasScopedStyle ? `__vueSfcDefault.__scopeId = "data-v-${id}";` : ""}
`.replace("export default", "const __vueSfcDefault =") + "\nexport default __vueSfcDefault;\n";
}

export const vueProvider: PreviewProvider = {
    id: "vue",
    label: "Vue",
    extensions: [".vue"],

    detect(filePath) {
        return filePath.endsWith(".vue");
    },

    async compile(input: PreviewCompileInput): Promise<PreviewCompileOutput> {
        const Babel = await import("@babel/standalone");

        function transpile(filePath: string, source: string): string {
            if (filePath.endsWith(".vue")) {
                const compiledEsm = compileVueSfc(filePath, source);
                const result = Babel.transform(compiledEsm, {
                    filename: filePath,
                    presets: [],
                    plugins: [importMetaShimPlugin, "transform-modules-commonjs"],
                    sourceType: "module",
                    retainLines: false
                });
                if (!result.code) throw new Error(`Vue compile produced no output for ${filePath}`);
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

        const bundle = buildGraphBundle(input.entryPath, input.modules, transpile);

        const externals = new Set(bundle.externalSpecifiers);
        externals.add("vue");

        const mountElementIdJson = JSON.stringify(input.mountElementId ?? null);

        const mountScript = `
      return loadExternal("vue").then(function (Vue) {
        const entryExports = instantiate(${JSON.stringify(bundle.entryModuleId)});
        const component = entryExports.default || entryExports;

        if (component && typeof component === "object") {
          const rootEl = document.getElementById("preview-root");
          const app = Vue.createApp(component);
          app.mount(rootEl);
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
            mountElementId: input.mountElementId
        });

        return { document };
    }
};
