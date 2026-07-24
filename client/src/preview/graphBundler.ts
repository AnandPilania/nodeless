import type { VirtualModule } from "./types";

export interface GraphBundleOutput {
    entryModuleId: string;
    moduleSource: Record<string, string>;
    externalSpecifiers: string[];
}

export type TranspileFn = (filePath: string, source: string) => string;

const KNOWN_EXTENSIONS = [".tsx", ".ts", ".jsx", ".js", ".mjs", ".vue", ".svelte", ".css", ".json"];

const IMPORT_PATTERN =
    /(?:import\s+(?:[^'"]+?\s+from\s+)?["']([^"']+)["'])|(?:require\(\s*["']([^"']+)["']\s*\))|(?:export\s+(?:\*|\{[^}]*\})\s+from\s+["']([^"']+)["'])/g;

function normalizeModuleId(rawPath: string): string {
    return rawPath.replace(/^\.\//, "").replace(/\\/g, "/");
}

function stripExtension(id: string): string {
    return id.replace(/\.(tsx|ts|jsx|js|mjs|vue|svelte)$/, "");
}

function isRelativeSpecifier(specifier: string): boolean {
    return specifier.startsWith(".") || specifier.startsWith("/");
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

function findModuleKey(modulesById: Map<string, VirtualModule>, candidateId: string): string | null {
    const stripped = stripExtension(candidateId);

    for (const ext of KNOWN_EXTENSIONS) {
        const withExt = `${stripped}${ext}`;
        if (modulesById.has(withExt)) return withExt;
    }
    if (modulesById.has(candidateId)) return candidateId;

    for (const ext of KNOWN_EXTENSIONS) {
        const indexPath = `${stripped}/index${ext}`;
        if (modulesById.has(indexPath)) return indexPath;
    }
    return null;
}

export function buildGraphBundle(
    entryPath: string,
    modules: VirtualModule[],
    transpile: TranspileFn
): GraphBundleOutput {
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
            transpiled = transpile(moduleId, mod.content);
        } catch (err) {
            throw new Error(`${moduleId}: ${(err as Error).message}`);
        }

        const pattern = new RegExp(IMPORT_PATTERN);
        let match: RegExpExecArray | null;
        while ((match = pattern.exec(transpiled)) !== null) {
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
