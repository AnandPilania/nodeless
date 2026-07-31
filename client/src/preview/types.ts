export interface VirtualModule {
    path: string;
    content: string;
}

export interface AliasEntry {
    find: string;
    replacementRelative: string;
}

export interface PreviewCompileInput {
    entryPath: string;
    modules: VirtualModule[];
    dependencyVersions: Record<string, string>;
    cssFrameworks: DetectedCssFramework[];
    mountElementId?: string;
    aliases?: AliasEntry[];
}

export interface PreviewCompileOutput {
    /** Raw HTML document to place in the sandboxed iframe's srcDoc */
    document: string;
}

export interface PreviewProvider {
    id: string;
    label: string;
    extensions: string[];
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
    detect(dependencyVersions: Record<string, string>, modules: VirtualModule[]): DetectedCssFramework | null;
    buildHeadInjection(detected: DetectedCssFramework): string;
}
