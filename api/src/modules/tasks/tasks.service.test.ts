import { BadRequestException, ForbiddenException, NotFoundException } from "@nestjs/common";
import { describe, expect, it, vi } from "vitest";
import { TasksService } from "./tasks.service";

const PRINCIPAL = { sub: "user-1" } as never;
const EMPLOYEE = { id: "user-1", departmentId: "dept-fin", role: "EMPLOYEE" };
const ADMIN = { id: "user-admin", departmentId: null, role: "SYSTEM_ADMIN" };

function taskRow(overrides: Record<string, unknown> = {}) {
  return {
    id: "task-1",
    title: "مراجعة العقد",
    description: "قبل الاعتماد",
    documentId: "doc-1",
    assigneeId: "user-1",
    createdById: "user-1",
    status: "open",
    priority: "normal",
    dueAt: null,
    completedAt: null,
    createdAt: new Date("2026-11-01T00:00:00.000Z"),
    ...overrides,
  };
}

function buildService(actor: typeof EMPLOYEE | typeof ADMIN = EMPLOYEE, task = taskRow()) {
  const prisma = {
    $transaction: vi.fn(),
    taskItem: {
      findMany: vi.fn().mockResolvedValue([task]),
      count: vi.fn().mockResolvedValue(1),
      findUnique: vi.fn(async () => (task ? task : null)),
      create: vi.fn(async ({ data }: { data: Record<string, unknown> }) => ({ id: "task-new", ...data })),
      update: vi.fn(async ({ data }: { data: Record<string, unknown> }) => ({ ...task, ...data })),
      delete: vi.fn().mockResolvedValue({}),
    },
    taskComment: {
      findMany: vi.fn().mockResolvedValue([{ id: "comment-1", body: "تم" }]),
      create: vi.fn(async ({ data }: { data: { body: string } }) => ({ id: "comment-2", ...data })),
    },
    document: { findUnique: vi.fn().mockResolvedValue({ id: "doc-1" }) },
    user: { findUnique: vi.fn().mockResolvedValue({ name: "سارة", departmentId: "dept-fin" }) },
  };
  const transaction = prisma.$transaction as unknown as { mockImplementation: (work: (input: unknown) => unknown) => void };
  transaction.mockImplementation(async (work) => Promise.all(work as Promise<unknown>[]));

  const access = {
    resolveActor: vi.fn().mockResolvedValue(actor),
    isGlobal: vi.fn().mockReturnValue(actor.role === "SYSTEM_ADMIN"),
  };
  const audit = { record: vi.fn().mockResolvedValue(undefined) };
  return { service: new TasksService(prisma as never, access as never, audit as never), prisma, audit };
}

describe("TasksService list", () => {
  it("scopes a department user to tasks they own or assign", async () => {
    const { service, prisma } = buildService();

    const result = await service.list(PRINCIPAL, { page: 2, pageSize: 5 } as never);

    expect(prisma.taskItem.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        skip: 5,
        take: 5,
        where: expect.objectContaining({
          AND: [{ OR: [{ assigneeId: "user-1" }, { createdById: "user-1" }] }],
        }),
      }),
    );
    expect(result.meta).toEqual({ page: 2, pageSize: 5, total: 1 });
  });

  it("passes the filters through and searches title and description", async () => {
    const { service, prisma } = buildService();

    await service.list(PRINCIPAL, { status: "completed", documentId: "doc-1", q: "عقد" } as never);

    const where = (prisma.taskItem.findMany.mock.calls[0][0] as { where: Record<string, unknown> }).where;
    expect(where).toMatchObject({
      status: "completed",
      documentId: "doc-1",
      OR: [{ title: { contains: "عقد", mode: "insensitive" } }, { description: { contains: "عقد", mode: "insensitive" } }],
    });
  });

  it("lets a system administrator list every task", async () => {
    const { service, prisma } = buildService(ADMIN);

    await service.list(PRINCIPAL, {} as never);

    const where = (prisma.taskItem.findMany.mock.calls[0][0] as { where: Record<string, unknown> }).where;
    expect(where.AND).toBeUndefined();
  });
});

describe("TasksService create", () => {
  it("refuses an unprovisioned actor", async () => {
    const { service, prisma } = buildService({ ...EMPLOYEE, id: "" });

    await expect(service.create(PRINCIPAL, { title: "مهمة" } as never)).rejects.toBeInstanceOf(BadRequestException);
    expect(prisma.taskItem.create).not.toHaveBeenCalled();
  });

  it("refuses a task over a missing document", async () => {
    const { service, prisma } = buildService();
    prisma.document.findUnique.mockResolvedValue(null);

    await expect(service.create(PRINCIPAL, { title: "مهمة", documentId: "doc-404" } as never)).rejects.toThrow(/Document not found/);
  });

  it("refuses an assignee from another department", async () => {
    const { service, prisma } = buildService();
    prisma.user.findUnique.mockResolvedValue({ departmentId: "dept-legal" });

    await expect(service.create(PRINCIPAL, { title: "مهمة", assigneeId: "user-9" } as never)).rejects.toBeInstanceOf(
      ForbiddenException,
    );
  });

  it("refuses an assignee that does not exist", async () => {
    const { service, prisma } = buildService();
    prisma.user.findUnique.mockResolvedValue(null);

    await expect(service.create(PRINCIPAL, { title: "مهمة", assigneeId: "ghost" } as never)).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });

  it("defaults the assignee to the creator and records the task", async () => {
    const { service, prisma, audit } = buildService();

    const task = await service.create(PRINCIPAL, { title: "مهمة", dueAt: "2026-12-01T00:00:00.000Z" } as never);

    expect(prisma.taskItem.create).toHaveBeenCalledWith({
      data: {
        title: "مهمة",
        description: undefined,
        documentId: undefined,
        assigneeId: "user-1",
        createdById: "user-1",
        priority: "normal",
        dueAt: new Date("2026-12-01T00:00:00.000Z"),
      },
    });
    expect(audit.record).toHaveBeenCalledWith(
      expect.objectContaining({ action: "task.create", entityId: "task-new", departmentId: "dept-fin" }),
    );
    expect(task.id).toBe("task-new");
  });
});

describe("TasksService update and complete", () => {
  it("reports a missing task", async () => {
    const { service, prisma } = buildService();
    prisma.taskItem.findUnique.mockResolvedValue(null);

    await expect(service.update(PRINCIPAL, "task-404", { title: "x" } as never)).rejects.toBeInstanceOf(NotFoundException);
  });

  it("refuses an actor who neither owns nor is assigned the task", async () => {
    const { service, prisma } = buildService(EMPLOYEE, taskRow({ assigneeId: "user-2", createdById: "user-2" }));

    await expect(service.update(PRINCIPAL, "task-1", { title: "x" } as never)).rejects.toBeInstanceOf(ForbiddenException);
    expect(prisma.taskItem.update).not.toHaveBeenCalled();
  });

  it("stamps completedAt when the task is completed", async () => {
    const { service, prisma, audit } = buildService();

    await service.complete(PRINCIPAL, "task-1");

    const data = (prisma.taskItem.update.mock.calls[0][0] as { data: { completedAt: Date; status: string } }).data;
    expect(data.status).toBe("completed");
    expect(data.completedAt).toBeInstanceOf(Date);
    expect(audit.record).toHaveBeenCalledWith(expect.objectContaining({ action: "task.update", detail: { status: "completed" } }));
  });

  it("clears completedAt when the task is reopened", async () => {
    const { service, prisma } = buildService(EMPLOYEE, taskRow({ status: "completed", completedAt: new Date() }));

    await service.update(PRINCIPAL, "task-1", { status: "open" } as never);

    const data = (prisma.taskItem.update.mock.calls[0][0] as { data: { completedAt: unknown } }).data;
    expect(data.completedAt).toBeNull();
  });
});

describe("TasksService comments", () => {
  it("refuses comments from an actor outside the task scope", async () => {
    const { service } = buildService(EMPLOYEE, taskRow({ assigneeId: "user-2", createdById: "user-2" }));

    await expect(service.listComments(PRINCIPAL, "task-1")).rejects.toBeInstanceOf(ForbiddenException);
    await expect(service.addComment(PRINCIPAL, "task-1", { body: "x" } as never)).rejects.toBeInstanceOf(ForbiddenException);
  });

  it("lists comments ordered by creation", async () => {
    const { service, prisma } = buildService();

    const result = await service.listComments(PRINCIPAL, "task-1");

    expect(result.items).toHaveLength(1);
    expect(result.meta).toEqual({ total: 1 });
    expect(prisma.taskComment.findMany).toHaveBeenCalledWith({ where: { taskId: "task-1" }, orderBy: { createdAt: "asc" } });
  });

  it("trims and signs the comment with the actor name", async () => {
    const { service, prisma, audit } = buildService();

    const comment = await service.addComment(PRINCIPAL, "task-1", { body: "  تمت المراجعة  " } as never);

    expect(prisma.taskComment.create).toHaveBeenCalledWith({
      data: { taskId: "task-1", authorId: "user-1", authorName: "سارة", body: "تمت المراجعة" },
    });
    expect(comment.body).toBe("تمت المراجعة");
    expect(audit.record).toHaveBeenCalledWith(expect.objectContaining({ action: "task.comment", detail: { commentId: "comment-2" } }));
  });
});

describe("TasksService remove", () => {
  it("reports a missing task", async () => {
    const { service, prisma } = buildService();
    prisma.taskItem.findUnique.mockResolvedValue(null);

    await expect(service.remove(PRINCIPAL, "task-404")).rejects.toBeInstanceOf(NotFoundException);
  });

  it("keeps deletion for the creator", async () => {
    const { service, prisma } = buildService(EMPLOYEE, taskRow({ createdById: "user-2", assigneeId: "user-2" }));

    await expect(service.remove(PRINCIPAL, "task-1")).rejects.toBeInstanceOf(ForbiddenException);
    expect(prisma.taskItem.delete).not.toHaveBeenCalled();
  });

  it("deletes and audits when the actor created the task", async () => {
    const { service, prisma, audit } = buildService();

    await expect(service.remove(PRINCIPAL, "task-1")).resolves.toEqual({ id: "task-1", deleted: true });

    expect(prisma.taskItem.delete).toHaveBeenCalledWith({ where: { id: "task-1" } });
    expect(audit.record).toHaveBeenCalledWith(expect.objectContaining({ action: "task.delete", detail: { title: "مراجعة العقد" } }));
  });
});
