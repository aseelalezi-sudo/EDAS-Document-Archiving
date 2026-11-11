import { act, renderHook } from "@testing-library/react";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it } from "vitest";
import { AppProvider, useApp } from "./store";
import { DocsProvider, useDocsStore } from "./store-docs";
import { DEMO_USERS } from "./data";
import type { User } from "./store";

function toUser(index: number): User {
  const demo = DEMO_USERS[index];
  return {
    id: demo.user.id,
    name: demo.user.name,
    nameEn: demo.user.nameEn,
    username: demo.user.username,
    email: demo.user.email,
    jobTitle: demo.user.jobTitle,
    jobTitleEn: demo.user.jobTitleEn,
    department: demo.user.deptId,
    section: "",
    role: demo.role,
    initials: demo.user.initials,
    color: demo.user.color,
  };
}

function useHarness() {
  return { app: useApp(), docs: useDocsStore() };
}

const wrapper = ({ children }: { children: ReactNode }) => (
  <AppProvider>
    <DocsProvider>{children}</DocsProvider>
  </AppProvider>
);

function render() {
  return renderHook(() => useHarness(), { wrapper });
}

beforeEach(() => {
  localStorage.clear();
});

describe("documents store integration", () => {
  it("moves a document to trash and restores it back", async () => {
    const { result } = render();
    const id = result.current.docs.docs[0].id;
    const total = result.current.docs.docs.length;

    act(() => result.current.docs.deleteDocs([id]));

    expect(result.current.docs.docs).toHaveLength(total - 1);
    expect(result.current.docs.docs.some((d) => d.id === id)).toBe(false);
    expect(result.current.docs.trash.some((t) => t.doc.id === id)).toBe(true);

    await act(async () => {
      await result.current.docs.restoreDocs([id]);
    });

    expect(result.current.docs.docs).toHaveLength(total);
    expect(result.current.docs.docs.some((d) => d.id === id)).toBe(true);
    expect(result.current.docs.trash.some((t) => t.doc.id === id)).toBe(false);
  });

  it("purges and empties the trash permanently", async () => {
    const { result } = render();
    const id = result.current.docs.docs.find((d) => !result.current.docs.trash.some((t) => t.doc.id === d.id))!.id;
    const trashBefore = result.current.docs.trash.length;

    act(() => result.current.docs.deleteDocs([id]));
    expect(result.current.docs.trash).toHaveLength(trashBefore + 1);

    await act(async () => {
      await result.current.docs.purgeDocs([id]);
    });
    expect(result.current.docs.trash).toHaveLength(trashBefore);

    await act(async () => {
      await result.current.docs.emptyTrash();
    });
    expect(result.current.docs.trash).toHaveLength(0);
  });

  it("archives documents and toggles check-out/check-in", () => {
    const { result } = render();
    const id = result.current.docs.docs[0].id;

    act(() => result.current.docs.archiveDocs([id]));
    expect(result.current.docs.docs.find((d) => d.id === id)?.status).toBe("archived");

    act(() => result.current.docs.checkOut(id, "Tester"));
    expect(result.current.docs.docs.find((d) => d.id === id)?.checkedOutBy).toBe("Tester");

    act(() => result.current.docs.checkIn(id));
    expect(result.current.docs.docs.find((d) => d.id === id)?.checkedOutBy).toBeUndefined();
  });

  it("appends an audit entry for every action", () => {
    const { result } = render();
    const before = result.current.docs.auditLog.length;
    const id = result.current.docs.docs[0].id;

    act(() => result.current.docs.archiveDocs([id]));

    expect(result.current.docs.auditLog.length).toBe(before + 1);
  });

  it("gives system_admin the full document set but scopes employees", () => {
    const { result } = render();
    const total = result.current.docs.docs.length;

    act(() => result.current.app.login(toUser(3)));

    expect(result.current.docs.scopedDocs).toHaveLength(total);
    expect(result.current.docs.can("delete", result.current.docs.folders[0].id)).toBe(true);

    act(() => result.current.app.login(toUser(0)));

    expect(result.current.docs.scopedDocs.length).toBeLessThanOrEqual(total);
    expect(result.current.docs.can("delete", result.current.docs.folders[0].id)).toBe(false);
  });

  it("performs CRUD on the admin entity stores", () => {
    const { result } = render();
    const before = result.current.docs.users.items.length;

    let createdId = "";
    act(() => {
      const created = result.current.docs.users.add({
        name: "Test User",
        nameEn: "Test User",
        username: "tuser",
        email: "tuser@edas.gov",
        empNo: "EMP-9001",
        jobTitle: "موظف",
        jobTitleEn: "Employee",
        deptId: "eng",
        role: "employee",
        status: "active",
        lastLogin: "—",
        failedAttempts: 0,
        activeSessions: 0,
        initials: "TU",
        color: "bg-navy-600",
      });
      createdId = created.id;
    });

    expect(result.current.docs.users.items).toHaveLength(before + 1);

    act(() => result.current.docs.users.update(createdId, { name: "Renamed User" }));
    expect(result.current.docs.users.items.find((u) => u.id === createdId)?.name).toBe("Renamed User");

    act(() => result.current.docs.users.remove(createdId));
    expect(result.current.docs.users.items).toHaveLength(before);
    expect(result.current.docs.users.items.some((u) => u.id === createdId)).toBe(false);
  });

  it("propagates an ACL rule to every descendant folder", () => {
    const { result } = render();
    const root = result.current.docs.folders.find((f) => f.parentId === null) ?? result.current.docs.folders[0];
    const children = result.current.docs.getChildrenIds(root.id);
    const before = result.current.docs.acls[children[0]]?.length ?? 0;

    let propagated = 0;
    act(() => {
      propagated = result.current.docs.propagateRule(root.id, {
        principalId: "u-test",
        principalName: "Test User",
        principalType: "user",
        permissions: ["view"],
      });
    });

    expect(propagated).toBe(children.length);
    expect(result.current.docs.acls[children[0]].length).toBe(before + 1);
  });
});
