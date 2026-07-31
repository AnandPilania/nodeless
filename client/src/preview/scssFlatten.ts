interface CssRule {
    selector: string;
    declarations: string[];
}

export function flattenScssNesting(source: string): string {
    const stripped = stripComments(source);
    const rules: CssRule[] = [];
    const passthroughAtRules: string[] = [];

    parseBlock(stripped, [], rules, passthroughAtRules);

    const ruleText = rules
        .filter((rule) => rule.declarations.length > 0)
        .map((rule) => `${rule.selector} {\n${rule.declarations.map((d) => `  ${d}`).join("\n")}\n}`)
        .join("\n\n");

    return [...passthroughAtRules, ruleText].filter(Boolean).join("\n\n");
}

function stripComments(source: string): string {
    return source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");
}

function joinSelectors(parents: string[], childSelectorGroup: string): string[] {
    const childSelectors = splitTopLevel(childSelectorGroup, ",").map((s) => s.trim()).filter(Boolean);
    if (parents.length === 0) {
        return childSelectors;
    }

    const combined: string[] = [];
    for (const parent of parents) {
        for (const child of childSelectors) {
            if (child.includes("&")) {
                combined.push(child.replace(/&/g, parent));
            } else {
                combined.push(`${parent} ${child}`);
            }
        }
    }
    return combined;
}

function splitTopLevel(text: string, separator: string): string[] {
    const parts: string[] = [];
    let depth = 0;
    let current = "";
    for (const char of text) {
        if (char === "(" || char === "[") depth++;
        if (char === ")" || char === "]") depth--;
        if (char === separator && depth === 0) {
            parts.push(current);
            current = "";
        } else {
            current += char;
        }
    }
    parts.push(current);
    return parts;
}

function parseBlock(
    source: string,
    parentSelectors: string[],
    rules: CssRule[],
    passthroughAtRules: string[]
): void {
    let i = 0;
    let currentSelector = "";
    let currentDeclarations: string[] = [];

    function flushDeclarationsAsRule() {
        if (parentSelectors.length > 0 && currentDeclarations.length > 0) {
            rules.push({ selector: parentSelectors.join(", "), declarations: [...currentDeclarations] });
        }
        currentDeclarations = [];
    }

    while (i < source.length) {
        const char = source[i];

        if (char === "{") {
            const selectorText = currentSelector.trim();
            currentSelector = "";

            if (selectorText.startsWith("@")) {
                const blockEnd = findMatchingBrace(source, i);
                const innerContent = source.slice(i + 1, blockEnd);

                if (/^@(media|supports|font-face|keyframes|-webkit-keyframes|page)/.test(selectorText)) {
                    if (/^@(font-face|page)/.test(selectorText)) {
                        passthroughAtRules.push(`${selectorText} {\n${innerContent.trim()}\n}`);
                    } else {
                        const nestedRules: CssRule[] = [];
                        const nestedPassthrough: string[] = [];
                        parseBlock(innerContent, parentSelectors.length ? parentSelectors : ["&"], nestedRules, nestedPassthrough);
                        const body = nestedRules
                            .filter((r) => r.declarations.length > 0)
                            .map((r) => {
                                const sel = r.selector === "&" ? (parentSelectors[0] ?? "") : r.selector;
                                return `  ${sel} {\n${r.declarations.map((d) => `    ${d}`).join("\n")}\n  }`;
                            })
                            .join("\n\n");
                        passthroughAtRules.push(`${selectorText} {\n${body || innerContent.trim()}\n}`);
                    }
                } else {
                    passthroughAtRules.push(`${selectorText} {\n${innerContent.trim()}\n}`);
                }

                i = blockEnd + 1;
                continue;
            }

            const blockEnd = findMatchingBrace(source, i);
            const innerContent = source.slice(i + 1, blockEnd);
            const resolvedSelectors = joinSelectors(parentSelectors, selectorText);

            parseBlock(innerContent, resolvedSelectors, rules, passthroughAtRules);

            i = blockEnd + 1;
            continue;
        }

        if (char === ";") {
            const decl = currentSelector.trim();
            currentSelector = "";
            if (decl) {
                currentDeclarations.push(decl.endsWith(";") ? decl : `${decl};`);
            }
            i++;
            continue;
        }

        currentSelector += char;
        i++;
    }

    const trailingDecl = currentSelector.trim();
    if (trailingDecl) {
        currentDeclarations.push(trailingDecl.endsWith(";") ? trailingDecl : `${trailingDecl};`);
    }

    flushDeclarationsAsRule();
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
    return source.length;
}
