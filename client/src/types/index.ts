export interface FileNode {
    name: string;
    path: string;
    type: "file" | "directory";
    children?: FileNode[];
}

export interface PackageInfo {
    name: string;
    version: string;
    scripts: Record<string, string>;
    dependencies: Record<string, string>;
    devDependencies: Record<string, string>;
    detectedFrameworks: string[];
}

export interface RunTarget {
    id: string;
    kind: "npm-script" | "file";
    label: string;
    command: string;
    args: string[];
    cwd: string;
}

export interface ProcessOutputEvent {
    type: "stdout" | "stderr" | "exit" | "error" | "started";
    runId: string;
    data?: string;
    code?: number | null;
    signal?: string | null;
    pid?: number;
    timestamp: number;
}

export interface SnippetExecutionResult {
    success: boolean;
    result?: unknown;
    logs: { level: "log" | "warn" | "error" | "info"; args: unknown[] }[];
    error?: {
        message: string;
        stack?: string;
    };
    durationMs: number;
}

export type DbDriver = "postgres" | "mysql" | "sqlite" | "mongodb";

export interface DbConnectionConfigSafe {
    id: string;
    driver: DbDriver;
    name: string;
    host?: string;
    port?: number;
    user?: string;
    database?: string;
    filePath?: string;
    ssl?: boolean;
    hasPassword: boolean;
}

export interface TableColumn {
    name: string;
    dataType: string;
    nullable: boolean;
    isPrimaryKey: boolean;
    defaultValue: string | null;
}

export interface TableInfo {
    name: string;
    schema: string | null;
    columns: TableColumn[];
    approximateRowCount: number | null;
}

export interface QueryResult {
    columns: string[];
    rows: Record<string, unknown>[];
    rowCount: number;
    durationMs: number;
    command: string | null;
}
