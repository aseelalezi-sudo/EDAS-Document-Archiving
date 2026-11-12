import { fireEvent, render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it } from "vitest";
import { AppProvider } from "../store";
import { ToastHost } from "../components/system";
import { NotifPrefs } from "./settings-notif-prefs";

const wrapper = ({ children }: { children: ReactNode }) => (
  <MemoryRouter>
    <AppProvider>
      {children}
      <ToastHost />
    </AppProvider>
  </MemoryRouter>
);

beforeEach(() => {
  localStorage.clear();
  localStorage.setItem(
    "edas.v1.notificationPreferences",
    JSON.stringify({
      channels: { rejection: { inapp: false, email: true } },
      digest: "weekly",
      quiet: { start: "21:30", end: "06:30" },
    }),
  );
});

describe("notification preferences", () => {
  it("lists every event with its channel and applies the stored choices", () => {
    render(<NotifPrefs />, { wrapper });

    expect(screen.getByText("إرسال وثيقة")).toBeInTheDocument();
    expect(screen.getByText("تنبيه أمني")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "ملخص أسبوعي" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByDisplayValue("21:30")).toBeInTheDocument();
    expect(screen.getByDisplayValue("06:30")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /حفظ/ })).toBeEnabled();
  });

  it("toggles a channel, picks a digest and saves the whole set locally", () => {
    render(<NotifPrefs />, { wrapper });

    const boxes = screen.getAllByRole("checkbox");
    fireEvent.click(boxes[0]);
    fireEvent.click(screen.getByRole("button", { name: "فوري" }));
    fireEvent.change(screen.getByDisplayValue("21:30"), { target: { value: "20:00" } });
    fireEvent.change(screen.getByDisplayValue("06:30"), { target: { value: "05:00" } });
    fireEvent.click(screen.getByRole("button", { name: /حفظ/ }));

    expect(screen.getByText("تم حفظ التفضيلات")).toBeInTheDocument();
    expect(JSON.parse(localStorage.getItem("edas.v1.notificationPreferences") as string)).toMatchObject({
      digest: "immediate",
      quiet: { start: "20:00", end: "05:00" },
    });
  });

  it("explains that choosing off has no engine behind it", () => {
    render(<NotifPrefs />, { wrapper });

    expect(screen.queryByText(/محرك تلخيص ينفّذه/)).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "إيقاف" }));

    expect(screen.getByRole("button", { name: "إيقاف" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByText(/محرك تلخيص ينفّذه/)).toBeInTheDocument();
  });

  it("keeps the defaults when the stored blob is not readable", () => {
    localStorage.setItem("edas.v1.notificationPreferences", "{not json");

    render(<NotifPrefs />, { wrapper });

    expect(screen.getByRole("button", { name: "فوري" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByDisplayValue("22:00")).toBeInTheDocument();
    expect(screen.getAllByRole("checkbox")[0]).toBeChecked();
  });

  it("falls back to the defaults when nothing was ever stored", () => {
    localStorage.removeItem("edas.v1.notificationPreferences");

    render(<NotifPrefs />, { wrapper });

    expect(screen.getByDisplayValue("22:00")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "فوري" })).toHaveAttribute("aria-pressed", "true");
  });

  it("shows the English labels when the interface is in English", () => {
    localStorage.setItem("edas.v1.lang", JSON.stringify("en"));

    render(<NotifPrefs />, { wrapper });

    expect(screen.getByText("Document sent")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Daily digest" })).toBeInTheDocument();
    expect(screen.getByText(/preferences are stored in your profile/)).toBeInTheDocument();
  });

  it("learns a channel the stored blob never mentioned", () => {
    localStorage.setItem(
      "edas.v1.notificationPreferences",
      JSON.stringify({ channels: { "document-sent": { inapp: false, email: false } } }),
    );

    render(<NotifPrefs />, { wrapper });

    const boxes = screen.getAllByRole("checkbox");
    expect(boxes[0]).not.toBeChecked();
    expect(boxes[1]).toBeChecked();
  });
});
