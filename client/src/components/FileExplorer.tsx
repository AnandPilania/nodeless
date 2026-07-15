import { useState } from "react";
import type { FileNode } from "../types";

interface FileExplorerProps {
  tree: FileNode | null;
  selectedPath: string | null;
  onSelectFile: (path: string) => void;
  onRunFile: (path: string) => void;
}

function FileTreeNode({
  node,
  depth,
  selectedPath,
  onSelectFile,
  onRunFile
}: {
  node: FileNode;
  depth: number;
  selectedPath: string | null;
  onSelectFile: (path: string) => void;
  onRunFile: (path: string) => void;
}) {
  const [expanded, setExpanded] = useState(depth < 1);
  const isRunnable = /\.(js|mjs|cjs|ts|mts)$/.test(node.name);

  if (node.type === "directory") {
    return (
      <div>
        <div
          className="tree-row tree-row-dir"
          style={{ paddingLeft: 10 + depth * 14 }}
          onClick={() => setExpanded((prev) => !prev)}
        >
          <span className={`tree-caret ${expanded ? "tree-caret-open" : ""}`}>▸</span>
          <span className="tree-label">{node.name}</span>
        </div>
        {expanded && node.children?.map((child) => (
          <FileTreeNode
            key={child.path}
            node={child}
            depth={depth + 1}
            selectedPath={selectedPath}
            onSelectFile={onSelectFile}
            onRunFile={onRunFile}
          />
        ))}
      </div>
    );
  }

  return (
    <div
      className={`tree-row tree-row-file ${selectedPath === node.path ? "tree-row-selected" : ""}`}
      style={{ paddingLeft: 10 + depth * 14 }}
      onClick={() => onSelectFile(node.path)}
    >
      <span className="tree-label">{node.name}</span>
      {isRunnable && (
        <button
          className="tree-run-btn"
          title={`Run ${node.name}`}
          onClick={(e) => {
            e.stopPropagation();
            onRunFile(node.path);
          }}
        >
          ▶
        </button>
      )}
    </div>
  );
}

export function FileExplorer({ tree, selectedPath, onSelectFile, onRunFile }: FileExplorerProps) {
  if (!tree) {
    return <div className="panel-empty">No workspace loaded</div>;
  }

  return (
    <div className="file-tree">
      {tree.children?.map((child) => (
        <FileTreeNode
          key={child.path}
          node={child}
          depth={0}
          selectedPath={selectedPath}
          onSelectFile={onSelectFile}
          onRunFile={onRunFile}
        />
      ))}
    </div>
  );
}
