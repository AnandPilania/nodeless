import type { CssFrameworkInjector, DetectedCssFramework, VirtualModule } from "./types";

function hasAny(deps: Record<string, string>, names: string[]): string | null {
  for (const name of names) {
    if (deps[name]) return deps[name];
  }
  return null;
}

function hasConfigFile(modules: VirtualModule[], patterns: RegExp[]): boolean {
  return modules.some((m) => patterns.some((p) => p.test(m.path)));
}

const tailwindInjector: CssFrameworkInjector = {
  id: "tailwind",
  detect(dependencyVersions, modules) {
    const version =
      hasAny(dependencyVersions, ["tailwindcss"]) ??
      (hasConfigFile(modules, [/tailwind\.config\.(js|ts|cjs|mjs)$/]) ? "latest" : null);
    if (!version) return null;
    return { id: "tailwind", version };
  },
  buildHeadInjection() {
    return `<script src="https://cdn.tailwindcss.com"></script>`;
  }
};

const bootstrapInjector: CssFrameworkInjector = {
  id: "bootstrap",
  detect(dependencyVersions) {
    const version = hasAny(dependencyVersions, ["bootstrap"]);
    if (!version) return null;
    return { id: "bootstrap", version };
  },
  buildHeadInjection(detected) {
    const versionSuffix = detected.version && detected.version !== "latest"
      ? detected.version.replace(/^[\^~]/, "")
      : "5.3.3";
    return `<link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/bootstrap@${versionSuffix}/dist/css/bootstrap.min.css">`;
  }
};

const bulmaInjector: CssFrameworkInjector = {
  id: "bulma",
  detect(dependencyVersions) {
    const version = hasAny(dependencyVersions, ["bulma"]);
    if (!version) return null;
    return { id: "bulma", version };
  },
  buildHeadInjection(detected) {
    const versionSuffix = detected.version && detected.version !== "latest"
      ? detected.version.replace(/^[\^~]/, "")
      : "1.0.2";
    return `<link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/bulma@${versionSuffix}/css/bulma.min.css">`;
  }
};

const unocssInjector: CssFrameworkInjector = {
  id: "unocss",
  detect(dependencyVersions, modules) {
    const version =
      hasAny(dependencyVersions, ["unocss", "@unocss/core"]) ??
      (hasConfigFile(modules, [/uno\.config\.(js|ts)$/]) ? "latest" : null);
    if (!version) return null;
    return { id: "unocss", version };
  },
  buildHeadInjection() {
    return `<script src="https://cdn.jsdelivr.net/npm/@unocss/runtime"></script>
    <script>window.__unocss = { defaults: { presets: [] } };</script>`;
  }
};

export const cssFrameworkInjectors: CssFrameworkInjector[] = [
  tailwindInjector,
  bootstrapInjector,
  bulmaInjector,
  unocssInjector
];

export function detectCssFrameworks(
  dependencyVersions: Record<string, string>,
  modules: VirtualModule[]
): DetectedCssFramework[] {
  const detected: DetectedCssFramework[] = [];
  for (const injector of cssFrameworkInjectors) {
    const result = injector.detect(dependencyVersions, modules);
    if (result) detected.push(result);
  }
  return detected;
}

export function buildCssHeadInjection(detectedFrameworks: DetectedCssFramework[]): string {
  return detectedFrameworks
    .map((detected) => {
      const injector = cssFrameworkInjectors.find((i) => i.id === detected.id);
      return injector ? injector.buildHeadInjection(detected) : "";
    })
    .join("\n    ");
}
