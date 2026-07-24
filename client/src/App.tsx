import { useCallback, useEffect, useRef, useState } from "react";
import { api } from "./api/client";
import { FileExplorer } from "./components/FileExplorer";
import { PackagePanel } from "./components/PackagePanel";
import { FileEditor } from "./components/FileEditor";
import { LivePreview } from "./components/LivePreview";
import { SnippetRunner } from "./components/SnippetRunner";
import { DbExplorer } from "./components/DbExplorer";
import { OutputConsole } from "./components/OutputConsole";
import { ResizeHandle } from "./components/ResizeHandle";
import { LayoutMenu, type LayoutVisibility } from "./components/LayoutMenu";
import { useRunSocket } from "./hooks/useRunSocket";
import { usePersistentState } from "./hooks/usePersistentState";
import { useWindowSize } from "./hooks/useWindowSize";
import type { FileNode, PackageInfo, ProcessOutputEvent } from "./types";

type CenterTab = "editor" | "snippet" | "database";
type EditorViewMode = "code" | "split" | "preview";

interface ConsoleLine {
  id: string;
  type: ProcessOutputEvent["type"];
  text: string;
}

let lineCounter = 0;

const DEFAULT_LAYOUT = {
  leftWidth: 260,
  rightWidth: 340,
  treeHeight: 280,
  splitEditorWidth: 0.5
};

const DEFAULT_VISIBILITY: LayoutVisibility = {
  showFiles: true,
  showPackage: true,
  showConsole: true
};

const LEFT_MIN = 180;
const LEFT_MAX_FALLBACK = 480;
const RIGHT_MIN = 220;
const RIGHT_MAX_FALLBACK = 560;
const CENTER_MIN = 280;

export default function App() {
  const [workspaceRoot, setWorkspaceRoot] = useState("");
  const [rootInput, setRootInput] = useState("");
  const [tree, setTree] = useState<FileNode | null>(null);
  const [pkg, setPkg] = useState<PackageInfo | null>(null);
  const [selectedFile, setSelectedFile] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<CenterTab>("editor");
  const [editorViewMode, setEditorViewMode] = useState<EditorViewMode>("code");

  const [layout, setLayout, resetLayout] = usePersistentState("nodeless:layout", DEFAULT_LAYOUT);
  const [visibility, setVisibility, resetVisibility] = usePersistentState(
    "nodeless:visibility",
    DEFAULT_VISIBILITY
  );
  const windowSize = useWindowSize();

  const [consoleLines, setConsoleLines] = useState<ConsoleLine[]>([]);
  const [activeRunId, setActiveRunId] = useState<string | null>(null);
  const [activeLabel, setActiveLabel] = useState<string | null>(null);
  const [runningScripts, setRunningScripts] = useState<Set<string>>(new Set());
  const runLabelMap = useRef<Map<string, string>>(new Map());
  const editorSplitRef = useRef<HTMLDivElement>(null);

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

  function handleToggleVisibility(key: keyof LayoutVisibility) {
    setVisibility((prev) => ({ ...prev, [key]: !prev[key] }));
  }

  function handleResetLayout() {
    resetLayout();
    resetVisibility();
  }

  const showLeftPanel = visibility.showFiles || visibility.showPackage;

  const availableForBothSidebars = Math.max(0, windowSize.width - CENTER_MIN);
  const leftMax = Math.max(
    LEFT_MIN,
    Math.min(LEFT_MAX_FALLBACK, availableForBothSidebars - (visibility.showConsole ? RIGHT_MIN : 0))
  );
  const rightMax = Math.max(
    RIGHT_MIN,
    Math.min(RIGHT_MAX_FALLBACK, availableForBothSidebars - (showLeftPanel ? LEFT_MIN : 0))
  );
  const effectiveLeftWidth = Math.min(layout.leftWidth, leftMax);
  const effectiveRightWidth = Math.min(layout.rightWidth, rightMax);

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
        <LayoutMenu visibility={visibility} onToggle={handleToggleVisibility} onResetLayout={handleResetLayout} />
      </header>

      <div className="workbench">
        {showLeftPanel && (
          <>
            <aside className="left-panel" style={{ width: effectiveLeftWidth, flexBasis: effectiveLeftWidth }}>
              {visibility.showFiles && (
                <div
                  className="panel-section panel-section-tree"
                  style={
                    visibility.showPackage
                      ? { height: layout.treeHeight, flexShrink: 0 }
                      : { flex: 1 }
                  }
                >
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
              )}
              {visibility.showFiles && visibility.showPackage && (
                <ResizeHandle
                  axis="vertical"
                  currentValue={layout.treeHeight}
                  minValue={120}
                  maxValue={400}
                  onChange={(next) => setLayout((prev) => ({ ...prev, treeHeight: next }))}
                />
              )}
              {visibility.showPackage && (
                <div className="panel-section panel-section-package" style={{ flex: 1 }}>
                  <PackagePanel pkg={pkg} onRunScript={handleRunScript} runningScripts={runningScripts} />
                </div>
              )}
            </aside>
            <ResizeHandle
              axis="horizontal"
              currentValue={effectiveLeftWidth}
              minValue={LEFT_MIN}
              maxValue={leftMax}
              onChange={(next) => setLayout((prev) => ({ ...prev, leftWidth: next }))}
            />
          </>
        )}

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
              <div className="editor-split" ref={editorSplitRef}>
                <div className="editor-split-pane" style={{ flexBasis: `${layout.splitEditorWidth * 100}%` }}>
                  <FileEditor path={selectedFile} />
                </div>
                <ResizeHandle
                  axis="horizontal"
                  currentValue={layout.splitEditorWidth}
                  minValue={0.15}
                  maxValue={0.85}
                  onChange={(next) => setLayout((prev) => ({ ...prev, splitEditorWidth: next }))}
                  containerRef={editorSplitRef}
                />
                <div className="editor-split-pane" style={{ flex: 1 }}>
                  <LivePreview entryPath={selectedFile} />
                </div>
              </div>
            )}
            {activeTab === "snippet" && <SnippetRunner />}
            {activeTab === "database" && <DbExplorer />}
          </div>
        </main>

        {visibility.showConsole && (
          <>
            <ResizeHandle
              axis="horizontal"
              inverted
              currentValue={effectiveRightWidth}
              minValue={RIGHT_MIN}
              maxValue={rightMax}
              onChange={(next) => setLayout((prev) => ({ ...prev, rightWidth: next }))}
            />
            <aside className="right-panel" style={{ width: effectiveRightWidth, flexBasis: effectiveRightWidth }}>
              <OutputConsole
                lines={consoleLines}
                activeRunId={activeRunId}
                activeLabel={activeLabel}
                onStop={handleStop}
                onClear={() => setConsoleLines([])}
              />
            </aside>
          </>
        )}
      </div>
    </div>
  );
}
