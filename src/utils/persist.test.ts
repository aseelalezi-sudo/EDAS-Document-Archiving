import { act, renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";
import { clearPersistedState, clearUserPersistedState, usePersistentState } from "./persist";

describe("usePersistentState", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("uses the initial value when nothing is stored", () => {
    const { result } = renderHook(() => usePersistentState("count", 1));
    expect(result.current[0]).toBe(1);
  });

  it("persists updates to localStorage", () => {
    const { result } = renderHook(() => usePersistentState("count", 0));
    act(() => result.current[1](5));
    expect(result.current[0]).toBe(5);
    expect(JSON.parse(localStorage.getItem("edas.v1.count")!)).toBe(5);
  });

  it("rehydrates from previously stored values", () => {
    localStorage.setItem("edas.v1.name", JSON.stringify("EDAS"));
    const { result } = renderHook(() => usePersistentState("name", "fallback"));
    expect(result.current[0]).toBe("EDAS");
  });

  it("falls back to the initial value when stored JSON is corrupt", () => {
    localStorage.setItem("edas.v1.bad", "{not valid json");
    const { result } = renderHook(() => usePersistentState("bad", "safe"));
    expect(result.current[0]).toBe("safe");
  });

  it("clearPersistedState removes only EDAS keys", () => {
    localStorage.setItem("edas.v1.a", "1");
    localStorage.setItem("other.key", "keep");
    clearPersistedState();
    expect(localStorage.getItem("edas.v1.a")).toBeNull();
    expect(localStorage.getItem("other.key")).toBe("keep");
  });

  it("clearUserPersistedState keeps device preferences", () => {
    localStorage.setItem("edas.v1.lang", '"ar"');
    localStorage.setItem("edas.v1.theme", '"dark"');
    localStorage.setItem("edas.v1.density", '"compact"');
    localStorage.setItem("edas.v1.sidebarCollapsed", "true");
    localStorage.setItem("edas.v1.docs", "[]");
    localStorage.setItem("edas.v1.assistantFeedback", "{}");
    clearUserPersistedState();
    expect(localStorage.getItem("edas.v1.lang")).toBe('"ar"');
    expect(localStorage.getItem("edas.v1.theme")).toBe('"dark"');
    expect(localStorage.getItem("edas.v1.density")).toBe('"compact"');
    expect(localStorage.getItem("edas.v1.sidebarCollapsed")).toBe("true");
    expect(localStorage.getItem("edas.v1.docs")).toBeNull();
    expect(localStorage.getItem("edas.v1.assistantFeedback")).toBeNull();
  });
});
