import { createContext, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { translations, type Lang } from "./i18n";
import { usePersistentState } from "./utils/persist";
import { config } from "./config";
import { profileToAppUser, roleFromApi } from "./lib/role-bridge";
import { beginLogin, clearSession, endSession, restoreSession } from "./lib/session";

export type Role = "employee" | "supervisor" | "dept_manager" | "archivist" | "system_admin" | "auditor";

export type Theme = "light" | "dark";
export type Density = "comfortable" | "compact";

export interface User {
  id: string;
  name: string;
  nameEn: string;
  username: string;
  email: string;
  jobTitle: string;
  jobTitleEn: string;
  department: string;
  section: string;
  phone?: string;
  role: Role;
  initials: string;
  color: string;
  isNew?: boolean;
}

export interface Toast {
  id: number;
  type: "success" | "error" | "warning" | "info";
  title: string;
  message?: string;
}

interface AppState {
  lang: Lang;
  setLang: (l: Lang) => void;
  dir: "rtl" | "ltr";
  t: (key: string, vars?: Record<string, string | number>) => string;
  theme: Theme;
  setTheme: (t: Theme) => void;
  toggleTheme: () => void;
  density: Density;
  setDensity: (d: Density) => void;
  user: User | null;
  login: (u: User) => void;
  refreshUser: () => Promise<void>;
  loginWithKeycloak: (returnTo?: string) => Promise<void>;
  logout: () => void;
  authReady: boolean;
  apiMode: boolean;
  role: Role;
  setRole: (r: Role) => void;
  sidebarCollapsed: boolean;
  setSidebarCollapsed: (v: boolean) => void;
  toasts: Toast[];
  toast: (t: Omit<Toast, "id">) => void;
  dismissToast: (id: number) => void;
}

const Ctx = createContext<AppState | null>(null);

export function AppProvider({ children }: { children: ReactNode }) {
  const [lang, setLang] = usePersistentState<Lang>("lang", "ar");
  const [theme, setTheme] = usePersistentState<Theme>("theme", "light");
  const [density, setDensity] = usePersistentState<Density>("density", "comfortable");
  const [user, setUser] = usePersistentState<User | null>("user", null);
  const [role, setRole] = usePersistentState<Role>("role", "employee");
  const [sidebarCollapsed, setSidebarCollapsed] = usePersistentState("sidebarCollapsed", false);
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [authReady, setAuthReady] = useState(!config.useApi);

  const dir = lang === "ar" ? "rtl" : "ltr";

  useEffect(() => {
    if (!config.useApi) return;
    let cancelled = false;
    restoreSession()
      .then((profile) => {
        if (cancelled) return;
        if (profile) {
          setUser(profileToAppUser(profile));
          setRole(roleFromApi(profile.role));
        } else {
          setUser(null);
        }
      })
      .catch(() => {
        if (!cancelled) setUser(null);
      })
      .finally(() => {
        if (!cancelled) setAuthReady(true);
      });
    return () => {
      cancelled = true;
    };
  }, [setUser, setRole]);

  useEffect(() => {
    document.documentElement.lang = lang;
    document.documentElement.dir = dir;
  }, [lang, dir]);

  useEffect(() => {
    if (theme === "dark") document.documentElement.classList.add("dark");
    else document.documentElement.classList.remove("dark");
  }, [theme]);

  const t = useMemo(() => {
    return (key: string, vars?: Record<string, string | number>) => {
      let str = (translations[lang] as Record<string, string>)[key] ?? (translations.ar as Record<string, string>)[key] ?? key;
      if (vars) {
        for (const k of Object.keys(vars)) {
          str = str.replace(`{${k}}`, String(vars[k]));
        }
      }
      return str;
    };
  }, [lang]);

  const toast = (tt: Omit<Toast, "id">) => {
    const id = Date.now() + Math.random();
    setToasts((prev) => [...prev, { ...tt, id }]);
    setTimeout(() => {
      setToasts((prev) => prev.filter((x) => x.id !== id));
    }, 4200);
  };
  const dismissToast = (id: number) => setToasts((prev) => prev.filter((x) => x.id !== id));

  const toastRef = useRef(toast);
  toastRef.current = toast;
  const userRef = useRef(user);
  userRef.current = user;
  const unauthorizedAt = useRef(0);
  useEffect(() => {
    const handleUnauthorized = () => {
      const now = Date.now();
      if (now - unauthorizedAt.current < 3000) return;
      unauthorizedAt.current = now;
      const wasSignedIn = userRef.current !== null;
      clearSession();
      setUser(null);
      setRole("employee");
      if (wasSignedIn) toastRef.current({ type: "error", title: t("auth.expired") });
    };
    window.addEventListener("edas:unauthorized", handleUnauthorized);
    return () => window.removeEventListener("edas:unauthorized", handleUnauthorized);
  }, [setUser, setRole, t]);

  const login = (u: User) => {
    setUser(u);
    setRole(u.role);
  };
  const refreshUser = async () => {
    if (!config.useApi) return;
    const profile = await restoreSession();
    if (profile) {
      setUser(profileToAppUser(profile));
      setRole(roleFromApi(profile.role));
    }
  };
  const loginWithKeycloak = async (returnTo = "/dashboard") => {
    window.location.assign(beginLogin(returnTo));
  };
  const logout = async () => {
    const url = await endSession();
    setUser(null);
    if (url) window.location.assign(url);
  };
  const toggleTheme = () => setTheme((p) => (p === "light" ? "dark" : "light"));

  return (
    <Ctx.Provider
      value={{
        lang,
        setLang,
        dir,
        t,
        theme,
        setTheme,
        toggleTheme,
        density,
        setDensity,
        user,
        login,
        refreshUser,
        loginWithKeycloak,
        logout,
        authReady,
        apiMode: config.useApi,
        role,
        setRole,
        sidebarCollapsed,
        setSidebarCollapsed,
        toasts,
        toast,
        dismissToast,
      }}
    >
      {children}
    </Ctx.Provider>
  );
}

export function useApp() {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useApp must be used within AppProvider");
  return ctx;
}
