import type { QueryResult, TableInfo } from "../../types/index.js";

export interface DbAdapter {
  testConnection(): Promise<void>;
  listTables(): Promise<TableInfo[]>;
  getTableColumns(tableName: string, schema?: string | null): Promise<TableInfo>;
  runQuery(sql: string): Promise<QueryResult>;
  fetchTableRows(
    tableName: string,
    schema: string | null,
    limit: number,
    offset: number
  ): Promise<QueryResult>;
  close(): Promise<void>;
}
