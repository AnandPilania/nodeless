import { useEffect, useRef, useState } from "react";
import { api } from "../api/client";
import { ResizeHandle } from "./ResizeHandle";
import { usePersistentState } from "../hooks/usePersistentState";
import { useBreakpoint } from "../hooks/useBreakpoint";
import type { DbConnectionConfigSafe, DbDriver, QueryResult, TableInfo } from "../types";

const EMPTY_FORM = {
  driver: "sqlite" as DbDriver,
  name: "",
  host: "localhost",
  port: "",
  user: "",
  password: "",
  database: "",
  filePath: "",
  connectionString: "",
  mongoUseUri: false
};

const SIDEBAR_MIN = 160;
const SIDEBAR_MAX = 420;
const QUERY_MIN_FRACTION = 0.08;
const QUERY_MAX_FRACTION = 0.7;

export function DbExplorer() {
  const [connections, setConnections] = useState<DbConnectionConfigSafe[]>([]);
  const [activeConnectionId, setActiveConnectionId] = useState<string | null>(null);
  const [tables, setTables] = useState<TableInfo[]>([]);
  const [selectedTable, setSelectedTable] = useState<TableInfo | null>(null);
  const [rows, setRows] = useState<QueryResult | null>(null);
  const [sql, setSql] = useState("");
  const [sqlResult, setSqlResult] = useState<QueryResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);
  const [connecting, setConnecting] = useState(false);
  const [tablesLoading, setTablesLoading] = useState(false);
  const [dataLoading, setDataLoading] = useState(false);
  const [layout, setLayout] = usePersistentState("nodeless:db-layout", {
    sidebarWidth: 220,
    queryFraction: 0.18
  });
  const mainRef = useRef<HTMLDivElement>(null);
  const breakpoint = useBreakpoint();
  const isDesktop = breakpoint === "desktop";
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);

  useEffect(() => {
    api.listConnections().then(setConnections).catch(() => undefined);
  }, []);

  async function handleConnect() {
    setConnecting(true);
    setError(null);
    try {
      const useConnectionString = form.driver === "mongodb" && form.mongoUseUri;
      const config = await api.createConnection({
        driver: form.driver,
        name: form.name || `${form.driver}-connection`,
        connectionString: useConnectionString ? form.connectionString : undefined,
        host: form.driver !== "sqlite" && !useConnectionString ? form.host : undefined,
        port: form.port && !useConnectionString ? Number(form.port) : undefined,
        user: form.driver !== "sqlite" && !useConnectionString ? form.user : undefined,
        password: form.driver !== "sqlite" && !useConnectionString ? form.password : undefined,
        database: form.driver !== "sqlite" ? form.database : undefined,
        filePath: form.driver === "sqlite" ? form.filePath : undefined
      });
      setConnections((prev) => [...prev, config]);
      setActiveConnectionId(config.id);
      setFormOpen(false);
      setForm(EMPTY_FORM);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setConnecting(false);
    }
  }

  async function selectConnection(id: string) {
    setActiveConnectionId(id);
    setTables([]);
    setSelectedTable(null);
    setRows(null);
    setSqlResult(null);
    setError(null);

    setTablesLoading(true);
    try {
      const tableList = await api.listTables(id);
      setTables(tableList);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setTablesLoading(false);
    }
  }

  async function selectTable(table: TableInfo) {
    setSelectedTable(table);
    setRows(null);
    setSqlResult(null);
    setError(null);
    if (!activeConnectionId) return;

    setDataLoading(true);
    try {
      const result = await api.fetchTableRows(activeConnectionId, table.name, table.schema, 100, 0);
      setRows(result);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setDataLoading(false);
    }
  }

  async function runSql() {
    if (!activeConnectionId || !sql.trim()) return;
    setError(null);
    setSqlResult(null);
    setDataLoading(true);
    try {
      const result = await api.runQuery(activeConnectionId, sql);
      setSqlResult(result);
    } catch (err) {
      setError((err as Error).message);
      setSqlResult(null);
    } finally {
      setDataLoading(false);
    }
  }

  async function disconnect(id: string) {
    await api.closeConnection(id);
    setConnections((prev) => prev.filter((c) => c.id !== id));
    if (activeConnectionId === id) {
      setActiveConnectionId(null);
      setTables([]);
      setSelectedTable(null);
      setRows(null);
    }
  }

  const displayedResult = sqlResult ?? rows;
  const activeDriver = connections.find((c) => c.id === activeConnectionId)?.driver;

  return (
    <div className={`db-explorer ${!isDesktop ? "db-explorer-stacked" : ""}`}>
      {!isDesktop && (
        <button className="db-mobile-sidebar-toggle" onClick={() => setMobileSidebarOpen((v) => !v)}>
          <span>Connections {activeDriver ? `· ${connections.find((c) => c.id === activeConnectionId)?.name}` : ""}</span>
          <span className={`db-mobile-sidebar-caret ${mobileSidebarOpen ? "db-mobile-sidebar-caret-open" : ""}`}>▾</span>
        </button>
      )}
      <div
        className="db-sidebar"
        style={
          isDesktop
            ? { width: layout.sidebarWidth, flexBasis: layout.sidebarWidth }
            : { display: mobileSidebarOpen ? "flex" : "none" }
        }
      >
        <div className="db-sidebar-header">
          <span className="section-label">Connections</span>
          <button className="db-add-btn" onClick={() => setFormOpen((v) => !v)}>
            {formOpen ? "×" : "+"}
          </button>
        </div>

        {formOpen && (
          <div className="db-form">
            <select
              value={form.driver}
              onChange={(e) => setForm((f) => ({ ...f, driver: e.target.value as DbDriver }))}
            >
              <option value="sqlite">SQLite</option>
              <option value="postgres">PostgreSQL</option>
              <option value="mysql">MySQL</option>
              <option value="mongodb">MongoDB</option>
            </select>
            <input
              placeholder="connection name"
              value={form.name}
              onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
            />
            {form.driver === "sqlite" ? (
              <input
                placeholder="/path/to/database.db"
                value={form.filePath}
                onChange={(e) => setForm((f) => ({ ...f, filePath: e.target.value }))}
              />
            ) : form.driver === "mongodb" ? (
              <>
                <div className="db-form-toggle">
                  <button
                    type="button"
                    className={`db-form-toggle-btn ${!form.mongoUseUri ? "db-form-toggle-btn-active" : ""}`}
                    onClick={() => setForm((f) => ({ ...f, mongoUseUri: false }))}
                  >
                    host / port
                  </button>
                  <button
                    type="button"
                    className={`db-form-toggle-btn ${form.mongoUseUri ? "db-form-toggle-btn-active" : ""}`}
                    onClick={() => setForm((f) => ({ ...f, mongoUseUri: true }))}
                  >
                    connection string
                  </button>
                </div>
                {form.mongoUseUri ? (
                  <input
                    placeholder="mongodb+srv://user:pass@cluster.mongodb.net"
                    value={form.connectionString}
                    onChange={(e) => setForm((f) => ({ ...f, connectionString: e.target.value }))}
                  />
                ) : (
                  <>
                    <input
                      placeholder="host"
                      value={form.host}
                      onChange={(e) => setForm((f) => ({ ...f, host: e.target.value }))}
                    />
                    <input
                      placeholder="port (27017)"
                      value={form.port}
                      onChange={(e) => setForm((f) => ({ ...f, port: e.target.value }))}
                    />
                    <input
                      placeholder="user (optional)"
                      value={form.user}
                      onChange={(e) => setForm((f) => ({ ...f, user: e.target.value }))}
                    />
                    <input
                      type="password"
                      placeholder="password (optional)"
                      value={form.password}
                      onChange={(e) => setForm((f) => ({ ...f, password: e.target.value }))}
                    />
                  </>
                )}
                <input
                  placeholder="database"
                  value={form.database}
                  onChange={(e) => setForm((f) => ({ ...f, database: e.target.value }))}
                />
              </>
            ) : (
              <>
                <input
                  placeholder="host"
                  value={form.host}
                  onChange={(e) => setForm((f) => ({ ...f, host: e.target.value }))}
                />
                <input
                  placeholder={form.driver === "postgres" ? "port (5432)" : "port (3306)"}
                  value={form.port}
                  onChange={(e) => setForm((f) => ({ ...f, port: e.target.value }))}
                />
                <input
                  placeholder="database"
                  value={form.database}
                  onChange={(e) => setForm((f) => ({ ...f, database: e.target.value }))}
                />
                <input
                  placeholder="user"
                  value={form.user}
                  onChange={(e) => setForm((f) => ({ ...f, user: e.target.value }))}
                />
                <input
                  type="password"
                  placeholder="password"
                  value={form.password}
                  onChange={(e) => setForm((f) => ({ ...f, password: e.target.value }))}
                />
              </>
            )}
            <button className="db-connect-btn" onClick={handleConnect} disabled={connecting}>
              {connecting ? "connecting…" : "connect"}
            </button>
          </div>
        )}

        <div className="db-connection-list">
          {connections.map((conn) => (
            <div
              key={conn.id}
              className={`db-connection-row ${activeConnectionId === conn.id ? "db-connection-active" : ""}`}
              onClick={() => selectConnection(conn.id)}
            >
              <span className="db-driver-tag">{conn.driver}</span>
              <span className="db-connection-name">{conn.name}</span>
              <button
                className="db-disconnect-btn"
                onClick={(e) => {
                  e.stopPropagation();
                  disconnect(conn.id);
                }}
              >
                ×
              </button>
            </div>
          ))}
        </div>

        {activeConnectionId && (
          <>
            <div className="section-label section-label-spaced">
              {activeDriver === "mongodb" ? "Collections" : "Tables"}
            </div>
            <div className="db-table-list">
              {tablesLoading ? (
                <div className="panel-empty-inline">Loading...</div>
              ) : (
                tables.map((table) => (
                  <div
                    key={`${table.schema ?? ""}.${table.name}`}
                    className={`db-table-row ${selectedTable?.name === table.name ? "db-table-active" : ""}`}
                    onClick={() => selectTable(table)}
                  >
                    <span className="db-table-name">{table.name}</span>
                    <span className="db-table-count">{table.approximateRowCount ?? "—"}</span>
                  </div>
                ))
              )}
              {!tablesLoading && tables.length === 0 && <div className="panel-empty-inline">No {activeDriver === "mongodb" ? "collections" : "tables"} found</div>}
            </div>
          </>
        )}
      </div>

      {isDesktop && (
        <ResizeHandle
          axis="horizontal"
          currentValue={layout.sidebarWidth}
          minValue={SIDEBAR_MIN}
          maxValue={SIDEBAR_MAX}
          onChange={(next) => setLayout((prev) => ({ ...prev, sidebarWidth: next }))}
        />
      )}

      <div className="db-main" ref={mainRef}>
        {selectedTable && (
          <div className="db-schema-strip" style={{ flex: "none", maxHeight: "150px", overflowY: "auto" }}
          >
            {selectedTable.columns.map((col) => (
              <span key={col.name} className={`db-column-chip ${col.isPrimaryKey ? "db-column-pk" : ""}`}>
                {col.name} <span className="db-column-type">{col.dataType}</span>
              </span>
            ))}
          </div>
        )}

        <div
          className="db-query-pane"
          style={isDesktop ? { flexBasis: `${layout.queryFraction * 100}%` } : { flexBasis: "140px" }}
        >
          <textarea
            className="db-query-textarea"
            placeholder={
              activeDriver === "mongodb"
                ? "collection.find({ field: value })\ncollection.aggregate([...])"
                : "SELECT * FROM ..."
            }
            value={sql}
            onChange={(e) => setSql(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
                e.preventDefault();
                runSql();
              }
            }}
            disabled={!activeConnectionId}
            spellCheck={false}
          />
          <div className="db-query-actions">
            <span className="db-query-hint">⌘/Ctrl + Enter to run</span>
            <button onClick={runSql} disabled={!activeConnectionId || !sql.trim()}>
              run
            </button>
          </div>
        </div>

        {isDesktop && (
          <ResizeHandle
            axis="vertical"
            currentValue={layout.queryFraction}
            minValue={QUERY_MIN_FRACTION}
            maxValue={QUERY_MAX_FRACTION}
            onChange={(next) => setLayout((prev) => ({ ...prev, queryFraction: next }))}
            containerRef={mainRef}
          />
        )}

        {error && <div className="db-error">{error}</div>}

        <div className="db-results">
          {dataLoading ? (
             <div className="panel-empty">Loading data...</div>
          ) : !displayedResult && !error && (
            <div className="panel-empty">Select a table or run a query to see results</div>
          )}
          {displayedResult && (
            <>
              <div className="db-results-meta">
                {displayedResult.rowCount} rows · {displayedResult.durationMs}ms
              </div>
              <div className="db-table-scroll">
                <table className="db-result-table">
                  <thead>
                    <tr>
                      {displayedResult.columns.map((col) => (
                        <th key={col}>{col}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {displayedResult.rows.map((row, i) => (
                      <tr key={i}>
                        {displayedResult.columns.map((col) => (
                          <td key={col}>{formatCell(row[col])}</td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function formatCell(value: unknown): string {
  if (value === null || value === undefined) return "∅";
  if (typeof value === "object") return JSON.stringify(value);
  return String(value);
}
