export interface VirtualModule {
  path: string;
  content: string;
}

export interface PreviewCompileInput {
  entryPath: string;
  modules: VirtualModule[];
  dependencyVersions: Record<string, string>;
  cssFrameworks: DetectedCssFramework[];
  /**
   * The DOM element id the real project's index.html mounts into (e.g. "root",
   * "app"), detected by scanning the workspace for an index.html and extracting
   * the first element id inside <body>. Falls back to undefined when no
   * index.html was found or none could be parsed - providers should treat that
   * as "try common conventions" rather than a hard failure.
   */
  mountElementId?: string;
}

export interface PreviewCompileOutput {
  /** Raw HTML document to place in the sandboxed iframe's srcDoc */
  document: string;
}

export interface PreviewProvider {
  id: string;
  label: string;
  /** File extensions this provider claims outright, no content sniffing needed */
  extensions: string[];
  /**
   * Given a file path and its source, decide if this provider should handle it.
   * Called only for extensions not exclusively owned by another provider,
   * or when multiple providers share an extension (e.g. .js can be plain JS or JSX-flavored).
   */
  detect(filePath: string, content: string): boolean;
  compile(input: PreviewCompileInput): Promise<PreviewCompileOutput>;
}

export type CssFrameworkId = "tailwind" | "bootstrap" | "bulma" | "unocss";

export interface DetectedCssFramework {
  id: CssFrameworkId;
  version: string | null;
}

export interface CssFrameworkInjector {
  id: CssFrameworkId;
  /** Detect from package.json deps + presence of config files in the module graph */
  detect(dependencyVersions: Record<string, string>, modules: VirtualModule[]): DetectedCssFramework | null;
  /** Returns HTML fragments (link/script tags, or inline <style>) to inject into <head> */
  buildHeadInjection(detected: DetectedCssFramework): string;
}
