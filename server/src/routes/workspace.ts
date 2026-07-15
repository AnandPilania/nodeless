import { Router } from "express";
import {
  buildFileTree,
  readFileContent,
  readPackageInfo,
  writeFileContent
} from "../services/workspace.js";

export function createWorkspaceRouter(getRoot: () => string): Router {
  const router = Router();

  router.get("/tree", async (_req, res) => {
    try {
      const tree = await buildFileTree(getRoot());
      res.json(tree);
    } catch (err) {
      res.status(500).json({ error: (err as Error).message });
    }
  });

  router.get("/package", async (_req, res) => {
    try {
      const info = await readPackageInfo(getRoot());
      if (!info) {
        res.status(404).json({ error: "No package.json found in workspace root" });
        return;
      }
      res.json(info);
    } catch (err) {
      res.status(500).json({ error: (err as Error).message });
    }
  });

  router.get("/file", async (req, res) => {
    const relativePath = req.query.path as string | undefined;
    if (!relativePath) {
      res.status(400).json({ error: "Missing path query parameter" });
      return;
    }
    try {
      const content = await readFileContent(getRoot(), relativePath);
      res.json({ path: relativePath, content });
    } catch (err) {
      res.status(500).json({ error: (err as Error).message });
    }
  });

  router.put("/file", async (req, res) => {
    const { path: relativePath, content } = req.body as { path?: string; content?: string };
    if (!relativePath || typeof content !== "string") {
      res.status(400).json({ error: "Missing path or content in request body" });
      return;
    }
    try {
      await writeFileContent(getRoot(), relativePath, content);
      res.json({ success: true });
    } catch (err) {
      res.status(500).json({ error: (err as Error).message });
    }
  });

  return router;
}
