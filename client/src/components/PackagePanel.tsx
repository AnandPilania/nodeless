import type { PackageInfo } from "../types";

interface PackagePanelProps {
  pkg: PackageInfo | null;
  onRunScript: (scriptName: string) => void;
  runningScripts: Set<string>;
}

export function PackagePanel({ pkg, onRunScript, runningScripts }: PackagePanelProps) {
  if (!pkg) {
    return <div className="panel-empty">No package.json in workspace root</div>;
  }

  return (
    <div className="package-panel">
      <div className="package-heading">
        <span className="package-name">{pkg.name}</span>
        <span className="package-version">v{pkg.version}</span>
      </div>

      {pkg.detectedFrameworks.length > 0 && (
        <div className="framework-plugs">
          {pkg.detectedFrameworks.map((fw) => (
            <span key={fw} className="framework-plug">
              <span className="plug-dot" />
              {fw}
            </span>
          ))}
        </div>
      )}

      <div className="section-label">Scripts</div>
      <div className="script-list">
        {Object.entries(pkg.scripts).map(([name, command]) => {
          const isRunning = runningScripts.has(name);
          return (
            <div key={name} className="script-row">
              <div className="script-info">
                <span className="script-name">{name}</span>
                <span className="script-command">{command}</span>
              </div>
              <button
                className={`script-run-btn ${isRunning ? "script-run-btn-active" : ""}`}
                onClick={() => onRunScript(name)}
                disabled={isRunning}
              >
                {isRunning ? "running" : "run"}
              </button>
            </div>
          );
        })}
        {Object.keys(pkg.scripts).length === 0 && (
          <div className="panel-empty-inline">No scripts defined</div>
        )}
      </div>
    </div>
  );
}
