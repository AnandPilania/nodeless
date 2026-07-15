import Editor from "@monaco-editor/react";
import { useState } from "react";
import { api } from "../api/client";
import type { SnippetExecutionResult } from "../types";

const DEFAULT_SNIPPET = `const items = [1, 2, 3, 4, 5];
const doubled = items.map((n) => n * 2);
console.log("doubled:", doubled);
return doubled.reduce((a, b) => a + b, 0);
`;

function formatArg(arg: unknown): string {
  if (typeof arg === "string") return arg;
  return JSON.stringify(arg, null, 2);
}

export function SnippetRunner() {
  const [code, setCode] = useState(DEFAULT_SNIPPET);
  const [result, setResult] = useState<SnippetExecutionResult | null>(null);
  const [executing, setExecuting] = useState(false);

  async function handleRun() {
    setExecuting(true);
    setResult(null);
    try {
      const res = await api.executeSnippet(code, 30000);
      setResult(res);
    } catch (err) {
      setResult({
        success: false,
        logs: [],
        error: { message: (err as Error).message },
        durationMs: 0
      });
    } finally {
      setExecuting(false);
    }
  }

  return (
    <div className="snippet-runner">
      <div className="snippet-editor-wrap">
        <Editor
          height="100%"
          defaultLanguage="javascript"
          value={code}
          onChange={(value) => setCode(value ?? "")}
          theme="vs-dark"
          options={{
            fontSize: 13,
            fontFamily: "'JetBrains Mono', monospace",
            minimap: { enabled: false },
            padding: { top: 12 },
            scrollBeyondLastLine: false
          }}
        />
      </div>
      <div className="snippet-toolbar">
        <button className="snippet-run-btn" onClick={handleRun} disabled={executing}>
          {executing ? "executing…" : "run snippet"}
        </button>
        <span className="snippet-hint">Runs in an isolated worker · use `return` for a result value</span>
      </div>
      <div className="snippet-result">
        {result === null && !executing && (
          <div className="console-placeholder">Result and console output will appear here.</div>
        )}
        {result && (
          <>
            {result.logs.map((log, i) => (
              <div key={i} className={`console-line console-line-${log.level === "error" ? "stderr" : "stdout"}`}>
                {log.args.map(formatArg).join(" ")}
              </div>
            ))}
            {result.success ? (
              <div className="snippet-result-value">
                <span className="snippet-result-label">Result</span>
                <pre>{formatArg(result.result)}</pre>
              </div>
            ) : (
              <div className="snippet-result-error">
                <span className="snippet-result-label">Error</span>
                <pre>{result.error?.message}</pre>
              </div>
            )}
            <div className="snippet-duration">{result.durationMs}ms</div>
          </>
        )}
      </div>
    </div>
  );
}
