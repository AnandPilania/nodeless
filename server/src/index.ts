import express from "express";
import cors from "cors";
import http from "node:http";
import { createWorkspaceRouter } from "./routes/workspace.js";
import { createRunRouter } from "./routes/run.js";
import { createSnippetRouter } from "./routes/snippet.js";
import { createDbRouter } from "./routes/db.js";
import { createPreviewRouter } from "./routes/preview.js";
import { createBrowseRouter } from "./routes/browse.js";
import { ProcessRunner } from "./services/runner.js";
import { DbConnectionManager } from "./services/db/connectionManager.js";
import { attachWsBridge } from "./services/wsBridge.js";
import { resolveWorkspaceRoot } from "./services/workspace.js";

const PORT = Number(process.env.PORT ?? 4310);
const INITIAL_ROOT = process.env.WORKSPACE_ROOT ?? process.cwd();

let workspaceRoot = INITIAL_ROOT;

async function main(): Promise<void> {
    workspaceRoot = await resolveWorkspaceRoot(INITIAL_ROOT);

    const app = express();
    app.use(cors());
    app.use(express.json({ limit: "10mb" }));

    const runner = new ProcessRunner();
    const dbManager = new DbConnectionManager();

    app.get("/api/workspace/root", (_req, res) => {
        res.json({ root: workspaceRoot });
    });

    app.post("/api/workspace/root", async (req, res) => {
        const { root } = req.body as { root?: string };
        if (!root) {
            res.status(400).json({ error: "Missing root in request body" });
            return;
        }
        try {
            workspaceRoot = await resolveWorkspaceRoot(root);
            res.json({ root: workspaceRoot });
        } catch (err) {
            res.status(400).json({ error: (err as Error).message });
        }
    });

    app.use("/api/workspace", createWorkspaceRouter(() => workspaceRoot));
    app.use("/api/run", createRunRouter(runner, () => workspaceRoot));
    app.use("/api/snippet", createSnippetRouter());
    app.use("/api/db", createDbRouter(dbManager));
    app.use("/api/preview", createPreviewRouter());
    app.use("/preview", createPreviewRouter());
    app.use("/api/browse", createBrowseRouter());

    app.get("/api/health", (_req, res) => {
        res.json({ status: "ok", workspaceRoot });
    });

    const httpServer = http.createServer(app);
    attachWsBridge(httpServer, runner);

    httpServer.listen(PORT, () => {
        console.log(`nodeless server listening on port ${PORT}`);
        console.log(`workspace root: ${workspaceRoot}`);
    });
}

main().catch((err) => {
    console.error("Failed to start nodeless server:", err);
    process.exit(1);
});
