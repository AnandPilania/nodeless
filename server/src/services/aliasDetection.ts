import fs from "node:fs/promises";
import path from "node:path";

export interface AliasEntry {
    find: string;
    replacementAbsolute: string;
}

const CONFIG_FILE_CANDIDATES = [
    "vite.config.ts",
    "vite.config.js",
    "vite.config.mjs",
    "vite.config.cjs"
];

async function readFirstExisting(root: string, candidates: string[]): Promise<{ path: string; content: string } | null> {
    for (const candidate of candidates) {
        const fullPath = path.join(root, candidate);
        try {
            const content = await fs.readFile(fullPath, "utf-8");
            return { path: fullPath, content };
        } catch {
            continue;
        }
    }
    return null;
}

function extractAliasBlockSource(configSource: string): string | null {
    const resolveIndex = configSource.search(/resolve\s*:\s*\{/);
    if (resolveIndex === -1) return null;

    const resolveBraceStart = configSource.indexOf("{", resolveIndex);
    const resolveBraceEnd = findMatchingBrace(configSource, resolveBraceStart);
    if (resolveBraceEnd === -1) return null;

    const resolveBlock = configSource.slice(resolveBraceStart, resolveBraceEnd + 1);

    const aliasIndex = resolveBlock.search(/alias\s*:\s*[{[]/);
    if (aliasIndex === -1) return null;

    const openCharMatch = resolveBlock.slice(aliasIndex).match(/[{[]/);
    const openChar = openCharMatch?.[0] ?? null;
    const aliasOpenIndex = resolveBlock.indexOf(openChar === "[" ? "[" : "{", aliasIndex);
    if (aliasOpenIndex === -1) return null;

    const aliasCloseIndex =
        openChar === "["
            ? findMatchingBracket(resolveBlock, aliasOpenIndex)
            : findMatchingBrace(resolveBlock, aliasOpenIndex);
    if (aliasCloseIndex === -1) return null;

    return resolveBlock.slice(aliasOpenIndex, aliasCloseIndex + 1);
}

function findMatchingBrace(source: string, openIndex: number): number {
    let depth = 0;
    for (let i = openIndex; i < source.length; i++) {
        if (source[i] === "{") depth++;
        if (source[i] === "}") {
            depth--;
            if (depth === 0) return i;
        }
    }
    return -1;
}

function findMatchingBracket(source: string, openIndex: number): number {
    let depth = 0;
    for (let i = openIndex; i < source.length; i++) {
        if (source[i] === "[") depth++;
        if (source[i] === "]") {
            depth--;
            if (depth === 0) return i;
        }
    }
    return -1;
}

function resolveAliasValueExpression(expr: string): string | null {
    const trimmed = expr.trim();

    const callMatch = trimmed.match(/^(?:path\.)?(?:resolve|join)\(\s*__dirname\s*,\s*(['"`])((?:(?!\1).)*)\1\s*\)$/);
    if (callMatch) {
        return callMatch[2];
    }

    const bareStringMatch = trimmed.match(/^(['"`])((?:(?!\1).)*)\1$/);
    if (bareStringMatch) {
        return bareStringMatch[2];
    }

    return null;
}

interface RawAliasPair {
    key: string;
    valueExpr: string;
}

function parseObjectEntries(blockSource: string): RawAliasPair[] {
    const inner = blockSource.trim().replace(/^\{/, "").replace(/\}$/, "");
    const pairs: RawAliasPair[] = [];

    let i = 0;
    while (i < inner.length) {
        while (i < inner.length && /[\s,]/.test(inner[i])) i++;
        if (i >= inner.length) break;

        let key: string | null = null;
        const quoteMatch = inner.slice(i).match(/^(['"`])((?:(?!\1).)*)\1/);
        if (quoteMatch) {
            key = quoteMatch[2];
            i += quoteMatch[0].length;
        } else {
            const identMatch = inner.slice(i).match(/^[A-Za-z_$][A-Za-z0-9_$]*/);
            if (!identMatch) break;
            key = identMatch[0];
            i += identMatch[0].length;
        }

        while (i < inner.length && /\s/.test(inner[i])) i++;
        if (inner[i] !== ":") break;
        i++;
        while (i < inner.length && /\s/.test(inner[i])) i++;

        const valueStart = i;
        let depth = 0;
        while (i < inner.length) {
            const ch = inner[i];
            if (ch === "(" || ch === "[" || ch === "{") depth++;
            if (ch === ")" || ch === "]" || ch === "}") depth--;
            if (ch === "," && depth === 0) break;
            i++;
        }
        const valueExpr = inner.slice(valueStart, i).trim();
        if (key && valueExpr) {
            pairs.push({ key, valueExpr });
        }
    }

    return pairs;
}

function parseAliasObjectEntries(blockSource: string, configDir: string): AliasEntry[] {
    const entries: AliasEntry[] = [];

    if (blockSource.trim().startsWith("[")) {
        const objectPattern = /\{([^{}]*)\}/g;
        let match: RegExpExecArray | null;
        while ((match = objectPattern.exec(blockSource)) !== null) {
            const body = match[1];
            const findMatch = body.match(/find\s*:\s*(['"`])((?:(?!\1).)*)\1/);
            const replacementMatch = body.match(/replacement\s*:\s*([^,}]+)/);
            if (!findMatch || !replacementMatch) continue;
            const resolved = resolveAliasValueExpression(replacementMatch[1]);
            if (resolved === null) continue;
            entries.push({
                find: findMatch[2],
                replacementAbsolute: path.resolve(configDir, resolved)
            });
        }
        return entries;
    }

    for (const { key, valueExpr } of parseObjectEntries(blockSource)) {
        const resolved = resolveAliasValueExpression(valueExpr);
        if (resolved === null) continue;
        entries.push({
            find: key,
            replacementAbsolute: path.resolve(configDir, resolved)
        });
    }

    return entries;
}

async function readTsconfigPaths(root: string): Promise<AliasEntry[]> {
    for (const filename of ["tsconfig.json", "jsconfig.json"]) {
        const fullPath = path.join(root, filename);
        let raw: string;
        try {
            raw = await fs.readFile(fullPath, "utf-8");
        } catch {
            continue;
        }

        try {
            const withoutComments = raw.replace(/\/\/.*$/gm, "").replace(/\/\*[\s\S]*?\*\//g, "");
            const parsed = JSON.parse(withoutComments) as {
                compilerOptions?: { baseUrl?: string; paths?: Record<string, string[]> };
            };
            const baseUrl = parsed.compilerOptions?.baseUrl ?? ".";
            const paths = parsed.compilerOptions?.paths ?? {};
            const baseDir = path.resolve(root, baseUrl);

            const entries: AliasEntry[] = [];
            for (const [pattern, targets] of Object.entries(paths)) {
                if (!targets[0]) continue;
                const find = pattern.replace(/\/\*$/, "");
                const target = targets[0].replace(/\/\*$/, "");
                entries.push({ find, replacementAbsolute: path.resolve(baseDir, target) });
            }
            if (entries.length > 0) return entries;
        } catch {
            continue;
        }
    }
    return [];
}

export async function detectAliases(root: string): Promise<AliasEntry[]> {
    const configFile = await readFirstExisting(root, CONFIG_FILE_CANDIDATES);
    if (configFile) {
        const blockSource = extractAliasBlockSource(configFile.content);
        if (blockSource) {
            const configDir = path.dirname(configFile.path);
            const entries = parseAliasObjectEntries(blockSource, configDir);
            if (entries.length > 0) return entries;
        }
    }

    return readTsconfigPaths(root);
}
