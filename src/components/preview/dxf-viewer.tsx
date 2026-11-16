import { useCallback, useEffect, useRef, useState } from "react";
import { AlertTriangle, Eye, EyeOff, Layers, Loader2, Maximize2, Minus, Plus, RefreshCw } from "lucide-react";
import type { DxfViewer as DxfViewerInstance, LayerInfo } from "dxf-viewer";
import { Button } from "../ui";
import { fetchPreviewBlob } from "../../lib/preview";

export interface DxfViewerLabels {
  loading: string;
  parsing: string;
  error: string;
  retry: string;
  zoomIn: string;
  zoomOut: string;
  fit: string;
  layers: string;
  showLayer: string;
  hideLayer: string;
}

interface DxfViewerProps {
  url: string;
  labels: DxfViewerLabels;
}

type Status = "loading" | "ready" | "error";

export function DxfViewer({ url, labels }: DxfViewerProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const viewerRef = useRef<DxfViewerInstance | null>(null);
  const [status, setStatus] = useState<Status>("loading");
  const [phase, setPhase] = useState<"fetch" | "parse" | "prepare">("fetch");
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [layers, setLayers] = useState<LayerInfo[]>([]);
  const [showLayers, setShowLayers] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    let cancelled = false;
    let objectUrl: string | null = null;
    const controller = new AbortController();
    setStatus("loading");
    setPhase("fetch");
    setProgress(0);
    setError(null);
    setLayers([]);

    (async () => {
      const [{ DxfViewer: Viewer }, { default: DxfWorker }] = await Promise.all([
        import("dxf-viewer"),
        import("../../workers/dxf.worker?worker&inline"),
      ]);
      if (cancelled) return;
      const blob = await fetchPreviewBlob(url, controller.signal);
      if (cancelled) return;
      objectUrl = URL.createObjectURL(blob);
      const viewer = new Viewer(container, { autoResize: true, retainParsedDxf: false });
      viewerRef.current = viewer;
      await viewer.Load({
        url: objectUrl,
        workerFactory: () => new DxfWorker(),
        progressCbk: (nextPhase, processed, total) => {
          if (cancelled) return;
          if (nextPhase === "fetch" || nextPhase === "parse" || nextPhase === "prepare") setPhase(nextPhase);
          if (total > 0) setProgress(Math.min(100, Math.round((processed / total) * 100)));
        },
      });
      if (cancelled) return;
      const bounds = viewer.GetBounds();
      if (bounds) viewer.FitView(bounds.minX, bounds.maxX, bounds.minY, bounds.maxY, 0.05);
      setLayers(Array.from(viewer.GetLayers()));
      setStatus("ready");
    })().catch((cause: unknown) => {
      if (cancelled) return;
      setError(cause instanceof Error ? cause.message : String(cause));
      setStatus("error");
    });

    return () => {
      cancelled = true;
      controller.abort();
      viewerRef.current?.Destroy();
      viewerRef.current = null;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [url, reloadKey]);

  const zoom = useCallback((factor: number) => {
    const viewer = viewerRef.current;
    if (!viewer) return;
    const camera = viewer.GetCamera();
    camera.zoom = Math.max(0.05, Math.min(50, camera.zoom * factor));
    camera.updateProjectionMatrix();
    viewer.Render();
  }, []);

  const fit = useCallback(() => {
    const viewer = viewerRef.current;
    if (!viewer) return;
    const bounds = viewer.GetBounds();
    if (bounds) viewer.FitView(bounds.minX, bounds.maxX, bounds.minY, bounds.maxY, 0.05);
  }, []);

  const toggleLayer = useCallback((layer: LayerInfo) => {
    const viewer = viewerRef.current;
    if (!viewer) return;
    viewer.ShowLayer(layer.name, !layer.visible);
    viewer.Render();
    setLayers(Array.from(viewer.GetLayers()));
  }, []);

  return (
    <div className="relative flex h-full min-h-0 flex-col">
      {status !== "error" && (
        <div className="flex flex-wrap items-center gap-1 border-b border-ink-100 bg-white/60 px-2 py-1.5 dark:border-ink-800 dark:bg-ink-900/40">
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8"
            aria-label={labels.zoomOut}
            title={labels.zoomOut}
            onClick={() => zoom(0.8)}
          >
            <Minus className="h-4 w-4" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8"
            aria-label={labels.zoomIn}
            title={labels.zoomIn}
            onClick={() => zoom(1.25)}
          >
            <Plus className="h-4 w-4" />
          </Button>
          <Button variant="ghost" size="icon" className="h-8 w-8" aria-label={labels.fit} title={labels.fit} onClick={fit}>
            <Maximize2 className="h-4 w-4" />
          </Button>
          <div className="mx-1 h-5 w-px bg-ink-200 dark:bg-ink-700" />
          <Button
            variant="ghost"
            size="sm"
            className="h-8 gap-1.5 px-2"
            aria-pressed={showLayers}
            onClick={() => setShowLayers((value) => !value)}
          >
            <Layers className="h-4 w-4" />
            <span className="text-xs">{labels.layers}</span>
            {layers.length > 0 && <span className="text-[11px] text-ink-400">({layers.length})</span>}
          </Button>
          {status === "loading" && (
            <span className="ms-auto flex items-center gap-1.5 pe-1 text-[11px] text-ink-400">
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
              {phase === "fetch" ? labels.loading : labels.parsing}
              {phase === "fetch" && progress > 0 ? ` ${progress}%` : ""}
            </span>
          )}
        </div>
      )}
      <div className="relative min-h-0 flex-1">
        <div ref={containerRef} className="h-full w-full" data-testid="dxf-canvas" />
        {status === "error" && (
          <div className="absolute inset-0 z-20 flex flex-col items-center justify-center gap-3 bg-white/95 p-6 text-center dark:bg-ink-900/95">
            <AlertTriangle className="h-8 w-8 text-amber-500" />
            <p className="max-w-md text-sm text-ink-600 dark:text-ink-300">{labels.error}</p>
            <p className="max-w-md break-words text-xs text-ink-400">{error}</p>
            <Button size="sm" variant="outline" icon={<RefreshCw className="h-4 w-4" />} onClick={() => setReloadKey((value) => value + 1)}>
              {labels.retry}
            </Button>
          </div>
        )}
        {status !== "error" && showLayers && (
          <div className="absolute inset-y-2 end-2 z-10 w-56 overflow-y-auto rounded-xl border border-ink-200 bg-white/95 p-2 shadow-lg backdrop-blur dark:border-ink-700 dark:bg-ink-900/95">
            <p className="mb-1 px-1 text-[11px] font-semibold text-ink-500">{labels.layers}</p>
            {layers.length === 0 ? (
              <p className="px-1 text-[11px] text-ink-400">—</p>
            ) : (
              <ul className="space-y-0.5">
                {layers.map((layer) => (
                  <li key={layer.name}>
                    <button
                      type="button"
                      onClick={() => toggleLayer(layer)}
                      title={layer.visible ? labels.hideLayer : labels.showLayer}
                      className="flex w-full items-center gap-2 rounded-lg px-1.5 py-1 text-start text-xs hover:bg-ink-100 dark:hover:bg-ink-800"
                    >
                      {layer.visible ? <Eye className="h-3.5 w-3.5 text-navy-500" /> : <EyeOff className="h-3.5 w-3.5 text-ink-400" />}
                      <span className="truncate" dir="auto">
                        {layer.displayName || layer.name}
                      </span>
                      <span
                        className="ms-auto h-2.5 w-2.5 shrink-0 rounded-full border border-ink-300"
                        style={{ backgroundColor: `#${(layer.color >>> 0).toString(16).padStart(6, "0")}` }}
                        aria-hidden="true"
                      />
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
