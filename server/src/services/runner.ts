import { spawn, type ChildProcess } from "node:child_process";
import crypto from "node:crypto";
import path from "node:path";
import treeKill from "tree-kill";
import type { ProcessOutputEvent, RunTarget } from "../types/index.js";

type EventListener = (event: ProcessOutputEvent) => void;

interface RunningProcess {
  runId: string;
  target: RunTarget;
  child: ChildProcess;
  startedAt: number;
}

export class ProcessRunner {
  private readonly running = new Map<string, RunningProcess>();
  private readonly listeners = new Set<EventListener>();

  onEvent(listener: EventListener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private emit(event: ProcessOutputEvent): void {
    for (const listener of this.listeners) {
      listener(event);
    }
  }

  listRunning(): { runId: string; label: string; pid?: number; startedAt: number }[] {
    return Array.from(this.running.values()).map((entry) => ({
      runId: entry.runId,
      label: entry.target.label,
      pid: entry.child.pid,
      startedAt: entry.startedAt
    }));
  }

  start(target: RunTarget): string {
    const runId = crypto.randomUUID();
    const child = spawn(target.command, target.args, {
      cwd: target.cwd,
      shell: false,
      env: { ...process.env, FORCE_COLOR: "0" }
    });

    this.running.set(runId, { runId, target, child, startedAt: Date.now() });

    this.emit({
      type: "started",
      runId,
      pid: child.pid,
      timestamp: Date.now()
    });

    child.stdout?.on("data", (chunk: Buffer) => {
      this.emit({
        type: "stdout",
        runId,
        data: chunk.toString("utf-8"),
        timestamp: Date.now()
      });
    });

    child.stderr?.on("data", (chunk: Buffer) => {
      this.emit({
        type: "stderr",
        runId,
        data: chunk.toString("utf-8"),
        timestamp: Date.now()
      });
    });

    child.on("error", (err) => {
      this.emit({
        type: "error",
        runId,
        data: err.message,
        timestamp: Date.now()
      });
    });

    child.on("exit", (code, signal) => {
      this.emit({
        type: "exit",
        runId,
        code,
        signal,
        timestamp: Date.now()
      });
      this.running.delete(runId);
    });

    return runId;
  }

  stop(runId: string): boolean {
    const entry = this.running.get(runId);
    if (!entry || entry.child.pid === undefined) return false;
    treeKill(entry.child.pid, "SIGTERM");
    return true;
  }

  writeStdin(runId: string, data: string): boolean {
    const entry = this.running.get(runId);
    if (!entry || !entry.child.stdin) return false;
    entry.child.stdin.write(data);
    return true;
  }
}

export function buildNpmScriptTarget(
  cwd: string,
  scriptName: string,
  command: string
): RunTarget {
  return {
    id: `npm:${scriptName}`,
    kind: "npm-script",
    label: `npm run ${scriptName}`,
    command: process.platform === "win32" ? "npm.cmd" : "npm",
    args: ["run", scriptName],
    cwd
  };
}

export function buildFileRunTarget(cwd: string, relativeFilePath: string): RunTarget {
  const ext = path.extname(relativeFilePath);
  const isTypescript = ext === ".ts" || ext === ".tsx";
  const nodeBin = process.platform === "win32" ? "node.exe" : "node";

  if (isTypescript) {
    return {
      id: `file:${relativeFilePath}`,
      kind: "file",
      label: `tsx ${relativeFilePath}`,
      command: process.platform === "win32" ? "npx.cmd" : "npx",
      args: ["tsx", relativeFilePath],
      cwd
    };
  }

  return {
    id: `file:${relativeFilePath}`,
    kind: "file",
    label: `node ${relativeFilePath}`,
    command: nodeBin,
    args: [relativeFilePath],
    cwd
  };
}
