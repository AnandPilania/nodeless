import { useEffect, useState } from "react";
import { api } from "../api/client";

interface FolderPickerProps {
  initialPath: string;
  onSelect: (path: string) => void;
  onClose: () => void;
}

interface DirEntry {
  name: string;
  path: string;
  hasPackageJson: boolean;
}

function splitBreadcrumbsPosix(fullPath: string): { label: string; path: string }[] {
  const normalized = fullPath.replace(/\/+$/, "") || "/";
  const parts = normalized.split("/").filter(Boolean);
  const crumbs: { label: string; path: string }[] = [{ label: "/", path: "/" }];
  let accumulated = "";
  for (const part of parts) {
    accumulated += `/${part}`;
    crumbs.push({ label: part, path: accumulated });
  }
  return crumbs;
}

function splitBreadcrumbsWindows(fullPath: string): { label: string; path: string }[] {
  const normalized = fullPath.replace(/\/+$/g, "\\").replace(/\\+$/, "");
  const driveMatch = normalized.match(/^([A-Za-z]:)(.*)$/);
  if (!driveMatch) return [{ label: normalized || fullPath, path: fullPath }];

  const [, drive, rest] = driveMatch;
  const crumbs: { label: string; path: string }[] = [{ label: `${drive}\\`, path: `${drive}\\` }];
  const parts = rest.split("\\").filter(Boolean);
  let accumulated = `${drive}\\`;
  for (const part of parts) {
    accumulated = accumulated.endsWith("\\") ? `${accumulated}${part}` : `${accumulated}\\${part}`;
    crumbs.push({ label: part, path: accumulated });
  }
  return crumbs;
}

export function FolderPicker({ initialPath, onSelect, onClose }: FolderPickerProps) {
  const [currentPath, setCurrentPath] = useState<string | null>(null);
  const [parentPath, setParentPath] = useState<string | null>(null);
  const [entries, setEntries] = useState<DirEntry[]>([]);
  const [isDriveList, setIsDriveList] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [manualPath, setManualPath] = useState(initialPath);
  const [isWindows, setIsWindows] = useState(false);
  const [driveSentinel, setDriveSentinel] = useState<string | null>(null);

  useEffect(() => {
    api
      .browsePlatform()
      .then((info) => {
        setIsWindows(info.isWindows);
        setDriveSentinel(info.driveListSentinel);
      })
      .catch(() => undefined);
  }, []);

  async function load(path?: string) {
    setLoading(true);
    setError(null);
    try {
      const listing = await api.browseDirectory(path);
      setCurrentPath(listing.path);
      setParentPath(listing.parentPath);
      setEntries(listing.entries);
      setIsDriveList(Boolean(listing.isDriveList));
      if (!listing.isDriveList) {
        setManualPath(listing.path);
      }
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load(initialPath);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onClose]);

  const breadcrumbs =
    currentPath && !isDriveList
      ? isWindows
        ? splitBreadcrumbsWindows(currentPath)
        : splitBreadcrumbsPosix(currentPath)
      : [];

  return (
    <div className="folder-picker-overlay" onClick={onClose}>
      <div className="folder-picker" onClick={(e) => e.stopPropagation()}>
        <div className="folder-picker-header">
          <span>Open project folder</span>
          <button className="folder-picker-close" onClick={onClose} aria-label="Close">
            ×
          </button>
        </div>

        <div className="folder-picker-breadcrumbs">
          {isWindows && driveSentinel && (
            <span className="folder-picker-breadcrumb-item">
              <button
                className={isDriveList ? "folder-picker-breadcrumb-active" : ""}
                onClick={() => load(driveSentinel)}
              >
                This PC
              </button>
              {!isDriveList && <span className="folder-picker-breadcrumb-sep">\</span>}
            </span>
          )}
          {breadcrumbs.map((crumb, i) => (
            <span key={crumb.path} className="folder-picker-breadcrumb-item">
              <button onClick={() => load(crumb.path)}>{crumb.label}</button>
              {i < breadcrumbs.length - 1 && (
                <span className="folder-picker-breadcrumb-sep">{isWindows ? "\\" : "/"}</span>
              )}
            </span>
          ))}
        </div>

        <div className="folder-picker-list">
          {loading && <div className="folder-picker-empty">Loading…</div>}
          {!loading && error && <div className="folder-picker-error">{error}</div>}
          {!loading && !error && parentPath && (
            <button className="folder-picker-row folder-picker-row-up" onClick={() => load(parentPath)}>
              <span className="folder-picker-icon">↰</span> ..
            </button>
          )}
          {!loading &&
            !error &&
            entries.map((entry) => (
              <button key={entry.path} className="folder-picker-row" onClick={() => load(entry.path)}>
                <span className="folder-picker-icon">{isDriveList ? "💽" : "▸"}</span>
                <span className="folder-picker-name">{entry.name}</span>
                {entry.hasPackageJson && <span className="folder-picker-badge">package.json</span>}
              </button>
            ))}
          {!loading && !error && entries.length === 0 && !parentPath && (
            <div className="folder-picker-empty">
              {isDriveList ? "No drives found" : "No subfolders here"}
            </div>
          )}
        </div>

        <div className="folder-picker-footer">
          <input
            className="folder-picker-manual-input"
            value={manualPath}
            onChange={(e) => setManualPath(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && load(manualPath)}
            spellCheck={false}
            placeholder={isWindows ? "C:\\Users\\you\\projects\\my-app" : "/home/you/projects/my-app"}
          />
          <button
            className="folder-picker-select-btn"
            disabled={!currentPath || isDriveList}
            onClick={() => currentPath && !isDriveList && onSelect(currentPath)}
            title={isDriveList ? "Choose a drive first" : undefined}
          >
            Open this folder
          </button>
        </div>
      </div>
    </div>
  );
}
