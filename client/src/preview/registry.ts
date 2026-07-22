import type { PreviewProvider } from "./types";
import { reactProvider } from "./providers/reactProvider";
import { vueProvider } from "./providers/vueProvider";
import { svelteProvider } from "./providers/svelteProvider";
import { htmlProvider } from "./providers/htmlProvider";

export const previewProviders: PreviewProvider[] = [
    vueProvider,
    svelteProvider,
    htmlProvider,
    reactProvider
];

export function resolveProvider(filePath: string, content: string): PreviewProvider | null {
    for (const provider of previewProviders) {
        if (provider.detect(filePath, content)) {
            return provider;
        }
    }
    return null;
}
