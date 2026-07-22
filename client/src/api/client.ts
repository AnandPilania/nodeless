import type {
    DbConnectionConfigSafe,
    FileNode,
    PackageInfo,
    QueryResult,
    RunTarget,
    SnippetExecutionResult,
    TableInfo
} from "../types";

/**
 * The preview iframe intentionally does NOT go through the Vite dev proxy: it needs
 * to be served from the backend's own origin (a different host:port than this
 * frontend app) so that sandbox="allow-scripts allow-same-origin" isolates it from
 * the real nodeless app's cookies/localStorage/DOM. Everything else in this file
 * uses relative /api paths, which the dev proxy forwards; this one constant is the
 * only place a real absolute backend URL is needed.
 *
 * Override via VITE_BACKEND_ORIGIN if the backend isn't on localhost:4310 (e.g. a
 * remote dev container, or a production deployment where frontend and backend are
 * on different hosts).
 */
export const BACKEND_ORIGIN: string =
    (import.meta.env.VITE_BACKEND_ORIGIN as string | undefined) ?? "http://localhost:4310";

async function request<T>(path: string, init?: RequestInit): Promise<T> {
    const res = await fetch(`/api${path}`, {
        ...init,
        headers: {
            "Content-Type": "application/json",
            ...(init?.headers ?? {})
        }
    });
    const body = await res.json();
    if (!res.ok) {
        throw new Error(body.error ?? `Request failed: ${res.status}`);
    }
    return body as T;
}

export const api = {
    getWorkspaceRoot: () => request<{ root: string }>("/workspace/root"),
    setWorkspaceRoot: (root: string) =>
        request<{ root: string }>("/workspace/root", {
            method: "POST",
            body: JSON.stringify({ root })
        }),
    getFileTree: () => request<FileNode>("/workspace/tree"),
    getPackageInfo: () => request<PackageInfo>("/workspace/package"),
    getFile: (path: string) =>
        request<{ path: string; content: string }>(`/workspace/file?path=${encodeURIComponent(path)}`),
    saveFile: (path: string, content: string) =>
        request<{ success: boolean }>("/workspace/file", {
            method: "PUT",
            body: JSON.stringify({ path, content })
        }),

    runNpmScript: (scriptName: string) =>
        request<{ runId: string; target: RunTarget }>("/run/npm-script", {
            method: "POST",
            body: JSON.stringify({ scriptName })
        }),
    runFile: (filePath: string) =>
        request<{ runId: string; target: RunTarget }>("/run/file", {
            method: "POST",
            body: JSON.stringify({ filePath })
        }),
    stopRun: (runId: string) =>
        request<{ stopped: boolean }>(`/run/${runId}/stop`, { method: "POST" }),
    getActiveRuns: () =>
        request<{ runId: string; label: string; pid?: number; startedAt: number }[]>("/run/active"),

    executeSnippet: (code: string, timeoutMs?: number) =>
        request<SnippetExecutionResult>("/snippet/execute", {
            method: "POST",
            body: JSON.stringify({ code, timeoutMs })
        }),

    listConnections: () => request<DbConnectionConfigSafe[]>("/db/connections"),
    createConnection: (config: {
        driver: string;
        name: string;
        host?: string;
        port?: number;
        user?: string;
        password?: string;
        database?: string;
        filePath?: string;
        ssl?: boolean;
        connectionString?: string;
    }) =>
        request<DbConnectionConfigSafe>("/db/connections", {
            method: "POST",
            body: JSON.stringify(config)
        }),
    closeConnection: (id: string) =>
        request<{ success: boolean }>(`/db/connections/${id}`, { method: "DELETE" }),
    listTables: (connectionId: string) =>
        request<TableInfo[]>(`/db/connections/${connectionId}/tables`),
    fetchTableRows: (connectionId: string, tableName: string, schema: string | null, limit: number, offset: number) => {
        const params = new URLSearchParams({ limit: String(limit), offset: String(offset) });
        if (schema) params.set("schema", schema);
        return request<QueryResult>(`/db/connections/${connectionId}/tables/${tableName}/rows?${params.toString()}`);
    },
    runQuery: (connectionId: string, sql: string) =>
        request<QueryResult>(`/db/connections/${connectionId}/query`, {
            method: "POST",
            body: JSON.stringify({ sql })
        })
};
