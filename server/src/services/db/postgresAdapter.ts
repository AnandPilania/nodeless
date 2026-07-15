import pg from "pg";
import type { DbConnectionConfig, QueryResult, TableColumn, TableInfo } from "../../types/index.js";
import type { DbAdapter } from "./types.js";

const { Pool } = pg;

export class PostgresAdapter implements DbAdapter {
  private readonly pool: pg.Pool;

  constructor(config: DbConnectionConfig) {
    this.pool = new Pool({
      host: config.host,
      port: config.port ?? 5432,
      user: config.user,
      password: config.password,
      database: config.database,
      ssl: config.ssl ? { rejectUnauthorized: false } : undefined,
      max: 5
    });
  }

  async testConnection(): Promise<void> {
    const client = await this.pool.connect();
    try {
      await client.query("SELECT 1");
    } finally {
      client.release();
    }
  }

  async listTables(): Promise<TableInfo[]> {
    const tablesResult = await this.pool.query<{
      table_name: string;
      table_schema: string;
    }>(
      `SELECT table_name, table_schema
       FROM information_schema.tables
       WHERE table_schema NOT IN ('pg_catalog', 'information_schema')
       ORDER BY table_schema, table_name`
    );

    const tables: TableInfo[] = [];
    for (const row of tablesResult.rows) {
      tables.push(await this.getTableColumns(row.table_name, row.table_schema));
    }
    return tables;
  }

  async getTableColumns(tableName: string, schema: string | null = "public"): Promise<TableInfo> {
    const resolvedSchema = schema ?? "public";

    const columnsResult = await this.pool.query<{
      column_name: string;
      data_type: string;
      is_nullable: string;
      column_default: string | null;
    }>(
      `SELECT column_name, data_type, is_nullable, column_default
       FROM information_schema.columns
       WHERE table_schema = $1 AND table_name = $2
       ORDER BY ordinal_position`,
      [resolvedSchema, tableName]
    );

    const pkResult = await this.pool.query<{ column_name: string }>(
      `SELECT kcu.column_name
       FROM information_schema.table_constraints tc
       JOIN information_schema.key_column_usage kcu
         ON tc.constraint_name = kcu.constraint_name AND tc.table_schema = kcu.table_schema
       WHERE tc.constraint_type = 'PRIMARY KEY' AND tc.table_schema = $1 AND tc.table_name = $2`,
      [resolvedSchema, tableName]
    );
    const primaryKeys = new Set(pkResult.rows.map((r) => r.column_name));

    const countResult = await this.pool.query<{ count: string }>(
      `SELECT COUNT(*)::text as count FROM "${resolvedSchema}"."${tableName}"`
    );

    const columns: TableColumn[] = columnsResult.rows.map((row) => ({
      name: row.column_name,
      dataType: row.data_type,
      nullable: row.is_nullable === "YES",
      isPrimaryKey: primaryKeys.has(row.column_name),
      defaultValue: row.column_default
    }));

    return {
      name: tableName,
      schema: resolvedSchema,
      columns,
      approximateRowCount: Number(countResult.rows[0]?.count ?? 0)
    };
  }

  async runQuery(sql: string): Promise<QueryResult> {
    const started = Date.now();
    const result = await this.pool.query(sql);
    const columns = result.fields?.map((f) => f.name) ?? [];
    return {
      columns,
      rows: result.rows,
      rowCount: result.rowCount ?? result.rows.length,
      durationMs: Date.now() - started,
      command: result.command ?? null
    };
  }

  async fetchTableRows(
    tableName: string,
    schema: string | null,
    limit: number,
    offset: number
  ): Promise<QueryResult> {
    const resolvedSchema = schema ?? "public";
    return this.runQuery(
      `SELECT * FROM "${resolvedSchema}"."${tableName}" LIMIT ${limit} OFFSET ${offset}`
    );
  }

  async close(): Promise<void> {
    await this.pool.end();
  }
}
