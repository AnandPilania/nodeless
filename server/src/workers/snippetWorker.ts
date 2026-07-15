import { parentPort, workerData } from "node:worker_threads";
import vm from "node:vm";

interface WorkerInput {
  code: string;
}

interface LogEntry {
  level: "log" | "warn" | "error" | "info";
  args: unknown[];
}

function serializeValue(value: unknown): unknown {
  if (value instanceof Error) {
    return { __isError: true, message: value.message, stack: value.stack };
  }
  if (typeof value === "bigint") {
    return value.toString() + "n";
  }
  if (typeof value === "function") {
    return `[Function: ${value.name || "anonymous"}]`;
  }
  if (typeof value === "undefined") {
    return undefined;
  }
  try {
    JSON.stringify(value);
    return value;
  } catch {
    return String(value);
  }
}

async function run(): Promise<void> {
  const { code } = workerData as WorkerInput;
  const logs: LogEntry[] = [];

  const sandboxConsole = {
    log: (...args: unknown[]) => logs.push({ level: "log", args: args.map(serializeValue) }),
    info: (...args: unknown[]) => logs.push({ level: "info", args: args.map(serializeValue) }),
    warn: (...args: unknown[]) => logs.push({ level: "warn", args: args.map(serializeValue) }),
    error: (...args: unknown[]) => logs.push({ level: "error", args: args.map(serializeValue) })
  };

  const context = vm.createContext({
    console: sandboxConsole,
    setTimeout,
    clearTimeout,
    setInterval,
    clearInterval,
    Buffer,
    URL,
    URLSearchParams,
    TextEncoder,
    TextDecoder,
    fetch,
    process: { env: process.env, version: process.version, platform: process.platform },
    __dirname: process.cwd(),
    __filename: "snippet.js"
  });

  const wrapped = `
    (async () => {
      ${code}
    })()
  `;

  const started = Date.now();
  try {
    const script = new vm.Script(wrapped, { filename: "snippet.vm.js" });
    const resultPromise = script.runInContext(context, { timeout: 25000 });
    const result = await resultPromise;
    parentPort?.postMessage({
      success: true,
      result: serializeValue(result),
      logs,
      durationMs: Date.now() - started
    });
  } catch (err) {
    const error = err as Error;
    parentPort?.postMessage({
      success: false,
      logs,
      error: { message: error.message, stack: error.stack },
      durationMs: Date.now() - started
    });
  }
}

run();
