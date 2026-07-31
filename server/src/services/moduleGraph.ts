import fs from "node:fs/promises";
import path from "node:path";
import { safeResolve } from "./workspace.js";
import type { AliasEntry } from "./aliasDetection.js";

const CANDIDATE_EXTENSIONS = [".tsx", ".ts", ".jsx", ".js", ".mjs", ".css", ".scss", ".sass", ".less", ".json"];

const IMPORT_PATTERN = /import\s+(?:[^'"]+?\s+from\s+)?["']([^"']+)["']|require\(\s*["']([^"']+)["']\s*\)|export\s+(?:\*|\{[^}]*\})\s+from\s+["']([^"']+)["']/g;

const STYLE_IMPORT_PATTERN = /@(?:import|use|forward)\s+["']([^"']+)["']/g;

export interface ResolvedModule {
    path: string;
    content: string;
}

function extractImportSpecifiers(source: string): string[] {
    const specifiers: string[] = [];
    let match: RegExpExecArray | null;
    const pattern = new RegExp(IMPORT_PATTERN);
    while ((match = pattern.exec(source)) !== null) {
        const specifier = match[1] ?? match[2] ?? match[3];
        if (specifier) specifiers.push(specifier);
    }
    return specifiers;
}

function extractStyleImportSpecifiers(source: string): string[] {
    const specifiers: string[] = [];
    let match: RegExpExecArray | null;
    const pattern = new RegExp(STYLE_IMPORT_PATTERN);
    while ((match = pattern.exec(source)) !== null) {
        if (match[1]) specifiers.push(match[1]);
    }
    return specifiers;
}

function resolveAliasSpecifier(specifier: string, aliases: AliasEntry[]): string | null {
    let best: AliasEntry | null = null;
    for (const alias of aliases) {
        const prefix = alias.find;
        const matchesExactly = specifier === prefix;
        const matchesWithSlash = specifier.startsWith(prefix.endsWith("/") ? prefix : `${prefix}/`);
        if (!matchesExactly && !matchesWithSlash) continue;
        if (!best || prefix.length > best.find.length) {
            best = alias;
        }
    }
    if (!best) return null;

    const remainder = specifier.slice(best.find.length).replace(/^\/+/, "");
    return remainder ? path.join(best.replacementAbsolute, remainder) : best.replacementAbsolute;
}

async function resolveFileWithExtensions(absoluteBase: string): Promise<string | null> {
    const dir = path.dirname(absoluteBase);
    const base = path.basename(absoluteBase);
    const isAlreadyPartial = base.startsWith("_");

    for (const ext of CANDIDATE_EXTENSIONS) {
        const isScssLikeExt = ext === ".scss" || ext === ".sass";

        if (isScssLikeExt && !isAlreadyPartial) {
            const partialCandidate = path.join(dir, `_${base}${ext}`);
            try {
                await fs.access(partialCandidate);
                return partialCandidate;
            } catch {
                // no partial with this name - fall through to the plain filename below
            }
        }

        const candidate = `${absoluteBase}${ext}`;
        try {
            await fs.access(candidate);
            return candidate;
        } catch {
            continue;
        }
    }

    for (const ext of CANDIDATE_EXTENSIONS) {
        const candidate = path.join(absoluteBase, `index${ext}`);
        try {
            await fs.access(candidate);
            return candidate;
        } catch {
            continue;
        }
    }
    try {
        await fs.access(absoluteBase);
        return absoluteBase;
    } catch {
        return null;
    }
}

export async function collectLocalModuleGraph(
    root: string,
    entryRelativePath: string,
    aliases: AliasEntry[] = []
): Promise<ResolvedModule[]> {
    const visited = new Map<string, string>();
    const queue: string[] = [entryRelativePath];

    while (queue.length > 0) {
        const relativePath = queue.shift()!;
        if (visited.has(relativePath)) continue;

        const absolutePath = safeResolve(root, relativePath);
        let content: string;
        try {
            content = await fs.readFile(absolutePath, "utf-8");
        } catch {
            continue;
        }

        visited.set(relativePath, content);

        const isJsLike = /\.(tsx?|jsx?|mjs)$/.test(relativePath);
        const isStyleLike = /\.(css|scss|sass|less)$/.test(relativePath);

        if (!isJsLike && !isStyleLike) {
            continue;
        }

        const specifiers = isStyleLike ? extractStyleImportSpecifiers(content) : extractImportSpecifiers(content);
        for (const specifier of specifiers) {
            let targetAbsoluteBase: string | null = null;

            if (specifier.startsWith(".")) {
                const currentDir = path.dirname(absolutePath);
                targetAbsoluteBase = path.resolve(currentDir, specifier);
            } else {
                const aliasResolved = resolveAliasSpecifier(specifier, aliases);
                if (aliasResolved) {
                    targetAbsoluteBase = aliasResolved;
                }
            }

            if (!targetAbsoluteBase) continue;

            const resolvedAbsolute = await resolveFileWithExtensions(targetAbsoluteBase);
            if (!resolvedAbsolute) continue;

            const resolvedRelative = path.relative(root, resolvedAbsolute);
            if (!visited.has(resolvedRelative)) {
                queue.push(resolvedRelative);
            }
        }
    }

    return Array.from(visited.entries()).map(([modulePath, content]) => ({
        path: modulePath,
        content
    }));
}
