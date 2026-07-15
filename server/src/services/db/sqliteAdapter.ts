import Database from "better-sqlite3";
import type { DbConnectionConfig, QueryResult, TableColumn, TableInfo } from "../../types/index.js";
import type { DbAdapter } from "./types.js";

export class SqliteAdapter implements DbAdapter {
  private readonly db: Database.Database;

  constructor(config: DbConnectionConfig) {
    if (!config.filePath) {
      throw new Error("SQLite connection requires filePath");
    }
    this.db = new Database(config.filePath);
  }

  async testConnection(): Promise<void> {
    this.db.prepare("SELECT 1").get();
  }

  async listTables(): Promise<TableInfo[]> {
    const rows = this.db
      .prepare(
        `SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' ORDER BY name`
      )
      .all() as { name: string }[];

    const tables: TableInfo[] = [];
    for (const row of rows) {
      tables.push(await this.getTableColumns(row.name));
    }
    return tables;
  }

  async getTableColumns(tableName: string, _schema?: string | null): Promise<TableInfo> {
    const pragma = this.db.prepare(`PRAGMA table_info("${tableName}")`).all() as {
      name: string;
      type: string;
      notnull: number;
      dflt_value: string | null;
      pk: number;
    }[];

    const countRow = this.db.prepare(`SELECT COUNT(*) as count FROM "${tableName}"`).get() as {
      count: number;
    };

    const columns: TableColumn[] = pragma.map((col) => ({
      name: col.name,
      dataType: col.type || "TEXT",
      nullable: col.notnull === 0,
      isPrimaryKey: col.pk === 1,
      defaultValue: col.dflt_value
    }));

    return {
      name: tableName,
      schema: null,
      columns,
      approximateRowCount: countRow?.count ?? 0
    };
  }

  async runQuery(sql: string): Promise<QueryResult> {
    const started = Date.now();
    const trimmed = sql.trim().toLowerCase();
    const isSelect = trimmed.startsWith("select") || trimmed.startsWith("pragma");

    if (isSelect) {
      const stmt = this.db.prepare(sql);
      const rows = stmt.all() as Record<string, unknown>[];
      const columns = stmt.columns().map((c) => c.name);
      return {
        columns,
        rows,
        rowCount: rows.length,
        durationMs: Date.now() - started,
        command: null
      };
    }

    const info = this.db.prepare(sql).run();
    return {
      columns: [],
      rows: [],
      rowCount: info.changes,
      durationMs: Date.now() - started,
      command: null
    };
  }

  async fetchTableRows(
    tableName: string,
    _schema: string | null,
    limit: number,
    offset: number
  ): Promise<QueryResult> {
    return this.runQuery(`SELECT * FROM "${tableName}" LIMIT ${limit} OFFSET ${offset}`);
  }

  async close(): Promise<void> {
    this.db.close();
  }
}
