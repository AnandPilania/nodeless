import { useEffect, useRef } from "react";
import type { ProcessOutputEvent } from "../types";

interface ConsoleLine {
  id: string;
  type: ProcessOutputEvent["type"];
  text: string;
}

interface OutputConsoleProps {
  lines: ConsoleLine[];
  activeRunId: string | null;
  activeLabel: string | null;
  onStop: () => void;
  onClear: () => void;
}

export function OutputConsole({ lines, activeRunId, activeLabel, onStop, onClear }: OutputConsoleProps) {
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ block: "end" });
  }, [lines.length]);

  return (
    <div className="output-console">
      <div className="console-header">
        <div className="console-title">
          <span className={`console-status-dot ${activeRunId ? "console-status-live" : ""}`} />
          {activeLabel ?? "Output"}
        </div>
        <div className="console-actions">
          {activeRunId && (
            <button className="console-btn console-btn-stop" onClick={onStop}>
              stop
            </button>
          )}
          <button className="console-btn" onClick={onClear}>
            clear
          </button>
        </div>
      </div>
      <div className="console-body">
        {lines.length === 0 && <div className="console-placeholder">No output yet. Run a script or file.</div>}
        {lines.map((line) => (
          <div key={line.id} className={`console-line console-line-${line.type}`}>
            {line.text}
          </div>
        ))}
        <div ref={bottomRef} />
      </div>
    </div>
  );
}
