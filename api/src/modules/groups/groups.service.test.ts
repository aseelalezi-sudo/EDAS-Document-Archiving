import { BadRequestException, NotFoundException } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { describe, expect, it, vi } from "vitest";
import { GroupsService } from "./groups.service";

const PRINCIPAL = { sub: "user-admin" } as never;
const ADMIN = { id: "user-admin", departmentId: null };

function groupRow(overrides: Record<string, unknown> = {}) {
  return {
    id: "group-1",
    name: "لجنة العقود",
    nameEn: "Contracts",
    desc: "مراجعة العقود",
    scope: "",
    type: "functional",
    createdAt: new Date("2026-01-01T00:00:00.000Z"),
    members: [{ userId: "user-1" }, { userId: "user-2" }],
    ...overrides,
  };
}

function buildService() {
  const state = { existing: { id: "group-1", name: "لجنة العقود" } as { id: string; name?: string } | null, createError: null as unknown };
  const prisma = {
    group: {
      findMany: vi.fn(async () => [groupRow()]),
      findUnique: vi.fn(async () => state.existing),
      findUniqueOrThrow: vi.fn(async () => groupRow({ members: [] })),
      create: vi.fn(async ({ data }: { data: { name: string; members?: { createMany: { data: { userId: string }[] } } } }) => {
        if (state.createError) throw state.createError;
        return groupRow({
          name: data.name,
          members: data.members ? data.members.createMany.data : [],
        });
      }),
      update: vi.fn().mockResolvedValue({}),
      delete: vi.fn().mockResolvedValue({}),
    },
    groupMember: {
      deleteMany: vi.fn().mockResolvedValue({ count: 2 }),
      createMany: vi.fn().mockResolvedValue({ count: 1 }),
    },
    $transaction: vi.fn(),
  };
  const transaction = prisma.$transaction as unknown as { mockImplementation: (work: (input: unknown) => unknown) => void };
  transaction.mockImplementation(async (work) => (work as (tx: typeof prisma) => unknown)(prisma));

  const access = { resolveActor: vi.fn().mockResolvedValue(ADMIN) };
  const audit = { record: vi.fn().mockResolvedValue(undefined) };
  return { service: new GroupsService(prisma as never, access as never, audit as never), prisma, audit, state };
}

describe("GroupsService", () => {
  it("maps members to ids in the list", async () => {
    const { service } = buildService();

    const result = await service.list();

    expect(result.items[0]).toEqual(expect.objectContaining({ id: "group-1", memberIds: ["user-1", "user-2"] }));
    expect(result.meta).toEqual({ total: 1 });
  });

  it("creates a group with its members and audits it", async () => {
    const { service, prisma, audit } = buildService();

    const group = await service.create(PRINCIPAL, {
      name: "لجنة العقود",
      memberIds: ["user-1", "user-2"],
    } as never);

    expect(prisma.group.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          name: "لجنة العقود",
          desc: "",
          scope: "",
          type: "functional",
          members: { createMany: { data: [{ userId: "user-1" }, { userId: "user-2" }], skipDuplicates: true } },
        }),
      }),
    );
    expect(group.memberIds).toEqual(["user-1", "user-2"]);
    expect(audit.record).toHaveBeenCalledWith(expect.objectContaining({ action: "group.create", entityId: "group-1" }));
  });

  it("creates a group without a members block when none are given", async () => {
    const { service, prisma } = buildService();

    await service.create(PRINCIPAL, { name: "بلا أعضاء" } as never);

    const data = (prisma.group.create.mock.calls[0][0] as { data: Record<string, unknown> }).data;
    expect(data.members).toBeUndefined();
  });

  it("turns a broken member reference into a readable error", async () => {
    const { service, state } = buildService();
    state.createError = new Prisma.PrismaClientKnownRequestError("Foreign key constraint failed", {
      code: "P2003",
      clientVersion: "6.1.0",
    });

    await expect(service.create(PRINCIPAL, { name: "x", memberIds: ["ghost"] } as never)).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });

  it("rethrows unexpected write failures unchanged", async () => {
    const { service, state } = buildService();
    state.createError = new Error("connection reset");

    await expect(service.create(PRINCIPAL, { name: "x" } as never)).rejects.toThrow("connection reset");
  });

  it("reports a missing group on update and delete", async () => {
    const { service, state, prisma } = buildService();
    state.existing = null;

    await expect(service.update(PRINCIPAL, "group-404", { name: "x" } as never)).rejects.toBeInstanceOf(NotFoundException);
    await expect(service.remove(PRINCIPAL, "group-404")).rejects.toBeInstanceOf(NotFoundException);
    expect(prisma.group.delete).not.toHaveBeenCalled();
  });

  it("replaces the member list instead of appending to it", async () => {
    const { service, prisma } = buildService();

    await service.update(PRINCIPAL, "group-1", { name: "لجنة", memberIds: ["user-3"] } as never);

    expect(prisma.groupMember.deleteMany).toHaveBeenCalledWith({ where: { groupId: "group-1" } });
    expect(prisma.groupMember.createMany).toHaveBeenCalledWith({
      data: [{ groupId: "group-1", userId: "user-3" }],
      skipDuplicates: true,
    });
    expect(prisma.group.update).toHaveBeenCalledWith({
      where: { id: "group-1" },
      data: { name: "لجنة", nameEn: undefined, desc: undefined, scope: undefined, type: undefined },
    });
  });

  it("clears the members without inserting when the list is empty", async () => {
    const { service, prisma } = buildService();

    await service.update(PRINCIPAL, "group-1", { memberIds: [] } as never);

    expect(prisma.groupMember.deleteMany).toHaveBeenCalledWith({ where: { groupId: "group-1" } });
    expect(prisma.groupMember.createMany).not.toHaveBeenCalled();
  });

  it("leaves the membership untouched when memberIds is omitted", async () => {
    const { service, prisma } = buildService();

    await service.update(PRINCIPAL, "group-1", { name: "اسم جديد" } as never);

    expect(prisma.groupMember.deleteMany).not.toHaveBeenCalled();
    expect(prisma.groupMember.createMany).not.toHaveBeenCalled();
  });

  it("deletes a group and audits its name", async () => {
    const { service, prisma, audit } = buildService();

    await expect(service.remove(PRINCIPAL, "group-1")).resolves.toEqual({ id: "group-1", deleted: true });

    expect(prisma.group.delete).toHaveBeenCalledWith({ where: { id: "group-1" } });
    expect(audit.record).toHaveBeenCalledWith(
      expect.objectContaining({ action: "group.delete", detail: { name: "لجنة العقود" } }),
    );
  });
});
