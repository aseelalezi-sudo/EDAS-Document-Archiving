import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from "@nestjs/common";
import { AclAction, ApprovalStatus, DocumentStatus, NotificationLevel, Prisma, UserRole } from "@prisma/client";
import { AccessService } from "../../common/access/access.service";
import type { Principal } from "../../common/auth/principal";
import { advisoryLock, documentHoldLock } from "../../common/db/advisory-lock";
import { isUniqueViolation } from "../../common/db/prisma-errors";
import { PrismaService } from "../../common/prisma/prisma.service";
import { AuditService } from "../audit/audit.service";
import { NotificationsService } from "../notifications/notifications.service";
import { CreateChainDto } from "./dto/create-chain.dto";
import { DecideApprovalDto } from "./dto/decide-approval.dto";
import { ListApprovalsQuery } from "./dto/list-approvals.query";
import { SubmitApprovalDto } from "./dto/submit-approval.dto";
import { UpdateChainDto } from "./dto/update-chain.dto";

const INSTANCE_INCLUDE = {
  chain: { include: { steps: { orderBy: { order: "asc" } } } },
  decisions: { orderBy: { decidedAt: "asc" } },
  document: { select: { id: true, docNo: true, title: true, departmentId: true, folderId: true, ownerId: true, status: true } },
} satisfies Prisma.ApprovalInstanceInclude;

type InstanceWithRelations = Prisma.ApprovalInstanceGetPayload<{ include: typeof INSTANCE_INCLUDE }>;

@Injectable()
export class ApprovalsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly access: AccessService,
    private readonly audit: AuditService,
    private readonly notifications: NotificationsService,
  ) {}

  async listChains() {
    const items = await this.prisma.approvalChain.findMany({
      orderBy: { createdAt: "asc" },
      include: { steps: { orderBy: { order: "asc" } }, _count: { select: { instances: true } } },
    });
    return { items, meta: { total: items.length } };
  }

  async createChain(principal: Principal, dto: CreateChainDto) {
    const actor = await this.access.resolveActor(principal);
    const orders = dto.steps.map((step, index) => step.order ?? index + 1);
    if (new Set(orders).size !== orders.length) throw new BadRequestException("Approval step orders must be unique");

    const chain = await this.prisma.approvalChain.create({
      data: {
        name: dto.name,
        description: dto.description,
        steps: {
          create: dto.steps.map((step, index) => ({
            order: step.order ?? index + 1,
            role: step.role,
            name: step.name,
          })),
        },
      },
      include: { steps: { orderBy: { order: "asc" } } },
    });

    await this.audit.record({
      action: "approval.chain.create",
      entityType: "ApprovalChain",
      entityId: chain.id,
      actorId: actor.id || null,
      departmentId: actor.departmentId,
      detail: { name: chain.name, steps: chain.steps.map((step) => `${step.order}:${step.role}`) },
    });

    return chain;
  }

  async updateChain(principal: Principal, id: string, dto: UpdateChainDto) {
    const actor = await this.access.resolveActor(principal);
    const chain = await this.prisma.approvalChain.findUnique({ where: { id } });
    if (!chain) throw new NotFoundException("Approval chain not found");

    if (dto.steps) {
      const orders = dto.steps.map((step, index) => step.order ?? index + 1);
      if (new Set(orders).size !== orders.length) throw new BadRequestException("Approval step orders must be unique");
    }

    const updated = await this.prisma.$transaction(async (tx) => {
      if (dto.steps) {
        await advisoryLock(tx, `edas.chain.${id}`);
        const pending = await tx.approvalInstance.count({ where: { chainId: id, status: ApprovalStatus.PENDING } });
        if (pending > 0) throw new ConflictException("Approval chain has pending instances");

        await tx.approvalStep.deleteMany({ where: { chainId: id } });
        await tx.approvalStep.createMany({
          data: dto.steps.map((step, index) => ({
            chainId: id,
            order: step.order ?? index + 1,
            role: step.role,
            name: step.name,
          })),
        });
      }
      return tx.approvalChain.update({
        where: { id },
        data: { name: dto.name, description: dto.description, isActive: dto.isActive },
        include: { steps: { orderBy: { order: "asc" } } },
      });
    });

    await this.audit.record({
      action: "approval.chain.update",
      entityType: "ApprovalChain",
      entityId: id,
      actorId: actor.id || null,
      departmentId: actor.departmentId,
      detail: { ...dto, steps: updated.steps.map((step) => `${step.order}:${step.role}`) },
    });

    return updated;
  }

  async get(principal: Principal, id: string) {
    const actor = await this.access.resolveActor(principal);
    const instance = await this.prisma.approvalInstance.findUnique({ where: { id }, include: INSTANCE_INCLUDE });
    if (!instance) throw new NotFoundException("Approval not found");
    await this.access.assertDepartmentScope(actor, instance.document);
    return this.toDto(instance);
  }

  async list(principal: Principal, query: ListApprovalsQuery) {
    const actor = await this.access.resolveActor(principal);
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 25;

    const where: Prisma.ApprovalInstanceWhereInput = {};
    if (query.status) where.status = query.status;
    if (query.documentId) where.documentId = query.documentId;
    if (!this.access.isGlobal(actor)) {
      const visibility = await this.access.documentVisibilityFilter(actor);
      if (visibility) where.document = visibility;
    }

    const [items, total] = await this.prisma.$transaction([
      this.prisma.approvalInstance.findMany({
        where,
        orderBy: { startedAt: "desc" },
        skip: (page - 1) * pageSize,
        take: pageSize,
        include: INSTANCE_INCLUDE,
      }),
      this.prisma.approvalInstance.count({ where }),
    ]);

    return { items: items.map((item) => this.toDto(item)), meta: { page, pageSize, total } };
  }

  async pending(principal: Principal) {
    const actor = await this.access.resolveActor(principal);
    const where: Prisma.ApprovalInstanceWhereInput = { status: ApprovalStatus.PENDING };
    if (!this.access.isGlobal(actor)) {
      const visibility = await this.access.documentVisibilityFilter(actor);
      if (visibility) where.document = visibility;
    }

    const instances = await this.prisma.approvalInstance.findMany({
      where,
      orderBy: { startedAt: "asc" },
      include: INSTANCE_INCLUDE,
    });

    const items = instances
      .filter((instance) => {
        const current = this.currentStep(instance);
        if (!current) return false;
        return actor.role === UserRole.SYSTEM_ADMIN || current.role === actor.role;
      })
      .map((instance) => this.toDto(instance));

    return { items, meta: { total: items.length } };
  }

  async submit(principal: Principal, dto: SubmitApprovalDto) {
    const document = await this.prisma.document.findUnique({ where: { id: dto.documentId } });
    if (!document) throw new NotFoundException("Document not found");

    const actor = await this.access.assert(principal, AclAction.APPROVE, document.folderId);
    await this.access.assertDepartmentScope(actor, document);
    if (document.isRecord) throw new ConflictException("Declared records cannot be sent for approval");

    const include = { steps: { orderBy: { order: "asc" as const } } };
    const chain = dto.chainId
      ? await this.prisma.approvalChain.findUnique({ where: { id: dto.chainId }, include })
      : await this.prisma.approvalChain.findFirst({ where: { isActive: true }, orderBy: { createdAt: "asc" }, include });

    if (!chain) throw new BadRequestException("No active approval chain configured");
    if (!chain.isActive) throw new BadRequestException("Approval chain is inactive");
    if (chain.steps.length === 0) throw new BadRequestException("Approval chain has no steps");

    const instance = await this.prisma.$transaction(async (tx) => {
      await advisoryLock(tx, `edas.chain.${chain.id}`);
      await advisoryLock(tx, documentHoldLock(document.id));

      const pending = await tx.approvalInstance.count({ where: { documentId: document.id, status: ApprovalStatus.PENDING } });
      if (pending > 0) throw new ConflictException("Document already has a pending approval");

      const created = await tx.approvalInstance.create({
        data: {
          documentId: document.id,
          chainId: chain.id,
          startedById: actor.id || null,
        },
        include: INSTANCE_INCLUDE,
      });

      await tx.document.update({ where: { id: document.id }, data: { status: DocumentStatus.IN_REVIEW } });

      await this.audit.record(
        {
          action: "approval.submit",
          entityType: "Document",
          entityId: document.id,
          actorId: actor.id || null,
          departmentId: document.departmentId,
          detail: { approvalId: created.id, chain: chain.name, comment: dto.comment },
        },
        tx,
      );

      return created;
    });

    await this.notifications.pushToRole(chain.steps[0].role, {
      title: "طلب اعتماد جديد",
      message: `الوثيقة ${document.docNo} بانتظار اعتمادك`,
      level: NotificationLevel.WARNING,
      entityType: "Document",
      entityId: document.id,
    });

    return this.toDto(instance);
  }

  async decide(principal: Principal, id: string, dto: DecideApprovalDto) {
    const seen = await this.prisma.approvalInstance.findUnique({ where: { id }, include: INSTANCE_INCLUDE });
    if (!seen) throw new NotFoundException("Approval not found");

    const actor = await this.access.resolveActor(principal);
    await this.access.assertDepartmentScope(actor, seen.document);

    const updated = await this.prisma.$transaction(async (tx) => {
      if (seen.chainId) await advisoryLock(tx, `edas.chain.${seen.chainId}`);
      await advisoryLock(tx, `edas.approval.${id}`);

      const instance = await tx.approvalInstance.findUnique({ where: { id }, include: INSTANCE_INCLUDE });
      if (!instance) throw new NotFoundException("Approval not found");
      if (instance.status !== ApprovalStatus.PENDING) throw new ConflictException(`Approval is already ${instance.status}`);

      const steps = instance.chain?.steps ?? [];
      if (steps.length === 0) throw new BadRequestException("Approval instance has no steps");

      const current = this.currentStep(instance);
      if (!current) throw new ConflictException("Approval has no pending step");
      if (actor.role !== current.role && actor.role !== UserRole.SYSTEM_ADMIN) {
        throw new ForbiddenException(`This step requires the ${current.role} role`);
      }

      const isLastStep = instance.decisions.length + 1 >= steps.length;
      const decision = dto.decision as ApprovalStatus;
      const nextStatus =
        decision === ApprovalStatus.REJECTED ? ApprovalStatus.REJECTED : isLastStep ? ApprovalStatus.APPROVED : ApprovalStatus.PENDING;
      const nextDocumentStatus =
        decision === ApprovalStatus.REJECTED ? DocumentStatus.DRAFT : isLastStep ? DocumentStatus.APPROVED : DocumentStatus.IN_REVIEW;

      try {
        await tx.approvalDecision.create({
          data: {
            instanceId: id,
            stepOrder: current.order,
            decision,
            comment: dto.comment,
            decidedById: actor.id || null,
          },
        });
      } catch (error) {
        if (isUniqueViolation(error)) throw new ConflictException("This step has already been decided");
        throw error;
      }

      const claimed = await tx.approvalInstance.updateMany({
        where: { id, status: ApprovalStatus.PENDING },
        data: { status: nextStatus, completedAt: nextStatus === ApprovalStatus.PENDING ? null : new Date() },
      });
      if (claimed.count === 0) throw new ConflictException("Approval is no longer pending");

      await tx.document.update({ where: { id: instance.documentId }, data: { status: nextDocumentStatus } });

      await this.audit.record(
        {
          action: "approval.decide",
          entityType: "Document",
          entityId: instance.documentId,
          actorId: actor.id || null,
          departmentId: instance.document.departmentId,
          detail: { approvalId: id, step: current.order, decision, comment: dto.comment, status: nextStatus },
        },
        tx,
      );

      const fresh = await tx.approvalInstance.findUnique({ where: { id }, include: INSTANCE_INCLUDE });
      if (!fresh) throw new NotFoundException("Approval not found");
      return fresh;
    });

    const nextStep = updated.status === ApprovalStatus.PENDING ? this.currentStep(updated) : null;
    if (nextStep) {
      await this.notifications.pushToRole(nextStep.role, {
        title: "طلب اعتماد جديد",
        message: `الوثيقة ${updated.document.docNo} بانتظار اعتمادك`,
        level: NotificationLevel.WARNING,
        entityType: "Document",
        entityId: updated.documentId,
      });
    } else if (updated.startedById) {
      const approved = updated.status === ApprovalStatus.APPROVED;
      await this.notifications.push({
        userId: updated.startedById,
        title: approved ? "تم اعتماد الوثيقة" : "تم رفض الوثيقة",
        message: `الوثيقة ${updated.document.docNo}`,
        level: approved ? NotificationLevel.SUCCESS : NotificationLevel.ERROR,
        entityType: "Document",
        entityId: updated.documentId,
      });
    }

    return this.toDto(updated);
  }

  private currentStep(instance: InstanceWithRelations) {
    const steps = instance.chain?.steps ?? [];
    const decided = new Set(instance.decisions.map((decision) => decision.stepOrder));
    return steps.find((step) => !decided.has(step.order)) ?? null;
  }

  private toDto(instance: InstanceWithRelations) {
    const steps = instance.chain?.steps ?? [];
    const decided = new Set(instance.decisions.map((decision) => decision.stepOrder));
    const current = this.currentStep(instance);

    return {
      id: instance.id,
      documentId: instance.documentId,
      document: instance.document,
      chainId: instance.chainId,
      chainName: instance.chain?.name ?? null,
      status: instance.status,
      startedById: instance.startedById,
      startedAt: instance.startedAt,
      completedAt: instance.completedAt,
      steps: steps.map((step) => ({
        order: step.order,
        name: step.name,
        role: step.role,
        decided: decided.has(step.order),
      })),
      currentStep: current ? { order: current.order, role: current.role } : null,
      decisions: instance.decisions.map((decision) => ({
        id: decision.id,
        stepOrder: decision.stepOrder,
        decision: decision.decision,
        comment: decision.comment,
        decidedById: decision.decidedById,
        decidedAt: decision.decidedAt,
      })),
    };
  }
}
