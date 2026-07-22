import fs from "node:fs/promises";
import path from "node:path";
import { safeResolve } from "./workspace.js";

const CANDIDATE_EXTENSIONS = [".tsx", ".ts", ".jsx", ".js", ".mjs", ".css", ".json"];

const IMPORT_PATTERN = /import\s+(?:[^'"]+?\s+from\s+)?["']([^"']+)["']|require\(\s*["']([^"']+)["']\s*\)|export\s+(?:\*|\{[^}]*\})\s+from\s+["']([^"']+)["']/g;

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

async function resolveFileWithExtensions(absoluteBase: string): Promise<string | null> {
  for (const ext of CANDIDATE_EXTENSIONS) {
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
  entryRelativePath: string
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

    if (!/\.(tsx?|jsx?|mjs)$/.test(relativePath)) {
      continue;
    }

    const specifiers = extractImportSpecifiers(content);
    for (const specifier of specifiers) {
      if (!specifier.startsWith(".")) continue;

      const currentDir = path.dirname(absolutePath);
      const resolvedAbsolute = await resolveFileWithExtensions(path.resolve(currentDir, specifier));
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
