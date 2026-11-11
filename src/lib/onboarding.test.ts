import { beforeEach, describe, expect, it } from "vitest";
import { hasSeenOnboarding, markOnboardingSeen } from "./onboarding";

describe("onboarding seen marker", () => {
  beforeEach(() => localStorage.clear());

  it("is false until the user is marked", () => {
    expect(hasSeenOnboarding("u1")).toBe(false);
    markOnboardingSeen("u1");
    expect(hasSeenOnboarding("u1")).toBe(true);
  });

  it("tracks users independently and is idempotent", () => {
    markOnboardingSeen("u1");
    markOnboardingSeen("u1");
    expect(hasSeenOnboarding("u2")).toBe(false);
    expect(JSON.parse(localStorage.getItem("edas.v1.onboardingSeen") ?? "[]")).toEqual(["u1"]);
  });

  it("ignores malformed storage", () => {
    localStorage.setItem("edas.v1.onboardingSeen", "not-json");
    expect(hasSeenOnboarding("u1")).toBe(false);
  });
});
