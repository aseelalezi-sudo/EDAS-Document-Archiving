import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { AccessService, type Actor } from "../../common/access/access.service";
import type { Principal } from "../../common/auth/principal";
import { PrismaService } from "../../common/prisma/prisma.service";
import { AuditService } from "../audit/audit.service";
import { CreateTaskCommentDto } from "./dto/create-task-comment.dto";
import { CreateTaskDto } from "./dto/create-task.dto";
import { ListTasksQuery } from "./dto/list-tasks.query";
import { UpdateTaskDto } from "./dto/update-task.dto";

@Injectable()
export class TasksService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly access: AccessService,
    private readonly audit: AuditService,
  ) {}

  async list(principal: Principal, query: ListTasksQuery) {
    const actor = await this.access.resolveActor(principal);
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 25;

    const where: Prisma.TaskItemWhereInput = {};
    if (query.status) where.status = query.status;
    if (query.assigneeId) where.assigneeId = query.assigneeId;
    if (query.documentId) where.documentId = query.documentId;
    if (query.q) {
      where.OR = [{ title: { contains: query.q, mode: "insensitive" } }, { description: { contains: query.q, mode: "insensitive" } }];
    }
    if (!this.access.isGlobal(actor)) {
      const scope: Prisma.TaskItemWhereInput[] = [{ assigneeId: actor.id || "__none__" }, { createdById: actor.id || "__none__" }];
      where.AND = [{ OR: scope }];
    }

    const [items, total] = await this.prisma.$transaction([
      this.prisma.taskItem.findMany({
        where,
        orderBy: [{ status: "asc" }, { dueAt: "asc" }, { createdAt: "desc" }],
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      this.prisma.taskItem.count({ where }),
    ]);

    return { items, meta: { page, pageSize, total } };
  }

  async create(principal: Principal, dto: CreateTaskDto) {
    const actor = await this.access.resolveActor(principal);
    if (!actor.id) throw new BadRequestException("Actor is not provisioned");

    if (dto.documentId) {
      const document = await this.prisma.document.findUnique({ where: { id: dto.documentId }, select: { id: true } });
      if (!document) throw new BadRequestException("Document not found");
    }
    const assigneeId = dto.assigneeId ?? actor.id;
    await this.assertAssignee(actor, assigneeId);

    const task = await this.prisma.taskItem.create({
      data: {
        title: dto.title,
        description: dto.description,
        documentId: dto.documentId,
        assigneeId,
        createdById: actor.id,
        priority: dto.priority ?? "normal",
        dueAt: dto.dueAt ? new Date(dto.dueAt) : null,
      },
    });

    await this.audit.record({
      action: "task.create",
      entityType: "TaskItem",
      entityId: task.id,
      actorId: actor.id,
      departmentId: actor.departmentId,
      detail: { title: task.title, assigneeId, documentId: dto.documentId ?? null },
    });

    return task;
  }

  async update(principal: Principal, id: string, dto: UpdateTaskDto) {
    const actor = await this.access.resolveActor(principal);
    const task = await this.mustFind(id);
    this.assertCanManage(actor, task);

    if (dto.assigneeId) await this.assertAssignee(actor, dto.assigneeId);

    const status = dto.status ?? task.status;
    const completedAt = status === "completed" ? (task.completedAt ?? new Date()) : null;

    const updated = await this.prisma.taskItem.update({
      where: { id },
      data: {
        title: dto.title,
        description: dto.description,
        assigneeId: dto.assigneeId,
        status: dto.status,
        priority: dto.priority,
        dueAt: dto.dueAt ? new Date(dto.dueAt) : undefined,
        completedAt,
      },
    });

    await this.audit.record({
      action: "task.update",
      entityType: "TaskItem",
      entityId: id,
      actorId: actor.id || null,
      departmentId: actor.departmentId,
      detail: { ...dto },
    });

    return updated;
  }

  async complete(principal: Principal, id: string) {
    return this.update(principal, id, { status: "completed" });
  }

  async listComments(principal: Principal, id: string) {
    const actor = await this.access.resolveActor(principal);
    const task = await this.mustFind(id);
    this.assertCanView(actor, task);

    const items = await this.prisma.taskComment.findMany({
      where: { taskId: id },
      orderBy: { createdAt: "asc" },
    });

    return { items, meta: { total: items.length } };
  }

  async addComment(principal: Principal, id: string, dto: CreateTaskCommentDto) {
    const actor = await this.access.resolveActor(principal);
    const task = await this.mustFind(id);
    this.assertCanView(actor, task);

    const author = actor.id ? await this.prisma.user.findUnique({ where: { id: actor.id }, select: { name: true } }) : null;
    const comment = await this.prisma.taskComment.create({
      data: {
        taskId: id,
        authorId: actor.id || null,
        authorName: author?.name ?? null,
        body: dto.body.trim(),
      },
    });

    await this.audit.record({
      action: "task.comment",
      entityType: "TaskItem",
      entityId: id,
      actorId: actor.id || null,
      departmentId: actor.departmentId,
      detail: { commentId: comment.id },
    });

    return comment;
  }

  async remove(principal: Principal, id: string) {
    const actor = await this.access.resolveActor(principal);
    const task = await this.mustFind(id);
    if (!this.access.isGlobal(actor) && task.createdById !== actor.id) {
      throw new ForbiddenException("Only the task creator can delete it");
    }

    await this.prisma.taskItem.delete({ where: { id } });

    await this.audit.record({
      action: "task.delete",
      entityType: "TaskItem",
      entityId: id,
      actorId: actor.id || null,
      departmentId: actor.departmentId,
      detail: { title: task.title },
    });

    return { id, deleted: true };
  }

  private async mustFind(id: string) {
    const task = await this.prisma.taskItem.findUnique({ where: { id } });
    if (!task) throw new NotFoundException("Task not found");
    return task;
  }

  private assertCanManage(actor: Actor, task: { assigneeId: string | null; createdById: string | null }) {
    const allowed = this.access.isGlobal(actor) || task.assigneeId === actor.id || task.createdById === actor.id;
    if (!allowed) throw new ForbiddenException("Only the assignee or creator can modify this task");
  }

  private assertCanView(actor: Actor, task: { assigneeId: string | null; createdById: string | null }) {
    const allowed = this.access.isGlobal(actor) || task.assigneeId === actor.id || task.createdById === actor.id;
    if (!allowed) throw new ForbiddenException("This task is outside your scope");
  }

  private async assertAssignee(actor: Actor, assigneeId: string) {
    const assignee = await this.prisma.user.findUnique({ where: { id: assigneeId }, select: { departmentId: true } });
    if (!assignee) throw new BadRequestException("Assignee not found");
    if (!this.access.isGlobal(actor) && assignee.departmentId && assignee.departmentId !== actor.departmentId) {
      throw new ForbiddenException("Assignee is outside your department");
    }
  }
}
