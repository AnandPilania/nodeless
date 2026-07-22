import { useCallback, useEffect, useRef, useState } from "react";
import { api } from "./api/client";
import { FileExplorer } from "./components/FileExplorer";
import { PackagePanel } from "./components/PackagePanel";
import { FileEditor } from "./components/FileEditor";
import { LivePreview } from "./components/LivePreview";
import { SnippetRunner } from "./components/SnippetRunner";
import { DbExplorer } from "./components/DbExplorer";
import { OutputConsole } from "./components/OutputConsole";
import { useRunSocket } from "./hooks/useRunSocket";
import type { FileNode, PackageInfo, ProcessOutputEvent } from "./types";

type CenterTab = "editor" | "snippet" | "database";
type EditorViewMode = "code" | "split" | "preview";

interface ConsoleLine {
  id: string;
  type: ProcessOutputEvent["type"];
  text: string;
}

let lineCounter = 0;

export default function App() {
  const [workspaceRoot, setWorkspaceRoot] = useState("");
  const [rootInput, setRootInput] = useState("");
  const [tree, setTree] = useState<FileNode | null>(null);
  const [pkg, setPkg] = useState<PackageInfo | null>(null);
  const [selectedFile, setSelectedFile] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<CenterTab>("editor");
  const [editorViewMode, setEditorViewMode] = useState<EditorViewMode>("code");

  const [consoleLines, setConsoleLines] = useState<ConsoleLine[]>([]);
  const [activeRunId, setActiveRunId] = useState<string | null>(null);
  const [activeLabel, setActiveLabel] = useState<string | null>(null);
  const [runningScripts, setRunningScripts] = useState<Set<string>>(new Set());
  const runLabelMap = useRef<Map<string, string>>(new Map());

  const loadWorkspace = useCallback(async () => {
    const rootRes = await api.getWorkspaceRoot();
    setWorkspaceRoot(rootRes.root);
    setRootInput(rootRes.root);
    const [treeRes, pkgRes] = await Promise.all([
      api.getFileTree().catch(() => null),
      api.getPackageInfo().catch(() => null)
    ]);
    setTree(treeRes);
    setPkg(pkgRes);
  }, []);

  useEffect(() => {
    loadWorkspace();
  }, [loadWorkspace]);

  const handleWsEvent = useCallback((event: ProcessOutputEvent) => {
    if (event.type === "started") {
      setActiveRunId(event.runId);
      return;
    }

    if (event.type === "stdout" || event.type === "stderr") {
      setConsoleLines((prev) => [
        ...prev,
        { id: `line-${lineCounter++}`, type: event.type, text: event.data ?? "" }
      ]);
      return;
    }

    if (event.type === "error") {
      setConsoleLines((prev) => [
        ...prev,
        { id: `line-${lineCounter++}`, type: "error" as ProcessOutputEvent["type"], text: event.data ?? "" }
      ]);
      return;
    }

    if (event.type === "exit") {
      setConsoleLines((prev) => [
        ...prev,
        {
          id: `line-${lineCounter++}`,
          type: "exit",
          text: `\nProcess exited with code ${event.code}${event.signal ? ` (signal ${event.signal})` : ""}`
        }
      ]);
      setActiveRunId((current) => (current === event.runId ? null : current));
      const label = runLabelMap.current.get(event.runId);
      if (label) {
        setRunningScripts((prev) => {
          const next = new Set(prev);
          next.delete(label);
          return next;
        });
        runLabelMap.current.delete(event.runId);
      }
    }
  }, []);

  useRunSocket(handleWsEvent);

  async function handleSetRoot() {
    await api.setWorkspaceRoot(rootInput);
    await loadWorkspace();
  }

  async function handleRunScript(scriptName: string) {
    setConsoleLines([]);
    setActiveTab("editor");
    const { runId } = await api.runNpmScript(scriptName);
    setActiveLabel(`npm run ${scriptName}`);
    runLabelMap.current.set(runId, scriptName);
    setRunningScripts((prev) => new Set(prev).add(scriptName));
  }

  async function handleRunFile(filePath: string) {
    setConsoleLines([]);
    setActiveTab("editor");
    const { runId, target } = await api.runFile(filePath);
    setActiveLabel(target.label);
    runLabelMap.current.set(runId, filePath);
  }

  async function handleStop() {
    if (!activeRunId) return;
    await api.stopRun(activeRunId);
  }

  return (
    <div className="app-shell">
      <header className="topbar">
        <div className="topbar-brand">
          <span className="topbar-mark">◆</span>
          nodeless
        </div>
        <div className="topbar-root">
          <input
            value={rootInput}
            onChange={(e) => setRootInput(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleSetRoot()}
            spellCheck={false}
          />
          <button onClick={handleSetRoot}>open</button>
        </div>
        <div className="topbar-status">{workspaceRoot && <span className="topbar-root-label">{workspaceRoot}</span>}</div>
      </header>

      <div className="workbench">
        <aside className="left-panel">
          <div className="panel-section panel-section-tree">
            <div className="section-label">Files</div>
            <FileExplorer
              tree={tree}
              selectedPath={selectedFile}
              onSelectFile={(path) => {
                setSelectedFile(path);
                setActiveTab("editor");
              }}
              onRunFile={handleRunFile}
            />
          </div>
          <div className="panel-section panel-section-package">
            <PackagePanel pkg={pkg} onRunScript={handleRunScript} runningScripts={runningScripts} />
          </div>
        </aside>

        <main className="center-panel">
          <div className="tab-bar">
            <button className={`tab ${activeTab === "editor" ? "tab-active" : ""}`} onClick={() => setActiveTab("editor")}>
              Editor
            </button>
            <button className={`tab ${activeTab === "snippet" ? "tab-active" : ""}`} onClick={() => setActiveTab("snippet")}>
              Snippet Runner
            </button>
            <button className={`tab ${activeTab === "database" ? "tab-active" : ""}`} onClick={() => setActiveTab("database")}>
              Database
            </button>
            {activeTab === "editor" && (
              <div className="view-mode-toggle">
                <button
                  className={`view-mode-btn ${editorViewMode === "code" ? "view-mode-btn-active" : ""}`}
                  onClick={() => setEditorViewMode("code")}
                >
                  code
                </button>
                <button
                  className={`view-mode-btn ${editorViewMode === "split" ? "view-mode-btn-active" : ""}`}
                  onClick={() => setEditorViewMode("split")}
                >
                  split
                </button>
                <button
                  className={`view-mode-btn ${editorViewMode === "preview" ? "view-mode-btn-active" : ""}`}
                  onClick={() => setEditorViewMode("preview")}
                >
                  preview
                </button>
              </div>
            )}
          </div>
          <div className="tab-content">
            {activeTab === "editor" && editorViewMode === "code" && <FileEditor path={selectedFile} />}
            {activeTab === "editor" && editorViewMode === "preview" && <LivePreview entryPath={selectedFile} />}
            {activeTab === "editor" && editorViewMode === "split" && (
              <div className="editor-split">
                <div className="editor-split-pane">
                  <FileEditor path={selectedFile} />
                </div>
                <div className="editor-split-pane">
                  <LivePreview entryPath={selectedFile} />
                </div>
              </div>
            )}
            {activeTab === "snippet" && <SnippetRunner />}
            {activeTab === "database" && <DbExplorer />}
          </div>
        </main>

        <aside className="right-panel">
          <OutputConsole
            lines={consoleLines}
            activeRunId={activeRunId}
            activeLabel={activeLabel}
            onStop={handleStop}
            onClear={() => setConsoleLines([])}
          />
        </aside>
      </div>
    </div>
  );
}
