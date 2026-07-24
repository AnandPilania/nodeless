import { useEffect, useRef, useState } from "react";

export interface LayoutVisibility {
  showFiles: boolean;
  showPackage: boolean;
  showConsole: boolean;
}

interface LayoutMenuProps {
  visibility: LayoutVisibility;
  onToggle: (key: keyof LayoutVisibility) => void;
  onResetLayout: () => void;
}

const OPTIONS: { key: keyof LayoutVisibility; label: string }[] = [
  { key: "showFiles", label: "Files panel" },
  { key: "showPackage", label: "Scripts panel" },
  { key: "showConsole", label: "Output console" }
];

export function LayoutMenu({ visibility, onToggle, onResetLayout }: LayoutMenuProps) {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function handleClickOutside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [open]);

  return (
    <div className="layout-menu" ref={containerRef}>
      <button className="layout-menu-trigger" onClick={() => setOpen((v) => !v)} title="Customize layout">
        <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
          <rect x="1.5" y="1.5" width="5" height="13" rx="1" stroke="currentColor" strokeWidth="1.2" />
          <rect x="9.5" y="1.5" width="5" height="7.5" rx="1" stroke="currentColor" strokeWidth="1.2" />
          <rect x="9.5" y="10.5" width="5" height="4" rx="1" stroke="currentColor" strokeWidth="1.2" />
        </svg>
        Layout
      </button>
      {open && (
        <div className="layout-menu-dropdown">
          <div className="layout-menu-heading">Show panels</div>
          {OPTIONS.map((opt) => (
            <label key={opt.key} className="layout-menu-option">
              <input
                type="checkbox"
                checked={visibility[opt.key]}
                onChange={() => onToggle(opt.key)}
              />
              {opt.label}
            </label>
          ))}
          <div className="layout-menu-divider" />
          <button
            className="layout-menu-reset"
            onClick={() => {
              onResetLayout();
              setOpen(false);
            }}
          >
            Reset layout
          </button>
        </div>
      )}
    </div>
  );
}
