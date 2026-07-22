import { useCallback, useEffect, useRef, useState } from "react";
import { api, BACKEND_ORIGIN } from "../api/client";
import { resolveProvider } from "../preview/registry";
import { detectCssFrameworks } from "../preview/cssFrameworks";
import { extractMountElementId, findIndexHtmlPath } from "../preview/mountElementDetection";

interface LivePreviewProps {
  entryPath: string | null;
}

type PreviewStatus = "idle" | "loading" | "rendered" | "error";

export function LivePreview({ entryPath }: LivePreviewProps) {
  const [status, setStatus] = useState<PreviewStatus>("idle");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [iframeSrc, setIframeSrc] = useState<string>("");
  const [renderNonce, setRenderNonce] = useState(0);
  const [supported, setSupported] = useState(true);
  const [providerLabel, setProviderLabel] = useState<string | null>(null);
  const [cssLabels, setCssLabels] = useState<string[]>([]);
  const reloadTokenRef = useRef(0);

  const runPreview = useCallback(async () => {
    if (!entryPath) return;

    const token = ++reloadTokenRef.current;
    setStatus("loading");
    setErrorMessage(null);

    try {
      const fileRes = await api.getFile(entryPath);
      const provider = resolveProvider(entryPath, fileRes.content);

      if (!provider) {
        if (token !== reloadTokenRef.current) return;
        setSupported(false);
        setStatus("idle");
        return;
      }
      setSupported(true);
      setProviderLabel(provider.label);

      const graphRes = await fetch(`/api/workspace/module-graph?entry=${encodeURIComponent(entryPath)}`);
      const graphBody = (await graphRes.json()) as {
        modules?: { path: string; content: string }[];
        error?: string;
      };
      if (!graphRes.ok || !graphBody.modules) {
        throw new Error(graphBody.error ?? "Failed to resolve module graph");
      }

      let dependencyVersions: Record<string, string> = {};
      try {
        const pkg = await api.getPackageInfo();
        dependencyVersions = { ...pkg.dependencies, ...pkg.devDependencies };
      } catch {
        dependencyVersions = {};
      }

      const cssFrameworks = detectCssFrameworks(dependencyVersions, graphBody.modules);
      setCssLabels(cssFrameworks.map((f) => f.id));

      let mountElementId: string | undefined;
      try {
        const tree = await api.getFileTree();
        const indexHtmlPath = findIndexHtmlPath(tree);
        if (indexHtmlPath) {
          const indexHtmlFile = await api.getFile(indexHtmlPath);
          mountElementId = extractMountElementId(indexHtmlFile.content) ?? undefined;
        }
      } catch {
        mountElementId = undefined;
      }

      const output = await provider.compile({
        entryPath,
        modules: graphBody.modules,
        dependencyVersions,
        cssFrameworks,
        mountElementId
      });

      const storeRes = await fetch(`${BACKEND_ORIGIN}/api/preview`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ html: output.document })
      });
      const storeBody = (await storeRes.json()) as { id?: string; error?: string };
      if (!storeRes.ok || !storeBody.id) {
        throw new Error(storeBody.error ?? "Failed to store preview document");
      }

      if (token !== reloadTokenRef.current) return;
      setIframeSrc(`${BACKEND_ORIGIN}/preview/${storeBody.id}`);
      setRenderNonce(token);
    } catch (err) {
      if (token !== reloadTokenRef.current) return;
      setStatus("error");
      setErrorMessage((err as Error).message);
    }
  }, [entryPath]);

  useEffect(() => {
    runPreview();
  }, [runPreview]);

  useEffect(() => {
    function handleMessage(event: MessageEvent) {
      const data = event.data as { source?: string; type?: string; message?: string; stack?: string };
      if (data?.source !== "nodeless-preview") return;
      if (data.type === "rendered") {
        setStatus("rendered");
        setErrorMessage(null);
      } else if (data.type === "error") {
        setStatus("error");
        setErrorMessage(data.stack ?? data.message ?? "Unknown preview error");
      }
    }
    window.addEventListener("message", handleMessage);
    return () => window.removeEventListener("message", handleMessage);
  }, []);

  if (!entryPath) {
    return <div className="panel-empty">Select a file to preview</div>;
  }

  if (!supported) {
    return (
      <div className="preview-unsupported">
        <div className="preview-unsupported-title">No live preview for this file type</div>
        <div className="preview-unsupported-body">
          Live preview currently supports React (.jsx/.tsx), Vue (.vue), Svelte (.svelte), and plain HTML files.
        </div>
      </div>
    );
  }

  return (
    <div className="live-preview">
      <div className="preview-toolbar">
        <div className="preview-status">
          <span className={`preview-status-dot preview-status-${status}`} />
          {status === "loading" && "bundling…"}
          {status === "rendered" && "live"}
          {status === "error" && "error"}
          {status === "idle" && "idle"}
        </div>
        <div className="preview-toolbar-tags">
          {providerLabel && <span className="preview-tag">{providerLabel}</span>}
          {cssLabels.map((label) => (
            <span key={label} className="preview-tag preview-tag-css">
              {label}
            </span>
          ))}
        </div>
        <button className="preview-reload-btn" onClick={runPreview}>
          reload
        </button>
      </div>
      {errorMessage && <div className="preview-error-banner">{errorMessage}</div>}
      <div className="preview-frame-wrap">
        {iframeSrc && (
          <iframe
            key={renderNonce}
            className="preview-frame"
            sandbox="allow-scripts allow-same-origin"
            src={iframeSrc}
            title="Live preview"
          />
        )}
      </div>
    </div>
  );
}
