import { useEffect, useState } from "react";

const PREFIX = "edas.v1.";

function read<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(PREFIX + key);
    if (raw == null) return fallback;
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

function write(key: string, value: unknown) {
  try {
    localStorage.setItem(PREFIX + key, JSON.stringify(value));
  } catch {
    /* ignore quota / serialization errors */
  }
}

/**
 * Like useState, but the value survives page reloads via localStorage.
 * `initial` may be a value or a lazy initializer.
 */
export function usePersistentState<T>(key: string, initial: T | (() => T)) {
  const [state, setState] = useState<T>(() => read(key, typeof initial === "function" ? (initial as () => T)() : initial));

  useEffect(() => {
    write(key, state);
  }, [key, state]);

  return [state, setState] as const;
}

/** Remove all persisted EDAS state (used by "reset demo" style actions). */
export function clearPersistedState() {
  try {
    for (let i = localStorage.length - 1; i >= 0; i--) {
      const k = localStorage.key(i);
      if (k && k.startsWith(PREFIX)) localStorage.removeItem(k);
    }
  } catch {
    /* ignore */
  }
}

const DEVICE_KEYS = new Set(["lang", "theme", "density", "sidebarCollapsed"]);

/** Remove all persisted EDAS state except device-level preferences (used on logout). */
export function clearUserPersistedState() {
  try {
    for (let i = localStorage.length - 1; i >= 0; i--) {
      const k = localStorage.key(i);
      if (k && k.startsWith(PREFIX) && !DEVICE_KEYS.has(k.slice(PREFIX.length))) localStorage.removeItem(k);
    }
  } catch {
    /* ignore */
  }
}
