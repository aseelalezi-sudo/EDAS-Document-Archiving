import { act, renderHook } from "@testing-library/react";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { AppProvider, useApp } from "./store";
import { DocsProvider, useDocsStore } from "./store-docs";
import { CATEGORIES, DEMO_USERS } from "./data";
import type { FolderNode } from "./types";
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

function pdf(name = "contract.pdf") {
  return new File(["contract"], name, { type: "application/pdf" });
}

function monthsFrom(dateish: string, months: number) {
  const due = new Date(dateish || Date.now());
  due.setMonth(due.getMonth() + months);
  return {
    end: due.toISOString().slice(0, 10),
    daysLeft: Math.ceil((due.getTime() - Date.now()) / 86_400_000),
  };
}

beforeEach(() => {
  localStorage.clear();
});

describe("store document lifecycle actions", () => {
  it("creates a document with the mapped classification, owner and first version", async () => {
    const { result } = render();
    act(() => result.current.app.login(toUser(0)));
    const before = result.current.docs.docs.length;
    const category = CATEGORIES[0];

    let createdId: string | null = null;
    await act(async () => {
      createdId = await result.current.docs.createDocument({
        title: "عقد صيانة",
        titleEn: "Maintenance contract",
        description: "وصف",
        categoryId: category.id,
        classification: "CONFIDENTIAL",
        folderId: result.current.docs.folders[0].id,
        tags: ["صيانة"],
        file: pdf(),
        comment: "النسخة الأولى",
      });
    });

    expect(createdId).toBeTruthy();
    expect(result.current.docs.docs).toHaveLength(before + 1);
    const created = result.current.docs.docs[0];
    expect(created).toMatchObject({
      id: createdId,
      title: "عقد صيانة",
      titleEn: "Maintenance contract",
      classification: "confidential",
      category: category.name,
      categoryEn: category.nameEn,
      folderId: result.current.docs.folders[0].id,
      owner: DEMO_USERS[0].user.name,
      deptId: DEMO_USERS[0].user.deptId,
      fileType: "pdf",
      tags: ["صيانة"],
      status: "draft",
    });
    expect(created.docNo.startsWith("EDAS-")).toBe(true);
    expect(created.versions).toHaveLength(1);
    expect(created.versions[0]).toMatchObject({ v: "1.0", current: true, comment: "النسخة الأولى" });
    expect(result.current.docs.auditLog.some((entry) => entry.detail === "عقد صيانة" || entry.action.includes("إنشاء وثيقة"))).toBe(true);
  });

  it("maps the remaining classifications and falls back for unknown categories", async () => {
    const { result } = render();

    const ids: (string | null)[] = [];
    for (const classification of ["PUBLIC", "SECRET", "INTERNAL"] as const) {
      await act(async () => {
        ids.push(
          await result.current.docs.createDocument({
            title: classification,
            classification,
            categoryId: "cat-unknown",
            file: pdf(`${classification}.pdf`),
          }),
        );
      });
    }

    const docs = result.current.docs.docs;
    for (const id of ids) expect(docs.find((doc) => doc.id === id)).toBeTruthy();
    expect(docs.find((doc) => doc.id === ids[0])?.classification).toBe("public");
    expect(docs.find((doc) => doc.id === ids[1])?.classification).toBe("topsecret");
    expect(docs.find((doc) => doc.id === ids[2])?.classification).toBe("internal");
    expect(docs.find((doc) => doc.id === ids[0])?.category).toBe("عام");
    expect(docs.find((doc) => doc.id === ids[0])?.categoryId).toBe("");
  });

  it("updates the editable fields and returns true", async () => {
    const { result } = render();
    const target = result.current.docs.docs[0];
    const category = CATEGORIES[1];

    let ok = false;
    await act(async () => {
      ok = await result.current.docs.updateDocument(target.id, {
        title: "عنوان محدّث",
        titleEn: "Updated title",
        description: "وصف محدّث",
        category: category.id,
        classification: "SECRET",
        tags: ["محدّث"],
      });
    });

    expect(ok).toBe(true);
    const updated = result.current.docs.docs.find((doc) => doc.id === target.id)!;
    expect(updated).toMatchObject({
      title: "عنوان محدّث",
      titleEn: "Updated title",
      description: "وصف محدّث",
      descriptionEn: "وصف محدّث",
      category: category.name,
      categoryEn: category.nameEn,
      categoryId: category.id,
      classification: "topsecret",
      tags: ["محدّث"],
    });
    expect(updated.modifiedAt).toBe(new Date().toISOString().slice(0, 10));
  });

  it("keeps the previous values when the patch leaves them out", async () => {
    const { result } = render();
    const target = result.current.docs.docs[0];

    await act(async () => {
      await result.current.docs.updateDocument(target.id, {});
    });

    const updated = result.current.docs.docs.find((doc) => doc.id === target.id)!;
    expect(updated.title).toBe(target.title);
    expect(updated.classification).toBe(target.classification);
    expect(updated.categoryId).toBe(target.categoryId);
    expect(updated.tags).toEqual(target.tags);
  });

  it("restores a version, marks it current and returns to draft for 1.0", async () => {
    const { result } = render();
    const target = result.current.docs.docs[0];

    let ok = false;
    await act(async () => {
      ok = await result.current.docs.restoreVersion(target.id, "1.0");
    });
    expect(ok).toBe(true);

    const updated = result.current.docs.docs.find((doc) => doc.id === target.id)!;
    expect(updated.version).toBe("1.0");
    expect(updated.status).toBe("draft");
    expect(updated.versions.every((entry) => entry.current === (entry.v === "1.0"))).toBe(true);
  });

  it("saves an approved document back to draft and sends it for approval", async () => {
    const { result } = render();
    const target = result.current.docs.docs[0];

    act(() => result.current.docs.saveDraft(target.id));
    expect(result.current.docs.docs.find((doc) => doc.id === target.id)?.status).toBe("draft");

    let ok = false;
    await act(async () => {
      ok = await result.current.docs.sendForApproval(target.id);
    });
    expect(ok).toBe(true);
    expect(result.current.docs.docs.find((doc) => doc.id === target.id)?.status).toBe("pending");
  });
});

describe("store folder actions", () => {
  function folder(overrides: Partial<FolderNode> = {}): FolderNode {
    return {
      id: `fold-test-${Math.random().toString(36).slice(2, 8)}`,
      name: "مجلد اختبار",
      nameEn: "Test folder",
      parentId: "root",
      type: "project",
      docs: 0,
      subfolders: 0,
      accessScope: "خاص",
      ...overrides,
    };
  }

  it("creates a folder and records it", async () => {
    const { result } = render();
    const next = folder();
    const before = result.current.docs.folders.length;

    let ok = false;
    await act(async () => {
      ok = await result.current.docs.addFolder(next);
    });

    expect(ok).toBe(true);
    expect(result.current.docs.folders).toHaveLength(before + 1);
    expect(result.current.docs.folders.some((entry) => entry.id === next.id)).toBe(true);
  });

  it("renames an existing folder, trims the name and patches type and scope", async () => {
    const { result } = render();
    const next = folder();
    await act(async () => {
      await result.current.docs.addFolder(next);
    });

    let ok = false;
    await act(async () => {
      ok = await result.current.docs.renameFolder(next.id, {
        name: "  مجلد مُعاد  ",
        nameEn: "  Renamed  ",
        type: "dept",
        accessScope: "عام",
      });
    });

    expect(ok).toBe(true);
    expect(result.current.docs.folders.find((entry) => entry.id === next.id)).toMatchObject({
      name: "مجلد مُعاد",
      nameEn: "Renamed",
      type: "dept",
      accessScope: "عام",
    });
  });

  it("falls back to the existing name and refuses an unknown folder", async () => {
    const { result } = render();
    const next = folder({ name: "الأصل", nameEn: "Original" });
    await act(async () => {
      await result.current.docs.addFolder(next);
    });

    let ok = false;
    await act(async () => {
      ok = await result.current.docs.renameFolder(next.id, { name: "   ", nameEn: "   " });
    });
    expect(ok).toBe(true);
    expect(result.current.docs.folders.find((entry) => entry.id === next.id)).toMatchObject({ name: "الأصل", nameEn: "الأصل" });

    let missing = true;
    await act(async () => {
      missing = await result.current.docs.renameFolder("fold-ghost", { name: "x" });
    });
    expect(missing).toBe(false);
  });

  it("deletes a folder from the tree", async () => {
    const { result } = render();
    const next = folder();
    await act(async () => {
      await result.current.docs.addFolder(next);
    });

    let ok = false;
    await act(async () => {
      ok = await result.current.docs.deleteFolder(next.id);
    });

    expect(ok).toBe(true);
    expect(result.current.docs.folders.some((entry) => entry.id === next.id)).toBe(false);
  });
});

describe("store retention actions", () => {
  it("schedules a retention item from the document and replaces an earlier one", async () => {
    const { result } = render();
    const document = result.current.docs.docs[0];
    const policy = result.current.docs.policies.items[0];
    const expected = monthsFrom(document.createdAt, policy.retentionMonths || 12);

    let ok = false;
    await act(async () => {
      ok = await result.current.docs.scheduleRetention(document.id, policy.id);
    });
    expect(ok).toBe(true);

    const scheduled = result.current.docs.retention.filter((item) => item.documentId === document.id);
    expect(scheduled).toHaveLength(1);
    expect(scheduled[0]).toMatchObject({
      docTitle: document.title,
      docNo: document.docNo,
      policy: policy.name,
      retentionEnd: expected.end,
      daysLeft: expected.daysLeft,
      proposedAction: policy.disposal,
      reviewStatus: "pending",
    });

    await act(async () => {
      await result.current.docs.scheduleRetention(document.id, policy.id);
    });
    expect(result.current.docs.retention.filter((item) => item.documentId === document.id)).toHaveLength(1);
  });

  it("refuses an unknown document or policy", async () => {
    const { result } = render();
    const document = result.current.docs.docs[0];
    const policy = result.current.docs.policies.items[0];

    let unknownDoc = true;
    let unknownPolicy = true;
    await act(async () => {
      unknownDoc = await result.current.docs.scheduleRetention("doc-ghost", policy.id);
      unknownPolicy = await result.current.docs.scheduleRetention(document.id, "pol-ghost");
    });

    expect(unknownDoc).toBe(false);
    expect(unknownPolicy).toBe(false);
  });

  it("extends a retention item and recomputes the remaining days", async () => {
    const { result } = render();
    const document = result.current.docs.docs[0];
    const policy = result.current.docs.policies.items[0];
    await act(async () => {
      await result.current.docs.scheduleRetention(document.id, policy.id);
    });
    const item = result.current.docs.retention.find((entry) => entry.documentId === document.id)!;
    const dueAt = new Date(Date.now() + 30 * 86_400_000).toISOString().slice(0, 10);

    let ok = false;
    await act(async () => {
      ok = await result.current.docs.removeRetention(item.id, { dueAt });
    });

    expect(ok).toBe(true);
    const updated = result.current.docs.retention.find((entry) => entry.id === item.id)!;
    expect(updated.retentionEnd).toBe(dueAt);
    expect(updated.daysLeft).toBe(Math.ceil((new Date(dueAt).getTime() - Date.now()) / 86_400_000));
  });

  it("records a review decision without touching the due date", async () => {
    const { result } = render();
    const document = result.current.docs.docs[0];
    const policy = result.current.docs.policies.items[0];
    await act(async () => {
      await result.current.docs.scheduleRetention(document.id, policy.id);
    });
    const item = result.current.docs.retention.find((entry) => entry.documentId === document.id)!;

    await act(async () => {
      await result.current.docs.removeRetention(item.id, { action: "DESTROY" });
    });

    const updated = result.current.docs.retention.find((entry) => entry.id === item.id)!;
    expect(updated.reviewStatus).toBe("reviewed");
    expect(updated.action).toBe("DESTROY");
    expect(updated.executedAt).toBeTruthy();
    expect(updated.retentionEnd).toBe(item.retentionEnd);
  });

  it("builds an offline destruction certificate for a known item only", async () => {
    const { result } = render();
    const document = result.current.docs.docs[0];
    const policy = result.current.docs.policies.items[0];
    await act(async () => {
      await result.current.docs.scheduleRetention(document.id, policy.id);
    });
    const item = result.current.docs.retention.find((entry) => entry.documentId === document.id)!;

    const certificate = await result.current.docs.retentionCertificate(item.id);
    expect(certificate).toMatchObject({
      retentionItemId: item.id,
      document: { id: document.id, docNo: document.docNo, title: document.title },
      policy: { name: policy.name },
      dueAt: item.retentionEnd,
      fileCount: 0,
    });
    expect(certificate?.certificateRef).toContain(item.id.toUpperCase());

    await expect(result.current.docs.retentionCertificate("ret-ghost")).resolves.toBeNull();
  });
});

describe("store ACL actions", () => {
  function rule() {
    return {
      principalType: "user" as const,
      principalId: "u-acl",
      principalName: "مستخدم الصلاحيات",
      permissions: ["view"] as ("view" | "edit" | "delete" | "download")[],
    };
  }

  it("adds, edits and removes an own rule", () => {
    const { result } = render();
    const folderId = result.current.docs.folders[0].id;
    const before = result.current.docs.acls[folderId]?.length ?? 0;

    act(() => result.current.docs.addACLRule(folderId, rule()));
    const added = result.current.docs.acls[folderId];
    expect(added).toHaveLength(before + 1);
    const addedRule = added[added.length - 1];
    expect(addedRule).toMatchObject({ principalName: "مستخدم الصلاحيات", permissions: ["view"] });

    act(() => result.current.docs.toggleRulePermission(folderId, addedRule.id, "edit"));
    expect(result.current.docs.acls[folderId].find((entry) => entry.id === addedRule.id)?.permissions).toEqual(["view", "edit"]);

    act(() => result.current.docs.toggleRulePermission(folderId, addedRule.id, "view"));
    expect(result.current.docs.acls[folderId].find((entry) => entry.id === addedRule.id)?.permissions).toEqual(["edit"]);

    act(() => result.current.docs.toggleRuleEffect(folderId, addedRule.id));
    expect(result.current.docs.acls[folderId].find((entry) => entry.id === addedRule.id)?.effect).toBe("deny");

    act(() => result.current.docs.toggleRuleEffect(folderId, addedRule.id));
    expect(result.current.docs.acls[folderId].find((entry) => entry.id === addedRule.id)?.effect).toBe("allow");

    act(() => result.current.docs.removeACLRule(folderId, addedRule.id));
    expect(result.current.docs.acls[folderId].some((entry) => entry.id === addedRule.id)).toBe(false);
  });

  it("inherits a parent rule into a fresh child folder without marking it as own", async () => {
    const { result } = render();
    const parent = result.current.docs.folders.find((entry) => entry.parentId === null) ?? result.current.docs.folders[0];
    const childId = `fold-child-${Math.random().toString(36).slice(2, 8)}`;

    await act(async () => {
      await result.current.docs.addFolder({
        id: childId,
        name: "مجلد فرعي",
        nameEn: "Child",
        parentId: parent.id,
        type: "project",
        docs: 0,
        subfolders: 0,
        accessScope: "خاص",
      });
    });
    expect(result.current.docs.hasOwnRules(childId)).toBe(false);

    act(() => result.current.docs.addACLRule(parent.id, { ...rule(), principalName: "قاعدة الأب" }));

    expect(result.current.docs.hasOwnRules(parent.id)).toBe(true);
    expect(result.current.docs.hasOwnRules(childId)).toBe(false);
    const inherited = result.current.docs.getInheritedRules(childId);
    expect(inherited.some((entry) => entry.rule.principalName === "قاعدة الأب" && entry.fromFolderId === parent.id)).toBe(true);
    expect(result.current.docs.getEffectiveRules(childId).some((entry) => entry.principalName === "قاعدة الأب")).toBe(true);
  });
});

describe("store notifications and settings", () => {
  it("marks one notification read and reports success", () => {
    const { result } = render();
    const target = result.current.docs.notifications.find((item) => !item.read) ?? result.current.docs.notifications[0];
    const onResult = vi.fn();

    act(() => result.current.docs.markNotificationRead(target.id, onResult));

    expect(result.current.docs.notifications.find((item) => item.id === target.id)?.read).toBe(true);
    expect(onResult).toHaveBeenCalledWith(true);
  });

  it("marks every notification read", () => {
    const { result } = render();
    const onResult = vi.fn();

    act(() => result.current.docs.markAllNotificationsRead(onResult));

    expect(result.current.docs.notifications.every((item) => item.read)).toBe(true);
    expect(onResult).toHaveBeenCalledWith(true);
  });

  it("writes one setting and merges a batch", () => {
    const { result } = render();

    act(() => result.current.docs.setSystemSetting("sessionTimeout", "45"));
    expect(result.current.docs.systemSettings.sessionTimeout).toBe("45");

    act(() => result.current.docs.applySystemSettings({ backupHour: "02", watermark: "on" }));
    expect(result.current.docs.systemSettings).toMatchObject({ sessionTimeout: "45", backupHour: "02", watermark: "on" });
  });
});

describe("store legal holds", () => {
  it("places a hold, marks it active and releases it", async () => {
    const { result } = render();
    const before = result.current.docs.holds.items.length;

    let placed = false;
    await act(async () => {
      placed = await result.current.docs.addHold({
        ref: "HOLD-1",
        reason: "نزاع قضائي",
        caseRef: "CASE-9",
        placedBy: "سارة",
        placedAt: "2026-11-11",
        items: 1,
        documentIds: [result.current.docs.docs[0].id],
      });
    });

    expect(placed).toBe(true);
    expect(result.current.docs.holds.items).toHaveLength(before + 1);
    const hold = result.current.docs.holds.items.find((entry) => entry.ref === "HOLD-1")!;
    expect(hold).toMatchObject({ ref: "HOLD-1", status: "active", caseRef: "CASE-9", items: 1 });

    let released = false;
    await act(async () => {
      released = await result.current.docs.releaseHold(hold.id);
    });
    expect(released).toBe(true);
    expect(result.current.docs.holds.items.find((entry) => entry.id === hold.id)?.status).toBe("released");
  });
});

describe("store document moves and task actions", () => {
  it("moves documents to another folder and reports success", () => {
    const { result } = render();
    const ids = [result.current.docs.docs[0].id, result.current.docs.docs[1].id];
    const target = result.current.docs.folders[1].id;
    const onResult = vi.fn();

    act(() => result.current.docs.moveDocs(ids, target, onResult));

    expect(onResult).toHaveBeenCalledWith(true);
    for (const id of ids) expect(result.current.docs.docs.find((doc) => doc.id === id)?.folderId).toBe(target);
  });

  it("reports the trash callbacks with the number of moved documents", () => {
    const { result } = render();
    const id = result.current.docs.docs[0].id;
    const onResult = vi.fn();

    act(() => result.current.docs.deleteDocs([id], onResult));

    expect(onResult).toHaveBeenCalledWith(true, 1);
  });

  it("returns true when restoring, purging and emptying the trash", async () => {
    const { result } = render();
    const id = result.current.docs.docs[0].id;
    act(() => result.current.docs.deleteDocs([id]));

    await act(async () => {
      await expect(result.current.docs.restoreDocs([id])).resolves.toBe(true);
    });
    act(() => result.current.docs.deleteDocs([id]));
    await act(async () => {
      await expect(result.current.docs.purgeDocs([id])).resolves.toBe(true);
    });
    await act(async () => {
      await expect(result.current.docs.emptyTrash()).resolves.toBe(true);
    });
    expect(result.current.docs.trash).toHaveLength(0);
  });

  it("completes, rejects and reassigns workflow tasks offline", async () => {
    const { result } = render();
    const [first, second, third] = result.current.docs.tasks;
    expect(first).toBeTruthy();

    await act(async () => {
      await expect(result.current.docs.removeTask(first.id)).resolves.toBe(true);
    });
    expect(result.current.docs.tasks.some((task) => task.id === first.id)).toBe(false);

    await act(async () => {
      await expect(result.current.docs.rejectTask(second.id, "ناقص")).resolves.toBe(true);
    });
    expect(result.current.docs.tasks.find((task) => task.id === second.id)?.status).toBe("rejected");

    await act(async () => {
      await expect(result.current.docs.requestChanges(third.id, "أعد التنسيق")).resolves.toBe(true);
    });
    expect(result.current.docs.tasks.some((task) => task.id === third.id)).toBe(false);

    await act(async () => {
      await expect(result.current.docs.reassignTask(third.id, "سارة")).resolves.toBe(true);
    });
    expect(result.current.docs.tasks.some((task) => task.id === third.id)).toBe(false);
  });

  it("returns true when deciding an approval offline", async () => {
    const { result } = render();

    await act(async () => {
      await expect(result.current.docs.decideApproval("apr-1", "APPROVED", "موافق")).resolves.toBe(true);
    });
  });
});

describe("store signature and record lifecycle", () => {
  it("requests a signature and signs the document", async () => {
    const { result } = render();
    const id = result.current.docs.docs[0].id;

    await act(async () => {
      await expect(result.current.docs.requestSignature(id)).resolves.toBe(true);
    });
    expect(result.current.docs.docs.find((doc) => doc.id === id)?.signatureStatus).toBe("pending");

    await act(async () => {
      await expect(result.current.docs.signDocument(id, "سارة المطيري")).resolves.toBe(true);
    });
    const signed = result.current.docs.docs.find((doc) => doc.id === id)!;
    expect(signed.signatureStatus).toBe("signed");
    expect(signed.signedBy).toBe("سارة المطيري");
    expect(signed.signedAt).toBeTruthy();
  });

  it("declares an official immutable record", async () => {
    const { result } = render();
    const id = result.current.docs.docs[0].id;

    await act(async () => {
      await expect(result.current.docs.declareRecord(id)).resolves.toBe(true);
    });

    const declared = result.current.docs.docs.find((doc) => doc.id === id)!;
    expect(declared.declaredRecord).toBe(true);
    expect(declared.status).toBe("archived");
  });

  it("uploads a new offline version and marks only it current", async () => {
    const { result } = render();
    const target = result.current.docs.docs[0];
    const next = (parseFloat(target.version) + 1).toFixed(1);

    await act(async () => {
      await expect(result.current.docs.uploadNewVersion(target.id, "سارة", pdf("v2.pdf"))).resolves.toBe(true);
    });

    const updated = result.current.docs.docs.find((doc) => doc.id === target.id)!;
    expect(updated.version).toBe(next);
    expect(updated.versions).toHaveLength(target.versions.length + 1);
    expect(updated.versions.filter((entry) => entry.current)).toHaveLength(1);
    expect(updated.versions.find((entry) => entry.v === next)).toMatchObject({ current: true, by: "سارة" });
  });
});

describe("store error center actions", () => {
  it("changes status, assigns an owner and appends a note", () => {
    const { result } = render();
    const target = result.current.docs.errors.items[0];
    expect(target).toBeTruthy();

    act(() => result.current.docs.setErrorStatus(target.id, "investigating"));
    expect(result.current.docs.errors.items.find((entry) => entry.id === target.id)?.status).toBe("investigating");

    act(() => result.current.docs.assignError(target.id, "خالد"));
    expect(result.current.docs.errors.items.find((entry) => entry.id === target.id)?.owner).toBe("خالد");

    act(() => result.current.docs.addErrorNote(target.id, { by: "خالد", text: "تم الفحص", at: "2026-11-11" }));
    expect(result.current.docs.errors.items.find((entry) => entry.id === target.id)?.notes).toEqual([
      { by: "خالد", text: "تم الفحص", at: "2026-11-11" },
    ]);

    act(() => result.current.docs.clearErrors());
    expect(result.current.docs.errors.items).toHaveLength(0);
  });
});
