import { beforeEach, describe, expect, it, vi } from "vitest";
import { applyRememberPreference, dropExpiredPersistedLogin, loadRememberedUsername, loadRememberPreference } from "./remember";

vi.mock("../config", () => ({ config: { useApi: false } }));

beforeEach(() => {
  localStorage.clear();
  sessionStorage.clear();
});

describe("remember me", () => {
  it("remembers the user by default", () => {
    expect(loadRememberPreference()).toBe(true);
  });

  it("persists and prefills the username when enabled", () => {
    applyRememberPreference(true, "ahmad");
    expect(loadRememberPreference()).toBe(true);
    expect(loadRememberedUsername()).toBe("ahmad");
  });

  it("clears the remembered username when disabled", () => {
    applyRememberPreference(true, "ahmad");
    applyRememberPreference(false, "ahmad");
    expect(loadRememberPreference()).toBe(false);
    expect(loadRememberedUsername()).toBe("");
  });

  it("keeps the login within the same browser session", () => {
    localStorage.setItem("edas.v1.user", "{}");
    applyRememberPreference(false, "ahmad");
    dropExpiredPersistedLogin();
    expect(localStorage.getItem("edas.v1.user")).toBe("{}");
  });

  it("drops the login after a browser restart when not remembered", () => {
    localStorage.setItem("edas.v1.user", "{}");
    localStorage.setItem("edas.v1.role", '"employee"');
    applyRememberPreference(false, "ahmad");
    sessionStorage.clear();
    dropExpiredPersistedLogin();
    expect(localStorage.getItem("edas.v1.user")).toBeNull();
    expect(localStorage.getItem("edas.v1.role")).toBeNull();
  });
});
