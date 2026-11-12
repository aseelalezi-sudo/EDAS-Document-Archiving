import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it } from "vitest";
import { AppProvider } from "../store";
import { DocsProvider } from "../store-docs";
import { ToastHost } from "../components/system";
import { DEMO_USERS } from "../data";
import { Profile } from "./settings-profile";

const USER = DEMO_USERS[0].user;

function wrapper({ children }: { children: ReactNode }) {
  return (
    <MemoryRouter>
      <AppProvider>
        <DocsProvider>
          {children}
          <ToastHost />
        </DocsProvider>
      </AppProvider>
    </MemoryRouter>
  );
}

function signIn() {
  localStorage.setItem("edas.v1.user", JSON.stringify(USER));
  localStorage.setItem("edas.v1.role", JSON.stringify("employee"));
}

beforeEach(() => {
  localStorage.clear();
});

describe("profile settings", () => {
  it("shows the signed-in account and its organizational placement", () => {
    signIn();
    render(<Profile />, { wrapper });

    expect(screen.getAllByDisplayValue(USER.name).length).toBeGreaterThan(0);
    expect(screen.getByDisplayValue(USER.email)).toBeInTheDocument();
    expect(screen.getByText(USER.username)).toBeInTheDocument();
  });

  it("refuses to save an empty name", async () => {
    signIn();
    render(<Profile />, { wrapper });
    const name = screen.getAllByDisplayValue(USER.name)[0];

    fireEvent.change(name, { target: { value: "   " } });
    fireEvent.click(screen.getByRole("button", { name: /حفظ/ }));

    expect(await screen.findByText("الاسم مطلوب")).toBeInTheDocument();
  });

  it("saves the edited profile locally and confirms it", async () => {
    signIn();
    render(<Profile />, { wrapper });
    const name = screen.getAllByDisplayValue(USER.name)[0];

    fireEvent.change(name, { target: { value: "سارة المطيري" } });
    fireEvent.change(screen.getByDisplayValue(USER.email), { target: { value: "sara@edas.local" } });
    fireEvent.click(screen.getByRole("button", { name: /حفظ/ }));

    expect(await screen.findByText("تم حفظ بياناتك")).toBeInTheDocument();
    await waitFor(() => expect(screen.getByText("سارة المطيري", { selector: "p" })).toBeInTheDocument());
    expect(JSON.parse(localStorage.getItem("edas.v1.user") as string)).toMatchObject({
      name: "سارة المطيري",
      email: "sara@edas.local",
    });
  });

  it("disables the account console when no identity provider is configured", () => {
    signIn();
    render(<Profile />, { wrapper });

    expect(screen.getByRole("button", { name: /فتح بوابة الحساب/ })).toBeDisabled();
  });
});
