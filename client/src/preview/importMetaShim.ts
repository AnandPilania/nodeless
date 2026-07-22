interface BabelPluginApi {
    types: {
        identifier: (name: string) => unknown;
    };
}

export function importMetaShimPlugin(api: BabelPluginApi) {
    const t = api.types;
    return {
        name: "shim-import-meta",
        visitor: {
            MetaProperty(path: { node: { meta?: { name?: string }; property?: { name?: string } }; replaceWith: (node: unknown) => void }) {
                const node = path.node;
                if (node.meta?.name === "import" && node.property?.name === "meta") {
                    path.replaceWith(t.identifier("__importMeta"));
                }
            }
        }
    };
}

export const IMPORT_META_SHIM_DECLARATION =
    'const __importMeta = { env: {}, url: "", hot: undefined };';
