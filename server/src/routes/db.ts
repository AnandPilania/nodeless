import { Router } from "express";
import { DbConnectionManager } from "../services/db/connectionManager.js";
import type { DbConnectionConfig } from "../types/index.js";

export function createDbRouter(manager: DbConnectionManager): Router {
  const router = Router();

  router.get("/connections", (_req, res) => {
    res.json(manager.list());
  });

  router.post("/connections", async (req, res) => {
    try {
      const body = req.body as Omit<DbConnectionConfig, "id">;
      const config = await manager.createConnection(body);
      res.json(config);
    } catch (err) {
      res.status(400).json({ error: (err as Error).message });
    }
  });

  router.delete("/connections/:id", async (req, res) => {
    await manager.close(req.params.id);
    res.json({ success: true });
  });

  router.get("/connections/:id/tables", async (req, res) => {
    try {
      const adapter = manager.getAdapter(req.params.id);
      const tables = await adapter.listTables();
      res.json(tables);
    } catch (err) {
      res.status(400).json({ error: (err as Error).message });
    }
  });

  router.get("/connections/:id/tables/:tableName/rows", async (req, res) => {
    try {
      const adapter = manager.getAdapter(req.params.id);
      const limit = Number(req.query.limit ?? 100);
      const offset = Number(req.query.offset ?? 0);
      const schema = (req.query.schema as string | undefined) ?? null;
      const result = await adapter.fetchTableRows(req.params.tableName, schema, limit, offset);
      res.json(result);
    } catch (err) {
      res.status(400).json({ error: (err as Error).message });
    }
  });

  router.post("/connections/:id/query", async (req, res) => {
    try {
      const { sql } = req.body as { sql?: string };
      if (!sql) {
        res.status(400).json({ error: "Missing sql in request body" });
        return;
      }
      const adapter = manager.getAdapter(req.params.id);
      const result = await adapter.runQuery(sql);
      res.json(result);
    } catch (err) {
      res.status(400).json({ error: (err as Error).message });
    }
  });

  return router;
}
