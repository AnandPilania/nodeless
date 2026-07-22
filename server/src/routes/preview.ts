import { Router } from "express";
import { getPreviewDocument, storePreviewDocument } from "../services/previewStore.js";

export function createPreviewRouter(): Router {
  const router = Router();

  router.post("/", (req, res) => {
    const { html } = req.body as { html?: string };
    if (!html || typeof html !== "string") {
      res.status(400).json({ error: "Missing html in request body" });
      return;
    }
    const id = storePreviewDocument(html);
    res.json({ id });
  });

  router.get("/:id", (req, res) => {
    const html = getPreviewDocument(req.params.id);
    if (html === null) {
      res.status(404).send("Preview not found or expired");
      return;
    }
    res.setHeader("Content-Type", "text/html; charset=utf-8");
    res.setHeader("Cache-Control", "no-store");
    res.send(html);
  });

  return router;
}
