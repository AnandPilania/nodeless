import { buildCssHeadInjection } from "../cssFrameworks";
import { SANDBOX_COMPAT_SHIM } from "../shell";
import type { PreviewCompileInput, PreviewCompileOutput, PreviewProvider, VirtualModule } from "../types";

function normalize(rawPath: string): string {
  return rawPath.replace(/^\.\//, "").replace(/^\//, "").replace(/\\/g, "/");
}

function findModule(modules: VirtualModule[], entryDir: string, href: string): VirtualModule | null {
  const combined = href.startsWith("/") ? href.slice(1) : `${entryDir}${entryDir ? "/" : ""}${href}`;
  const normalized = normalize(combined);
  return modules.find((m) => normalize(m.path) === normalized) ?? null;
}

export const htmlProvider: PreviewProvider = {
  id: "html",
  label: "HTML",
  extensions: [".html", ".htm"],

  detect(filePath) {
    return filePath.endsWith(".html") || filePath.endsWith(".htm");
  },

  async compile(input: PreviewCompileInput): Promise<PreviewCompileOutput> {
    const entry = input.modules.find((m) => m.path === input.entryPath);
    if (!entry) {
      throw new Error(`Entry file not found: ${input.entryPath}`);
    }

    const entryDir = input.entryPath.includes("/")
      ? input.entryPath.slice(0, input.entryPath.lastIndexOf("/"))
      : "";

    // Strip a UTF-8 BOM if present and trim leading whitespace/newlines, since a
    // browser's HTML parser only recognizes <!doctype html> as a doctype when it is
    // the very first thing in the document - any character before it (including an
    // invisible BOM) causes the parser to treat it as a stray tag / quirks-mode HTML
    // and can surface as an "unknown <!doctype ..." style parse complaint.
    let html = entry.content.replace(/^\uFEFF/, "").replace(/^\s+/, "");

    html = html.replace(
      /<link\s+[^>]*rel=["']stylesheet["'][^>]*href=["']([^"']+)["'][^>]*>/gi,
      (fullMatch, href: string) => {
        if (/^https?:\/\//.test(href)) return fullMatch;
        const mod = findModule(input.modules, entryDir, href);
        if (!mod) return fullMatch;
        return `<style>${mod.content}</style>`;
      }
    );

    html = html.replace(
      /<script\s+[^>]*src=["']([^"']+)["'][^>]*><\/script>/gi,
      (fullMatch, src: string) => {
        if (/^https?:\/\//.test(src)) return fullMatch;
        const mod = findModule(input.modules, entryDir, src);
        if (!mod) return fullMatch;
        return `<script>${mod.content}</script>`;
      }
    );

    const headInjection = buildCssHeadInjection(input.cssFrameworks);
    const errorBoundaryScript = `
      <script>
        window.onerror = function (message, _source, _line, _col, error) {
          parent.postMessage({ source: "nodeless-preview", type: "error", message: String(message), stack: error && error.stack ? error.stack : String(message) }, "*");
          return false;
        };
        window.addEventListener("load", function () {
          parent.postMessage({ source: "nodeless-preview", type: "rendered" }, "*");
        });
      </script>
    `;

    let bodyDocument: string;
    if (/<head[^>]*>/i.test(html)) {
      bodyDocument = html.replace(/<head([^>]*)>/i, `<head$1>${SANDBOX_COMPAT_SHIM}${headInjection}${errorBoundaryScript}`);
    } else if (/<html[^>]*>/i.test(html)) {
      bodyDocument = html.replace(/<html([^>]*)>/i, `<html$1><head>${SANDBOX_COMPAT_SHIM}${headInjection}${errorBoundaryScript}</head>`);
    } else {
      bodyDocument = `<html><head>${SANDBOX_COMPAT_SHIM}${headInjection}${errorBoundaryScript}</head><body>${html}</body></html>`;
    }

    // Guarantee exactly one doctype declaration sits at the very start of the final
    // document, regardless of whether the source file already had one.
    const withoutLeadingDoctype = bodyDocument.replace(/^<!doctype\s+html\s*>\s*/i, "");
    const document = `<!doctype html>\n${withoutLeadingDoctype}`;

    return { document };
  }
};
