import crypto from "node:crypto";
import type { DbConnectionConfig, DbConnectionConfigSafe } from "../../types/index.js";
import type { DbAdapter } from "./types.js";
import { PostgresAdapter } from "./postgresAdapter.js";
import { MysqlAdapter } from "./mysqlAdapter.js";
import { SqliteAdapter } from "./sqliteAdapter.js";
import { MongodbAdapter } from "./mongodbAdapter.js";

interface StoredConnection {
    config: DbConnectionConfig;
    adapter: DbAdapter;
}

export class DbConnectionManager {
    private readonly connections = new Map<string, StoredConnection>();

    async createConnection(input: Omit<DbConnectionConfig, "id">): Promise<DbConnectionConfigSafe> {
        const id = crypto.randomUUID();
        const config: DbConnectionConfig = { ...input, id };
        const adapter = this.buildAdapter(config);
        await adapter.testConnection();

        this.connections.set(id, { config, adapter });
        return this.toSafeConfig(config);
    }

    private buildAdapter(config: DbConnectionConfig): DbAdapter {
        switch (config.driver) {
            case "postgres":
                return new PostgresAdapter(config);
            case "mysql":
                return new MysqlAdapter(config);
            case "mongodb":
                return new MongodbAdapter(config);
            case "sqlite":
                return new SqliteAdapter(config);
            default:
                throw new Error(`Unsupported driver: ${config.driver}`);
        }
    }

    list(): DbConnectionConfigSafe[] {
        return Array.from(this.connections.values()).map((entry) => this.toSafeConfig(entry.config));
    }

    getAdapter(id: string): DbAdapter {
        const entry = this.connections.get(id);
        if (!entry) {
            throw new Error(`No active connection with id ${id}`);
        }
        return entry.adapter;
    }

    async close(id: string): Promise<void> {
        const entry = this.connections.get(id);
        if (!entry) return;
        await entry.adapter.close();
        this.connections.delete(id);
    }

    private toSafeConfig(config: DbConnectionConfig): DbConnectionConfigSafe {
        const { password, connectionString, ...rest } = config;
        return {
            ...rest,
            hasPassword: Boolean(password) || Boolean(connectionString && /:\/\/[^/@]+:[^/@]+@/.test(connectionString))
        };
    }
}
