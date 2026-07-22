import type { FileNode } from "../types";

function collectHtmlPaths(node: FileNode, acc: string[]): void {
  if (node.type === "file" && /(^|\/)index\.html$/i.test(node.path)) {
    acc.push(node.path);
  }
  if (node.children) {
    for (const child of node.children) {
      collectHtmlPaths(child, acc);
    }
  }
}

function pickBestIndexHtml(paths: string[]): string | null {
  if (paths.length === 0) return null;
  const sorted = [...paths].sort((a, b) => a.split("/").length - b.split("/").length);
  return sorted[0];
}

export function findIndexHtmlPath(tree: FileNode): string | null {
  const paths: string[] = [];
  collectHtmlPaths(tree, paths);
  return pickBestIndexHtml(paths);
}

export function extractMountElementId(htmlContent: string): string | null {
  const bodyMatch = htmlContent.match(/<body[^>]*>([\s\S]*?)<\/body>/i);
  const searchArea = bodyMatch ? bodyMatch[1] : htmlContent;
  const idMatch = searchArea.match(/<div[^>]*\bid=["']([^"']+)["'][^>]*>/i);
  return idMatch ? idMatch[1] : null;
}
