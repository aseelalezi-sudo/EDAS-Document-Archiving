import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ApiError } from "../lib/api-client";

const mocks = vi.hoisted(() => ({ app: vi.fn(), prefs: vi.fn(), put: vi.fn() }));

vi.mock("../store", () => ({ useApp: mocks.app }));
vi.mock("../lib/domain-api", () => ({ domainApi: { myPreferences: mocks.prefs, putMyPreference: mocks.put } }));

import { NotifPrefs } from "./settings-notif-prefs";

function app() {
  return { t: (key: string) => key, lang: "ar", toast: vi.fn(), apiMode: true };
}

beforeEach(() => {
  localStorage.clear();
  mocks.app.mockReset();
  mocks.prefs.mockReset();
  mocks.put.mockReset();
  mocks.app.mockReturnValue(app());
  mocks.prefs.mockResolvedValue({
    items: {
      notifications: { rejection: { inapp: false, email: false } },
      "notifications-digest": "daily",
      "notifications-quiet": { start: "23:00", end: "06:00" },
    },
  });
  mocks.put.mockResolvedValue(undefined);
});

describe("notification preferences against the API", () => {
  it("loads the stored preferences from the API", async () => {
    render(<NotifPrefs />);

    expect(await screen.findByDisplayValue("23:00")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "ملخص يومي" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getAllByRole("checkbox")[3]).not.toBeChecked();
  });

  it("ignores stored values of the wrong shape", async () => {
    mocks.prefs.mockResolvedValue({ items: { notifications: "nope", "notifications-digest": 7, "notifications-quiet": null } });

    render(<NotifPrefs />);

    expect(await screen.findByDisplayValue("22:00")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "فوري" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getAllByRole("checkbox")[0]).toBeChecked();
  });

  it("keeps the defaults and reports a failed read", async () => {
    mocks.prefs.mockRejectedValue(new ApiError(503, "UNAVAILABLE", "down"));

    render(<NotifPrefs />);

    await waitFor(() =>
      expect(mocks.app.mock.results[0].value.toast).toHaveBeenCalledWith(expect.objectContaining({ type: "error", title: "err.api" })),
    );
    expect(screen.getByDisplayValue("22:00")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "g.save" })).toBeEnabled();
  });

  it("stops applying a read that lands after the page unmounted", async () => {
    let resolve: (value: unknown) => void = () => undefined;
    mocks.prefs.mockReturnValue(new Promise((done) => (resolve = done)));
    const view = render(<NotifPrefs />);
    await waitFor(() => expect(mocks.prefs).toHaveBeenCalledOnce());

    view.unmount();
    resolve({ items: { "notifications-digest": "weekly" } });
    await waitFor(() => expect(mocks.app.mock.results[0].value.toast).not.toHaveBeenCalled());
    expect(mocks.prefs).toHaveBeenCalledOnce();
  });

  it("stays quiet when a failed read lands after the page unmounted", async () => {
    let reject: (error: unknown) => void = () => undefined;
    mocks.prefs.mockReturnValue(new Promise((_, fail) => (reject = fail)));
    const view = render(<NotifPrefs />);
    await waitFor(() => expect(mocks.prefs).toHaveBeenCalledOnce());

    view.unmount();
    reject(new ApiError(503, "UNAVAILABLE", "down"));

    await waitFor(() => expect(mocks.app.mock.results[0].value.toast).not.toHaveBeenCalled());
  });

  it("saves all three preference keys", async () => {
    render(<NotifPrefs />);
    await screen.findByDisplayValue("23:00");

    fireEvent.click(screen.getByRole("button", { name: "g.save" }));

    await waitFor(() => expect(mocks.put).toHaveBeenCalledTimes(3));
    expect(mocks.put).toHaveBeenCalledWith("notifications", expect.objectContaining({ rejection: { inapp: false, email: false } }));
    expect(mocks.put).toHaveBeenCalledWith("notifications-digest", "daily");
    expect(mocks.put).toHaveBeenCalledWith("notifications-quiet", { start: "23:00", end: "06:00" });
    expect(mocks.app.mock.results[0].value.toast).toHaveBeenCalledWith(expect.objectContaining({ type: "success" }));
  });

  it("reports a save the API refused", async () => {
    mocks.put.mockRejectedValue(new ApiError(500, "INTERNAL", "boom"));

    render(<NotifPrefs />);
    await screen.findByDisplayValue("23:00");
    fireEvent.click(screen.getByRole("button", { name: "g.save" }));

    await waitFor(() =>
      expect(mocks.app.mock.results[0].value.toast).toHaveBeenCalledWith(expect.objectContaining({ type: "error", title: "err.api" })),
    );
    expect(screen.getByRole("button", { name: "g.save" })).toBeEnabled();
  });
});
