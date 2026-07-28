import fs from "node:fs/promises";
import path from "node:path";
import type { FileNode, PackageInfo } from "../types/index.js";

const IGNORED_DIR_NAMES = new Set([
    "node_modules",
    ".git",
    "dist",
    "build",
    ".next",
    ".turbo",
    ".cache",
    "coverage"
]);

const FRAMEWORK_SIGNATURES: Record<string, string[]> = {
    express: ["express"],
    fastify: ["fastify"],
    nestjs: ["@nestjs/core"],
    koa: ["koa"],
    next: ["next"],
    hapi: ["@hapi/hapi"],
    prisma: ["prisma", "@prisma/client"],
    typeorm: ["typeorm"],
    sequelize: ["sequelize"],
    mongoose: ["mongoose"],
    socketio: ["socket.io"],
    graphql: ["graphql", "apollo-server"]
};

export async function resolveWorkspaceRoot(root: string): Promise<string> {
    const resolved = path.resolve(root);
    const stat = await fs.stat(resolved);
    if (!stat.isDirectory()) {
        throw new Error(`Workspace root is not a directory: ${resolved}`);
    }
    return resolved;
}

export async function buildFileTree(
    root: string,
    maxDepth = 6
): Promise<FileNode> {
    async function walk(dirPath: string, depth: number): Promise<FileNode> {
        const name = path.basename(dirPath) || dirPath;
        const node: FileNode = {
            name,
            path: path.relative(root, dirPath) || ".",
            type: "directory",
            children: []
        };

        if (depth >= maxDepth) {
            return node;
        }

        const entries = await fs.readdir(dirPath, { withFileTypes: true });
        entries.sort((a, b) => {
            if (a.isDirectory() && !b.isDirectory()) return -1;
            if (!a.isDirectory() && b.isDirectory()) return 1;
            return a.name.localeCompare(b.name);
        });

        for (const entry of entries) {
            if (entry.name.startsWith(".") && entry.name !== ".env") continue;
            if (IGNORED_DIR_NAMES.has(entry.name)) continue;

            const fullPath = path.join(dirPath, entry.name);
            if (entry.isDirectory()) {
                node.children!.push(await walk(fullPath, depth + 1));
            } else if (entry.isFile()) {
                node.children!.push({
                    name: entry.name,
                    path: path.relative(root, fullPath),
                    type: "file"
                });
            }
        }

        return node;
    }

    return walk(root, 0);
}

export async function readPackageInfo(root: string): Promise<PackageInfo | null> {
    const pkgPath = path.join(root, "package.json");
    let raw: string;
    try {
        raw = await fs.readFile(pkgPath, "utf-8");
    } catch {
        return null;
    }

    const parsed = JSON.parse(raw) as {
        name?: string;
        version?: string;
        scripts?: Record<string, string>;
        dependencies?: Record<string, string>;
        devDependencies?: Record<string, string>;
    };

    const dependencies = parsed.dependencies ?? {};
    const devDependencies = parsed.devDependencies ?? {};
    const allDeps = new Set([
        ...Object.keys(dependencies),
        ...Object.keys(devDependencies)
    ]);

    const detectedFrameworks: string[] = [];
    for (const [framework, packages] of Object.entries(FRAMEWORK_SIGNATURES)) {
        if (packages.some((pkg) => allDeps.has(pkg))) {
            detectedFrameworks.push(framework);
        }
    }

    return {
        name: parsed.name ?? path.basename(root),
        version: parsed.version ?? "0.0.0",
        scripts: parsed.scripts ?? {},
        dependencies,
        devDependencies,
        detectedFrameworks
    };
}

export async function readFileContent(root: string, relativePath: string): Promise<string> {
    const fullPath = safeResolve(root, relativePath);
    return fs.readFile(fullPath, "utf-8");
}

export async function writeFileContent(
    root: string,
    relativePath: string,
    content: string
): Promise<void> {
    const fullPath = safeResolve(root, relativePath);
    await fs.writeFile(fullPath, content, "utf-8");
}

export function safeResolve(root: string, relativePath: string): string {
    const fullPath = path.resolve(root, relativePath);
    const normalizedRoot = path.resolve(root);
    if (!fullPath.startsWith(normalizedRoot)) {
        throw new Error("Path escapes workspace root");
    }
    return fullPath;
}

export interface DirectoryEntry {
    name: string;
    path: string;
    hasPackageJson: boolean;
}

export interface DirectoryListing {
    path: string;
    parentPath: string | null;
    entries: DirectoryEntry[];
    /** true when this listing represents the virtual "This PC" level showing available drives (Windows only) */
    isDriveList?: boolean;
}

const DRIVE_LIST_SENTINEL = "__DRIVES__";

async function listWindowsDrives(): Promise<DirectoryEntry[]> {
    const candidates = "ABCDEFGHIJKLMNOPQRSTUVWXYZ".split("");
    const results = await Promise.all(
        candidates.map(async (letter) => {
            const drivePath = `${letter}:\\`;
            try {
                const stat = await fs.stat(drivePath);
                if (stat.isDirectory()) {
                    return { name: `${letter}:\\`, path: drivePath, hasPackageJson: false };
                }
            } catch {
                // drive doesn't exist / not ready (e.g. empty optical drive) - skip it
            }
            return null;
        })
    );
    return results.filter((entry): entry is DirectoryEntry => entry !== null);
}

/**
 * Lists immediate subdirectories of an arbitrary absolute path, for the folder
 * picker UI. Unlike buildFileTree/readFileContent/writeFileContent above, this is
 * intentionally NOT scoped to any workspace root - the whole point is to let the
 * person browse to a new root from anywhere on disk, the same way a native
 * "Open Folder" dialog would.
 *
 * On Windows, passing DRIVE_LIST_SENTINEL (or reaching a drive root's parent)
 * returns the special drive-list level so the person can switch between C:\, D:\,
 * mapped network drives, etc. - plain path.dirname() has no way to express "go up
 * from a drive root to see other drives", since a drive root's parent is itself.
 */
export async function browseDirectory(targetPath: string): Promise<DirectoryListing> {
    if (process.platform === "win32" && targetPath === DRIVE_LIST_SENTINEL) {
        const entries = await listWindowsDrives();
        return { path: DRIVE_LIST_SENTINEL, parentPath: null, entries, isDriveList: true };
    }

    const resolved = path.resolve(targetPath);
    const stat = await fs.stat(resolved);
    if (!stat.isDirectory()) {
        throw new Error(`Not a directory: ${resolved}`);
    }

    const dirents = await fs.readdir(resolved, { withFileTypes: true });
    const entries: DirectoryEntry[] = [];

    for (const dirent of dirents) {
        if (!dirent.isDirectory()) continue;
        if (dirent.name.startsWith(".")) continue;
        if (IGNORED_DIR_NAMES.has(dirent.name)) continue;

        const entryPath = path.join(resolved, dirent.name);
        let hasPackageJson = false;
        try {
            await fs.access(path.join(entryPath, "package.json"));
            hasPackageJson = true;
        } catch {
            hasPackageJson = false;
        }

        entries.push({ name: dirent.name, path: entryPath, hasPackageJson });
    }

    entries.sort((a, b) => a.name.localeCompare(b.name));

    const parent = path.dirname(resolved);
    const isAtDriveRoot = process.platform === "win32" && parent === resolved;

    return {
        path: resolved,
        parentPath: isAtDriveRoot ? DRIVE_LIST_SENTINEL : parent === resolved ? null : parent,
        entries
    };
}

export function getDefaultBrowseStart(): string {
    if (process.env.HOME) return process.env.HOME;
    if (process.env.USERPROFILE) return process.env.USERPROFILE;
    return process.platform === "win32" ? DRIVE_LIST_SENTINEL : "/";
}

export { DRIVE_LIST_SENTINEL };
