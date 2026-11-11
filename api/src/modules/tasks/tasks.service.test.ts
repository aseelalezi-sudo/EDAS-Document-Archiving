import { describe, expect, it, vi } from "vitest";
import { ForbiddenException, NotFoundException } from "@nestjs/common";
import { TasksService } from "./tasks.service";

const task = { id: "task-1", title: "Review", assigneeId: "user-1", createdById: "user-2" };

function buildService() {
  const prisma = {
    taskItem: { findUnique: vi.fn() },
    taskComment: { findMany: vi.fn(), create: vi.fn() },
    user: { findUnique: vi.fn() },
  };
  const access = { resolveActor: vi.fn(), isGlobal: vi.fn() };
  const audit = { record: vi.fn() };
  const service = new TasksService(prisma as never, access as never, audit as never);
  return { service, prisma, access, audit };
}

describe("TasksService comments", () => {
  it("lists comments for the assignee ordered oldest first", async () => {
    const { service, prisma, access } = buildService();
    access.resolveActor.mockResolvedValue({ id: "user-1", departmentId: null, role: "EMPLOYEE" });
    access.isGlobal.mockReturnValue(false);
    prisma.taskItem.findUnique.mockResolvedValue(task);
    prisma.taskComment.findMany.mockResolvedValue([{ id: "comment-1", body: "First" }]);

    const result = await service.listComments({ sub: "user-1" } as never, "task-1");

    expect(prisma.taskComment.findMany).toHaveBeenCalledWith({ where: { taskId: "task-1" }, orderBy: { createdAt: "asc" } });
    expect(result).toEqual({ items: [{ id: "comment-1", body: "First" }], meta: { total: 1 } });
  });

  it("stores a trimmed comment with the author name and audits it", async () => {
    const { service, prisma, access, audit } = buildService();
    access.resolveActor.mockResolvedValue({ id: "user-1", departmentId: "dept-1", role: "EMPLOYEE" });
    access.isGlobal.mockReturnValue(false);
    prisma.taskItem.findUnique.mockResolvedValue(task);
    prisma.user.findUnique.mockResolvedValue({ name: "Sara" });
    prisma.taskComment.create.mockResolvedValue({ id: "comment-2", body: "Looks good" });

    const result = await service.addComment({ sub: "user-1" } as never, "task-1", { body: "  Looks good  " });

    expect(prisma.taskComment.create).toHaveBeenCalledWith({
      data: { taskId: "task-1", authorId: "user-1", authorName: "Sara", body: "Looks good" },
    });
    expect(audit.record).toHaveBeenCalledWith(expect.objectContaining({ action: "task.comment", entityId: "task-1" }));
    expect(result).toEqual({ id: "comment-2", body: "Looks good" });
  });

  it("rejects comments on tasks outside the actor scope", async () => {
    const { service, prisma, access } = buildService();
    access.resolveActor.mockResolvedValue({ id: "user-9", departmentId: null, role: "EMPLOYEE" });
    access.isGlobal.mockReturnValue(false);
    prisma.taskItem.findUnique.mockResolvedValue(task);

    await expect(service.addComment({ sub: "user-9" } as never, "task-1", { body: "Hi" })).rejects.toBeInstanceOf(ForbiddenException);
    expect(prisma.taskComment.create).not.toHaveBeenCalled();
  });

  it("returns 404 for an unknown task", async () => {
    const { service, prisma, access } = buildService();
    access.resolveActor.mockResolvedValue({ id: "user-1", departmentId: null, role: "EMPLOYEE" });
    prisma.taskItem.findUnique.mockResolvedValue(null);

    await expect(service.listComments({ sub: "user-1" } as never, "missing")).rejects.toBeInstanceOf(NotFoundException);
  });
});
