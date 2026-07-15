import mysql from "mysql2/promise";
import type { DbConnectionConfig, QueryResult, TableColumn, TableInfo } from "../../types/index.js";
import type { DbAdapter } from "./types.js";

export class MysqlAdapter implements DbAdapter {
  private readonly pool: mysql.Pool;
  private readonly database: string;

  constructor(config: DbConnectionConfig) {
    this.database = config.database ?? "";
    this.pool = mysql.createPool({
      host: config.host,
      port: config.port ?? 3306,
      user: config.user,
      password: config.password,
      database: config.database,
      ssl: config.ssl ? {} : undefined,
      connectionLimit: 5
    });
  }

  async testConnection(): Promise<void> {
    const conn = await this.pool.getConnection();
    try {
      await conn.query("SELECT 1");
    } finally {
      conn.release();
    }
  }

  async listTables(): Promise<TableInfo[]> {
    const [rows] = await this.pool.query<mysql.RowDataPacket[]>(
      `SELECT table_name FROM information_schema.tables WHERE table_schema = ? ORDER BY table_name`,
      [this.database]
    );

    const tables: TableInfo[] = [];
    for (const row of rows) {
      tables.push(await this.getTableColumns(row.table_name as string, this.database));
    }
    return tables;
  }

  async getTableColumns(tableName: string, schema: string | null): Promise<TableInfo> {
    const db = schema ?? this.database;

    const [columnRows] = await this.pool.query<mysql.RowDataPacket[]>(
      `SELECT column_name, data_type, is_nullable, column_default, column_key
       FROM information_schema.columns
       WHERE table_schema = ? AND table_name = ?
       ORDER BY ordinal_position`,
      [db, tableName]
    );

    const [countRows] = await this.pool.query<mysql.RowDataPacket[]>(
      `SELECT COUNT(*) as count FROM \`${db}\`.\`${tableName}\``
    );

    const columns: TableColumn[] = columnRows.map((row) => ({
      name: row.column_name as string,
      dataType: row.data_type as string,
      nullable: row.is_nullable === "YES",
      isPrimaryKey: row.column_key === "PRI",
      defaultValue: (row.column_default as string | null) ?? null
    }));

    return {
      name: tableName,
      schema: db,
      columns,
      approximateRowCount: Number(countRows[0]?.count ?? 0)
    };
  }

  async runQuery(sql: string): Promise<QueryResult> {
    const started = Date.now();
    const [rows, fields] = await this.pool.query(sql);
    const rowArray = Array.isArray(rows) ? (rows as Record<string, unknown>[]) : [];
    const columns = Array.isArray(fields) ? fields.map((f) => f.name) : [];
    return {
      columns,
      rows: rowArray,
      rowCount: rowArray.length,
      durationMs: Date.now() - started,
      command: null
    };
  }

  async fetchTableRows(
    tableName: string,
    schema: string | null,
    limit: number,
    offset: number
  ): Promise<QueryResult> {
    const db = schema ?? this.database;
    return this.runQuery(`SELECT * FROM \`${db}\`.\`${tableName}\` LIMIT ${limit} OFFSET ${offset}`);
  }

  async close(): Promise<void> {
    await this.pool.end();
  }
}
