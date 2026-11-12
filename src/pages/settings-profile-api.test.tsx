import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ApiError } from "../lib/api-client";

const mocks = vi.hoisted(() => ({
  app: vi.fn(),
  docs: vi.fn(),
  me: vi.fn(),
  update: vi.fn(),
  open: vi.fn(),
}));

vi.mock("../store", () => ({ useApp: mocks.app }));
vi.mock("../store-docs", () => ({ useDocsStore: mocks.docs }));
vi.mock("../lib/domain-api", () => ({ domainApi: { me: mocks.me, updateMyProfile: mocks.update } }));
vi.mock("../config", () => ({
  config: { useApi: true, oidc: { issuer: "https://kc.example/realms/edas/", clientId: "edas-web", scopes: "openid" } },
}));

import { Profile } from "./settings-profile";

const USER = {
  id: "user-1",
  name: "سارة",
  nameEn: "Sara",
  email: "sara@edas.local",
  username: "sara",
  phone: "0500000000",
  jobTitle: "أخصائي",
  jobTitleEn: "Specialist",
  initials: "س",
  role: "employee",
};

function app(overrides: Record<string, unknown> = {}) {
  return {
    t: (key: string) => key,
    lang: "ar",
    user: USER,
    toast: vi.fn(),
    apiMode: true,
    login: vi.fn(),
    refreshUser: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  };
}

beforeEach(() => {
  mocks.app.mockReset();
  mocks.docs.mockReset();
  mocks.me.mockReset();
  mocks.update.mockReset();
  mocks.app.mockReturnValue(app());
  mocks.docs.mockReturnValue({
    employees: { items: [{ id: "emp-1", userId: "user-1", email: "sara@edas.local", deptId: "dept-1", empNo: "E-77" }] },
    departments: { items: [{ id: "dept-1", name: "الإدارة القانونية" }] },
    sections: { items: [] },
  });
  mocks.me.mockResolvedValue(USER);
  mocks.update.mockResolvedValue(USER);
});

describe("profile settings against the API", () => {
  it("loads the profile from the API and shows the department", async () => {
    render(<Profile />);

    await waitFor(() => expect(mocks.me).toHaveBeenCalledOnce());
    expect(await screen.findByDisplayValue("sara@edas.local")).toBeInTheDocument();
    expect(screen.getByText("الإدارة القانونية")).toBeInTheDocument();
    expect(screen.getByText("E-77")).toBeInTheDocument();
  });

  it("falls back to the session profile when the API read fails", async () => {
    mocks.me.mockRejectedValue(new ApiError(503, "UNAVAILABLE", "down"));

    render(<Profile />);

    await waitFor(() => expect(mocks.me).toHaveBeenCalledOnce());
    expect(screen.getByDisplayValue("sara@edas.local")).toBeInTheDocument();
  });

  it("trims the edited fields, refreshes the session and confirms", async () => {
    render(<Profile />);
    await screen.findByDisplayValue("sara@edas.local");

    fireEvent.change(screen.getByDisplayValue("sara@edas.local"), { target: { value: "  sara@edas.local  " } });
    fireEvent.change(screen.getByDisplayValue("0500000000"), { target: { value: "" } });
    fireEvent.click(screen.getByRole("button", { name: /g.save/ }));

    await waitFor(() => expect(mocks.update).toHaveBeenCalledOnce());
    expect(mocks.update).toHaveBeenCalledWith({
      name: "سارة",
      nameEn: "Sara",
      email: "sara@edas.local",
      phone: undefined,
      jobTitle: "أخصائي",
      jobTitleEn: "Specialist",
    });
    expect(mocks.app.mock.results[0].value.refreshUser).toHaveBeenCalledOnce();
    expect(mocks.app.mock.results[0].value.toast).toHaveBeenCalledWith(expect.objectContaining({ type: "success" }));
  });

  it("reports a save the API refused", async () => {
    mocks.update.mockRejectedValue(new ApiError(409, "CONFLICT", "taken"));

    render(<Profile />);
    await screen.findByDisplayValue("sara@edas.local");
    fireEvent.click(screen.getByRole("button", { name: /g.save/ }));

    await waitFor(() => expect(mocks.update).toHaveBeenCalledOnce());
    expect(mocks.app.mock.results[0].value.toast).toHaveBeenCalledWith(
      expect.objectContaining({ type: "error", message: "تعذّر حفظ التعديلات" }),
    );
  });

  it("opens the identity-provider account console", async () => {
    vi.stubGlobal("open", mocks.open);
    render(<Profile />);
    await screen.findByDisplayValue("sara@edas.local");

    const console_ = screen.getByRole("button", { name: /فتح بوابة الحساب/ });
    expect(console_).toBeEnabled();
    fireEvent.click(console_);

    expect(mocks.open).toHaveBeenCalledWith("https://kc.example/realms/edas/account", "_blank", "noopener,noreferrer");
    vi.unstubAllGlobals();
  });
});
