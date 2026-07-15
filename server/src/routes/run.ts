import { Router } from "express";
import { buildFileRunTarget, buildNpmScriptTarget, ProcessRunner } from "../services/runner.js";
import { readPackageInfo } from "../services/workspace.js";

export function createRunRouter(runner: ProcessRunner, getRoot: () => string): Router {
  const router = Router();

  router.get("/active", (_req, res) => {
    res.json(runner.listRunning());
  });

  router.post("/npm-script", async (req, res) => {
    const { scriptName } = req.body as { scriptName?: string };
    if (!scriptName) {
      res.status(400).json({ error: "Missing scriptName" });
      return;
    }
    const root = getRoot();
    const pkg = await readPackageInfo(root);
    if (!pkg || !pkg.scripts[scriptName]) {
      res.status(404).json({ error: `Script "${scriptName}" not found in package.json` });
      return;
    }
    const target = buildNpmScriptTarget(root, scriptName, pkg.scripts[scriptName]);
    const runId = runner.start(target);
    res.json({ runId, target });
  });

  router.post("/file", (req, res) => {
    const { filePath } = req.body as { filePath?: string };
    if (!filePath) {
      res.status(400).json({ error: "Missing filePath" });
      return;
    }
    const target = buildFileRunTarget(getRoot(), filePath);
    const runId = runner.start(target);
    res.json({ runId, target });
  });

  router.post("/:runId/stop", (req, res) => {
    const stopped = runner.stop(req.params.runId);
    res.json({ stopped });
  });

  router.post("/:runId/stdin", (req, res) => {
    const { data } = req.body as { data?: string };
    const written = runner.writeStdin(req.params.runId, data ?? "");
    res.json({ written });
  });

  return router;
}
