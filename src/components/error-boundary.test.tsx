import { render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { translations } from "../i18n";
import { ErrorBoundary } from "./error-boundary";

function Boom(): never {
  throw new Error("boom");
}

describe("ErrorBoundary", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("renders children when there is no error", () => {
    render(
      <ErrorBoundary>
        <p>safe</p>
      </ErrorBoundary>,
    );
    expect(screen.getByText("safe")).toBeInTheDocument();
  });

  it("renders the fallback when a child throws", () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    render(
      <ErrorBoundary>
        <Boom />
      </ErrorBoundary>,
    );
    expect(screen.getByText(translations.ar["err.title"])).toBeInTheDocument();
  });
});
