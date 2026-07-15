import { Router } from "express";
import { executeSnippet } from "../services/snippetExecutor.js";
import type { SnippetExecutionRequest } from "../types/index.js";

export function createSnippetRouter(): Router {
  const router = Router();

  router.post("/execute", async (req, res) => {
    const { code, timeoutMs } = req.body as SnippetExecutionRequest;
    if (!code || typeof code !== "string") {
      res.status(400).json({ error: "Missing code in request body" });
      return;
    }
    const result = await executeSnippet(code, timeoutMs);
    res.json(result);
  });

  return router;
}
