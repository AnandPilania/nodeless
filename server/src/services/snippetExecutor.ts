import { Worker } from "node:worker_threads";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { SnippetExecutionResult } from "../types/index.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const WORKER_PATH = path.join(__dirname, "..", "workers", "snippetWorkerEntry.mjs");

export async function executeSnippet(
  code: string,
  timeoutMs = 30000
): Promise<SnippetExecutionResult> {
  return new Promise((resolve) => {
    const worker = new Worker(WORKER_PATH, {
      workerData: { code },
      execArgv: ["--import", "tsx/esm"]
    });

    let settled = false;

    const timeout = setTimeout(() => {
      if (settled) return;
      settled = true;
      worker.terminate();
      resolve({
        success: false,
        logs: [],
        error: { message: `Execution timed out after ${timeoutMs}ms` },
        durationMs: timeoutMs
      });
    }, timeoutMs);

    worker.on("message", (message: SnippetExecutionResult) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      resolve(message);
      worker.terminate();
    });

    worker.on("error", (err) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      resolve({
        success: false,
        logs: [],
        error: { message: err.message, stack: err.stack },
        durationMs: 0
      });
    });
  });
}
