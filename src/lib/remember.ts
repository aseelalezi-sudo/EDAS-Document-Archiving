import { config } from "../config";

const REMEMBER_KEY = "edas.v1.remember";
const USERNAME_KEY = "edas.v1.lastUsername";
const USER_STATE_KEY = "edas.v1.user";
const ROLE_STATE_KEY = "edas.v1.role";

export function loadRememberPreference(): boolean {
  try {
    return localStorage.getItem(REMEMBER_KEY) !== "off";
  } catch {
    return true;
  }
}

export function loadRememberedUsername(): string {
  try {
    return localStorage.getItem(USERNAME_KEY) ?? "";
  } catch {
    return "";
  }
}

export function applyRememberPreference(remember: boolean, username?: string): void {
  try {
    if (remember) {
      localStorage.removeItem(REMEMBER_KEY);
      sessionStorage.removeItem(REMEMBER_KEY);
      if (username) localStorage.setItem(USERNAME_KEY, username);
      return;
    }
    localStorage.setItem(REMEMBER_KEY, "off");
    sessionStorage.setItem(REMEMBER_KEY, "off");
    localStorage.removeItem(USERNAME_KEY);
  } catch {
    /* ignore storage errors */
  }
}

function canRestorePersistedLogin(): boolean {
  try {
    if (localStorage.getItem(REMEMBER_KEY) !== "off") return true;
    return sessionStorage.getItem(REMEMBER_KEY) === "off";
  } catch {
    return true;
  }
}

export function dropExpiredPersistedLogin(): void {
  if (config.useApi || canRestorePersistedLogin()) return;
  try {
    localStorage.removeItem(USER_STATE_KEY);
    localStorage.removeItem(ROLE_STATE_KEY);
  } catch {
    /* ignore storage errors */
  }
}
