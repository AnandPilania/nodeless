import { MongoClient, ObjectId } from "mongodb";
import type { DbConnectionConfig, QueryResult, TableColumn, TableInfo } from "../../types/index.js";
import type { DbAdapter } from "./types.js";

const SAMPLE_SIZE = 50;

function inferBsonType(value: unknown): string {
    if (value === null) return "null";
    if (value === undefined) return "undefined";
    if (value instanceof ObjectId) return "ObjectId";
    if (value instanceof Date) return "Date";
    if (Array.isArray(value)) return "array";
    if (typeof value === "object") return "object";
    if (typeof value === "number") return Number.isInteger(value) ? "int" : "double";
    return typeof value;
}

function buildConnectionUri(config: DbConnectionConfig): string {
    if (config.connectionString) {
        return config.connectionString;
    }
    const auth =
        config.user && config.password
            ? `${encodeURIComponent(config.user)}:${encodeURIComponent(config.password)}@`
            : "";
    const host = config.host ?? "localhost";
    const port = config.port ?? 27017;
    const params = config.ssl ? "?tls=true" : "";
    return `mongodb://${auth}${host}:${port}${params}`;
}

interface ParsedMongoCommand {
    collection: string;
    operation: "find" | "aggregate" | "countDocuments";
    filterOrPipeline: unknown;
    limit: number | null;
}

function parseMongoCommand(input: string): ParsedMongoCommand {
    const trimmed = input.trim().replace(/;\s*$/, "");

    const aggregateMatch = trimmed.match(/^([A-Za-z0-9_.$]+)\.aggregate\(\s*([\s\S]*)\s*\)$/);
    if (aggregateMatch) {
        const [, collection, pipelineSource] = aggregateMatch;
        const pipeline = parseLooseJson(pipelineSource);
        if (!Array.isArray(pipeline)) {
            throw new Error("aggregate() expects an array pipeline argument, e.g. collection.aggregate([{ $match: {} }])");
        }
        return { collection, operation: "aggregate", filterOrPipeline: pipeline, limit: null };
    }

    const countMatch = trimmed.match(/^([A-Za-z0-9_.$]+)\.countDocuments\(\s*([\s\S]*?)\s*\)$/);
    if (countMatch) {
        const [, collection, filterSource] = countMatch;
        const filter = filterSource.trim() ? parseLooseJson(filterSource) : {};
        return { collection, operation: "countDocuments", filterOrPipeline: filter, limit: null };
    }

    const findMatch = trimmed.match(
        /^([A-Za-z0-9_.$]+)\.find\(\s*([\s\S]*?)\s*\)(?:\.limit\(\s*(\d+)\s*\))?$/
    );
    if (findMatch) {
        const [, collection, filterSource, limitSource] = findMatch;
        const filter = filterSource.trim() ? parseLooseJson(filterSource) : {};
        return {
            collection,
            operation: "find",
            filterOrPipeline: filter,
            limit: limitSource ? Number(limitSource) : null
        };
    }

    throw new Error(
        "Unrecognized query. Supported forms: " +
        "collection.find({ field: value }), collection.find({...}).limit(n), " +
        "collection.aggregate([{ $match: {...} }]), collection.countDocuments({...})"
    );
}

/**
 * Parses a mongosh-style object/array literal (which may use unquoted keys and
 * single-quoted strings, unlike strict JSON) into a real JS value, without using
 * eval. Falls back to strict JSON.parse first since that's the common case.
 */
function parseLooseJson(source: string): unknown {
    try {
        return JSON.parse(source);
    } catch {
        // fall through to loose parsing
    }

    const quoted = source
        .replace(/([{,]\s*)([A-Za-z_$][A-Za-z0-9_$]*)\s*:/g, '$1"$2":')
        .replace(/'([^']*)'/g, '"$1"');

    try {
        return JSON.parse(quoted);
    } catch (err) {
        throw new Error(`Could not parse query argument as JSON: ${(err as Error).message}`);
    }
}

export class MongodbAdapter implements DbAdapter {
    private readonly client: MongoClient;
    private readonly databaseName: string;

    constructor(config: DbConnectionConfig) {
        const uri = buildConnectionUri(config);
        this.client = new MongoClient(uri);
        this.databaseName = config.database ?? this.extractDbNameFromUri(uri) ?? "test";
    }

    private extractDbNameFromUri(uri: string): string | null {
        try {
            const withoutProtocol = uri.replace(/^mongodb(\+srv)?:\/\//, "");
            const afterAuth = withoutProtocol.split("@").pop() ?? withoutProtocol;
            const pathPart = afterAuth.split("/")[1];
            if (!pathPart) return null;
            return pathPart.split("?")[0] || null;
        } catch {
            return null;
        }
    }

    async testConnection(): Promise<void> {
        await this.client.connect();
        await this.client.db(this.databaseName).command({ ping: 1 });
    }

    async listTables(): Promise<TableInfo[]> {
        const db = this.client.db(this.databaseName);
        const collections = await db.listCollections({}, { nameOnly: true }).toArray();

        const tables: TableInfo[] = [];
        for (const coll of collections) {
            tables.push(await this.getTableColumns(coll.name));
        }
        return tables;
    }

    async getTableColumns(collectionName: string): Promise<TableInfo> {
        const db = this.client.db(this.databaseName);
        const collection = db.collection(collectionName);

        const sample = await collection.find({}).limit(SAMPLE_SIZE).toArray();
        const approximateRowCount = await collection.estimatedDocumentCount();

        const fieldTypes = new Map<string, Set<string>>();
        const fieldPresence = new Map<string, number>();

        for (const doc of sample) {
            for (const [key, value] of Object.entries(doc)) {
                if (!fieldTypes.has(key)) fieldTypes.set(key, new Set());
                fieldTypes.get(key)!.add(inferBsonType(value));
                fieldPresence.set(key, (fieldPresence.get(key) ?? 0) + 1);
            }
        }

        const columns: TableColumn[] = Array.from(fieldTypes.entries()).map(([name, types]) => ({
            name,
            dataType: Array.from(types).join(" | "),
            nullable: (fieldPresence.get(name) ?? 0) < sample.length,
            isPrimaryKey: name === "_id",
            defaultValue: null
        }));

        columns.sort((a, b) => {
            if (a.name === "_id") return -1;
            if (b.name === "_id") return 1;
            return a.name.localeCompare(b.name);
        });

        return {
            name: collectionName,
            schema: this.databaseName,
            columns,
            approximateRowCount
        };
    }

    async runQuery(query: string): Promise<QueryResult> {
        const started = Date.now();
        const parsed = parseMongoCommand(query);
        const db = this.client.db(this.databaseName);
        const collection = db.collection(parsed.collection);

        if (parsed.operation === "countDocuments") {
            const count = await collection.countDocuments(parsed.filterOrPipeline as Record<string, unknown>);
            return {
                columns: ["count"],
                rows: [{ count }],
                rowCount: 1,
                durationMs: Date.now() - started,
                command: "countDocuments"
            };
        }

        if (parsed.operation === "aggregate") {
            const rows = await collection
                .aggregate(parsed.filterOrPipeline as Record<string, unknown>[])
                .limit(200)
                .toArray();
            return this.toQueryResult(rows, Date.now() - started, "aggregate");
        }

        const cursor = collection.find(parsed.filterOrPipeline as Record<string, unknown>);
        if (parsed.limit) {
            cursor.limit(parsed.limit);
        } else {
            cursor.limit(200);
        }
        const rows = await cursor.toArray();
        return this.toQueryResult(rows, Date.now() - started, "find");
    }

    async fetchTableRows(
        collectionName: string,
        _schema: string | null,
        limit: number,
        offset: number
    ): Promise<QueryResult> {
        const started = Date.now();
        const db = this.client.db(this.databaseName);
        const rows = await db.collection(collectionName).find({}).skip(offset).limit(limit).toArray();
        return this.toQueryResult(rows, Date.now() - started, null);
    }

    private toQueryResult(
        rows: Record<string, unknown>[],
        durationMs: number,
        command: string | null
    ): QueryResult {
        const columnSet = new Set<string>();
        for (const row of rows) {
            for (const key of Object.keys(row)) {
                columnSet.add(key);
            }
        }
        const columns = Array.from(columnSet);
        if (columns.length > 0) {
            const idIndex = columns.indexOf("_id");
            if (idIndex > 0) {
                columns.splice(idIndex, 1);
                columns.unshift("_id");
            }
        }

        const serializedRows = rows.map((row) => this.serializeDocument(row));

        return {
            columns,
            rows: serializedRows,
            rowCount: rows.length,
            durationMs,
            command
        };
    }

    private serializeDocument(doc: Record<string, unknown>): Record<string, unknown> {
        const out: Record<string, unknown> = {};
        for (const [key, value] of Object.entries(doc)) {
            out[key] = this.serializeValue(value);
        }
        return out;
    }

    private serializeValue(value: unknown): unknown {
        if (value instanceof ObjectId) return value.toHexString();
        if (value instanceof Date) return value.toISOString();
        if (Array.isArray(value)) return value.map((v) => this.serializeValue(v));
        if (value && typeof value === "object") {
            return this.serializeDocument(value as Record<string, unknown>);
        }
        return value;
    }

    async close(): Promise<void> {
        await this.client.close();
    }
}
