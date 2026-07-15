import Editor from "@monaco-editor/react";
import { useEffect, useState } from "react";
import { api } from "../api/client";

interface FileEditorProps {
  path: string | null;
}

function languageForPath(path: string): string {
  if (path.endsWith(".ts") || path.endsWith(".tsx")) return "typescript";
  if (path.endsWith(".json")) return "json";
  if (path.endsWith(".md")) return "markdown";
  if (path.endsWith(".html")) return "html";
  if (path.endsWith(".css")) return "css";
  return "javascript";
}

export function FileEditor({ path }: FileEditorProps) {
  const [content, setContent] = useState("");
  const [originalContent, setOriginalContent] = useState("");
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!path) return;
    setLoading(true);
    api
      .getFile(path)
      .then((res) => {
        setContent(res.content);
        setOriginalContent(res.content);
      })
      .finally(() => setLoading(false));
  }, [path]);

  async function handleSave() {
    if (!path) return;
    setSaving(true);
    try {
      await api.saveFile(path, content);
      setOriginalContent(content);
    } finally {
      setSaving(false);
    }
  }

  if (!path) {
    return <div className="panel-empty">Select a file to view or edit</div>;
  }

  const dirty = content !== originalContent;

  return (
    <div className="file-editor">
      <div className="file-editor-header">
        <span className="file-editor-path">{path}</span>
        <button className="file-editor-save-btn" onClick={handleSave} disabled={!dirty || saving}>
          {saving ? "saving…" : dirty ? "save" : "saved"}
        </button>
      </div>
      {loading ? (
        <div className="panel-empty">Loading…</div>
      ) : (
        <Editor
          height="100%"
          language={languageForPath(path)}
          value={content}
          onChange={(value) => setContent(value ?? "")}
          theme="vs-dark"
          options={{
            fontSize: 13,
            fontFamily: "'JetBrains Mono', monospace",
            minimap: { enabled: false },
            padding: { top: 12 },
            scrollBeyondLastLine: false
          }}
        />
      )}
    </div>
  );
}
