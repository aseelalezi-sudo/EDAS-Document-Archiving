import { describe, expect, it } from "vitest";
import { parseCookies, readCookie } from "./session.constants";

describe("parseCookies", () => {
  it("returns no cookies for a missing header", () => {
    expect(parseCookies(undefined)).toEqual({});
  });

  it("reads every named cookie and skips parts that are not assignments", () => {
    expect(parseCookies("edas_session=session-1; flag; edas_csrf=token%201; =nameless")).toEqual({
      edas_session: "session-1",
      edas_csrf: "token 1",
    });
  });

  it("reads one cookie by name", () => {
    expect(readCookie("edas_session=session-1; edas_csrf=token-1", "edas_csrf")).toBe("token-1");
    expect(readCookie("edas_session=session-1", "edas_csrf")).toBeNull();
    expect(readCookie(undefined, "edas_session")).toBeNull();
  });
});
