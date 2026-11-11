import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";
import App from "./App";
import { DEMO_USERS } from "./data";

const LAZY_TIMEOUT = { timeout: 8_000 };

function visit(hash: string) {
  window.location.hash = hash;
  return render(<App />);
}

beforeEach(() => {
  localStorage.clear();
  window.location.hash = "";
});

describe("app shell", () => {
  it("renders the lazily loaded login page without a session", async () => {
    visit("#/login");
    expect(await screen.findByText(DEMO_USERS[3].user.name, {}, LAZY_TIMEOUT)).toBeInTheDocument();
  });

  it("redirects a guarded route back to the login page", async () => {
    visit("#/documents");
    expect(await screen.findByText(DEMO_USERS[3].user.name, {}, LAZY_TIMEOUT)).toBeInTheDocument();
    expect(window.location.hash.startsWith("#/login")).toBe(true);
  });
});
