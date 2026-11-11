import { describe, expect, it, vi } from "vitest";
import type { TasksService } from "./tasks.service";
import { TasksController } from "./tasks.controller";

const PRINCIPAL = { sub: "user-1", role: "EMPLOYEE" };

function build() {
  const tasks = {
    list: vi.fn().mockResolvedValue({ items: [], total: 0 }),
    create: vi.fn().mockResolvedValue({ id: "task-1" }),
    update: vi.fn().mockResolvedValue({ id: "task-1" }),
    complete: vi.fn().mockResolvedValue({ id: "task-1" }),
    listComments: vi.fn().mockResolvedValue([]),
    addComment: vi.fn().mockResolvedValue({ id: "comment-1" }),
    remove: vi.fn().mockResolvedValue(undefined),
  };
  return { controller: new TasksController(tasks as unknown as TasksService), tasks };
}

describe("TasksController delegation", () => {
  it("forwards the list query and the create body", async () => {
    const { controller, tasks } = build();
    const query = { status: "open", page: 2 } as never;
    const dto = { title: "مراجعة العقد", assigneeId: "user-2" } as never;

    await controller.list(PRINCIPAL as never, query);
    await controller.create(PRINCIPAL as never, dto);

    expect(tasks.list).toHaveBeenCalledWith(PRINCIPAL, query);
    expect(tasks.create).toHaveBeenCalledWith(PRINCIPAL, dto);
  });

  it("forwards the update, completion and removal of one task", async () => {
    const { controller, tasks } = build();
    const dto = { status: "in_progress" } as never;

    await controller.update(PRINCIPAL as never, "task-1", dto);
    await controller.complete(PRINCIPAL as never, "task-1");
    await controller.remove(PRINCIPAL as never, "task-1");

    expect(tasks.update).toHaveBeenCalledWith(PRINCIPAL, "task-1", dto);
    expect(tasks.complete).toHaveBeenCalledWith(PRINCIPAL, "task-1");
    expect(tasks.remove).toHaveBeenCalledWith(PRINCIPAL, "task-1");
  });

  it("forwards the comment read and write", async () => {
    const { controller, tasks } = build();
    const dto = { body: "تم" } as never;

    await controller.comments(PRINCIPAL as never, "task-1");
    await controller.addComment(PRINCIPAL as never, "task-1", dto);

    expect(tasks.listComments).toHaveBeenCalledWith(PRINCIPAL, "task-1");
    expect(tasks.addComment).toHaveBeenCalledWith(PRINCIPAL, "task-1", dto);
  });
});
