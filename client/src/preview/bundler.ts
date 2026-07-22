import * as Babel from "@babel/standalone";

export interface VirtualModule {
  path: string;
  content: string;
}

export interface BundleOutput {
  entryModuleId: string;
  moduleSource: Record<string, string>;
  externalSpecifiers: string[];
}

function normalizeModuleId(rawPath: string): string {
  return rawPath.replace(/^\.\//, "").replace(/\\/g, "/");
}

function stripExtension(id: string): string {
  return id.replace(/\.(tsx|ts|jsx|js|mjs)$/, "");
}

function isRelativeSpecifier(specifier: string): boolean {
  return specifier.startsWith(".") || specifier.startsWith("/");
}

function languageForPath(filePath: string): "typescript" | "jsx" | "javascript" {
  if (filePath.endsWith(".tsx") || filePath.endsWith(".ts")) return "typescript";
  if (filePath.endsWith(".jsx")) return "jsx";
  return "javascript";
}

function resolveRelative(fromModuleId: string, specifier: string): string {
  const fromDir = fromModuleId.includes("/")
    ? fromModuleId.slice(0, fromModuleId.lastIndexOf("/"))
    : "";
  const parts = (fromDir ? `${fromDir}/${specifier}` : specifier).split("/");
  const resolved: string[] = [];
  for (const part of parts) {
    if (part === "." || part === "") continue;
    if (part === "..") {
      resolved.pop();
      continue;
    }
    resolved.push(part);
  }
  return resolved.join("/");
}

function findModuleKey(
  modulesById: Map<string, VirtualModule>,
  candidateId: string
): string | null {
  const stripped = stripExtension(candidateId);
  const extensions = [".tsx", ".ts", ".jsx", ".js", ".mjs", ".css", ".json"];

  for (const ext of extensions) {
    const withExt = `${stripped}${ext}`;
    if (modulesById.has(withExt)) return withExt;
  }
  if (modulesById.has(candidateId)) return candidateId;

  for (const ext of extensions) {
    const indexPath = `${stripped}/index${ext}`;
    if (modulesById.has(indexPath)) return indexPath;
  }
  return null;
}

export function transpileModule(filePath: string, source: string): string {
  if (filePath.endsWith(".css") || filePath.endsWith(".json")) {
    return source;
  }

  const result = Babel.transform(source, {
    filename: filePath,
    presets: [
      ["react", { runtime: "classic" }],
      languageForPath(filePath) === "typescript" ? "typescript" : undefined
    ].filter(Boolean) as (string | [string, Record<string, unknown>])[],
    plugins: ["transform-modules-commonjs"],
    sourceType: "module",
    retainLines: true
  });

  if (!result.code) {
    throw new Error(`Babel produced no output for ${filePath}`);
  }
  return result.code;
}

export function buildBundle(entryPath: string, modules: VirtualModule[]): BundleOutput {
  const modulesById = new Map<string, VirtualModule>();
  for (const mod of modules) {
    modulesById.set(normalizeModuleId(mod.path), mod);
  }

  const entryId = normalizeModuleId(entryPath);
  const moduleSource: Record<string, string> = {};
  const externalSpecifiers = new Set<string>();
  const visited = new Set<string>();

  function visit(moduleId: string): void {
    if (visited.has(moduleId)) return;
    visited.add(moduleId);

    const mod = modulesById.get(moduleId);
    if (!mod) return;

    if (moduleId.endsWith(".css")) {
      moduleSource[moduleId] = JSON.stringify(mod.content);
      return;
    }
    if (moduleId.endsWith(".json")) {
      moduleSource[moduleId] = `module.exports = ${mod.content};`;
      return;
    }

    let transpiled: string;
    try {
      transpiled = transpileModule(moduleId, mod.content);
    } catch (err) {
      throw new Error(`${moduleId}: ${(err as Error).message}`);
    }

    const importPattern = /(?:import\s+(?:[^'"]+?\s+from\s+)?["']([^"']+)["'])|(?:require\(\s*["']([^"']+)["']\s*\))|(?:export\s+(?:\*|\{[^}]*\})\s+from\s+["']([^"']+)["'])/g;
    let match: RegExpExecArray | null;
    while ((match = importPattern.exec(transpiled)) !== null) {
      const specifier = match[1] ?? match[2] ?? match[3];
      if (!specifier) continue;

      if (isRelativeSpecifier(specifier)) {
        const resolvedId = resolveRelative(moduleId, specifier);
        const actualKey = findModuleKey(modulesById, resolvedId);
        if (actualKey) {
          visit(actualKey);
        }
      } else {
        externalSpecifiers.add(specifier);
      }
    }

    moduleSource[moduleId] = transpiled;
  }

  visit(entryId);

  return {
    entryModuleId: entryId,
    moduleSource,
    externalSpecifiers: Array.from(externalSpecifiers)
  };
}
