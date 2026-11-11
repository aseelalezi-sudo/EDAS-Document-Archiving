import { useEffect, useState } from "react";
import { config } from "../config";

export function absoluteApiUrl(path: string): string {
  if (/^[a-z][a-z0-9+.-]*:/i.test(path)) return path;
  const base = (config.apiBaseUrl ?? "").replace(/\/$/, "");
  return `${base}${path.startsWith("/") ? path : `/${path}`}`;
}

export async function fetchPreviewBlob(path: string, signal?: AbortSignal): Promise<Blob> {
  const response = await fetch(absoluteApiUrl(path), { credentials: "include", signal });
  if (!response.ok) throw new Error(`Preview request failed (${response.status})`);
  return response.blob();
}

export interface ObjectUrlState {
  url: string | null;
  loading: boolean;
  error: boolean;
}

/** Downloads an authenticated preview resource once and exposes it as a revocable blob URL. */
export function usePreviewObjectUrl(path: string | null): ObjectUrlState {
  const [state, setState] = useState<ObjectUrlState>({ url: null, loading: Boolean(path), error: false });

  useEffect(() => {
    if (!path) {
      setState({ url: null, loading: false, error: false });
      return;
    }
    let cancelled = false;
    let objectUrl: string | null = null;
    const controller = new AbortController();
    setState({ url: null, loading: true, error: false });
    fetchPreviewBlob(path, controller.signal)
      .then((blob) => {
        objectUrl = URL.createObjectURL(blob);
        if (cancelled) {
          URL.revokeObjectURL(objectUrl);
          return;
        }
        setState({ url: objectUrl, loading: false, error: false });
      })
      .catch(() => {
        if (!cancelled) setState({ url: null, loading: false, error: true });
      });
    return () => {
      cancelled = true;
      controller.abort();
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [path]);

  return state;
}
