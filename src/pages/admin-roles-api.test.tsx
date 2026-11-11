import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { AppProvider } from "../store";
import type { RolePolicyDto } from "@edas/shared";
import { RolesPolicyPanel } from "./admin-roles-api";

const rolePolicies = vi.fn();
const updateRolePolicy = vi.fn();

vi.mock("../lib/domain-api", () => ({
  domainApi: {
    rolePolicies: () => rolePolicies(),
    updateRolePolicy: (role: string, actions: string[]) => updateRolePolicy(role, actions),
    resetRolePolicy: vi.fn(),
  },
}));

const items: RolePolicyDto[] = [
  {
    role: "EMPLOYEE",
    actions: ["VIEW", "CREATE", "EDIT", "EXPORT"],
    customized: false,
    userCount: 4,
    updatedAt: null,
  },
  {
    role: "SYSTEM_ADMIN",
    actions: ["VIEW", "CREATE", "EDIT", "DELETE", "APPROVE", "EXPORT"],
    customized: false,
    userCount: 1,
    updatedAt: null,
  },
];

function renderPanel() {
  return render(
    <MemoryRouter>
      <AppProvider>
        <RolesPolicyPanel />
      </AppProvider>
    </MemoryRouter>,
  );
}

describe("RolesPolicyPanel", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    rolePolicies.mockResolvedValue({ items, meta: { total: items.length } });
  });

  it("loads role policies from the API", async () => {
    renderPanel();

    expect(await screen.findByText("موظف")).toBeInTheDocument();
    expect(screen.getByText("مسؤول النظام")).toBeInTheDocument();
    expect(screen.getByText(/4 مستخدم/)).toBeInTheDocument();
    expect(rolePolicies).toHaveBeenCalledTimes(1);
  });

  it("saves a toggled capability through the API", async () => {
    updateRolePolicy.mockResolvedValue({ ...items[0], actions: ["VIEW", "CREATE", "EDIT", "EXPORT", "DELETE"], customized: true });
    renderPanel();
    await screen.findByText("موظف");

    fireEvent.click(screen.getAllByRole("checkbox")[3]);
    fireEvent.click(screen.getAllByRole("button", { name: "حفظ" })[0]);

    await waitFor(() => expect(updateRolePolicy).toHaveBeenCalledWith("EMPLOYEE", ["VIEW", "CREATE", "EDIT", "EXPORT", "DELETE"]));
  });
});
