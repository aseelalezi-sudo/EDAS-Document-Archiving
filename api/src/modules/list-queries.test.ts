import "reflect-metadata";
import { ApprovalStatus, Classification, DocumentStatus, HoldStatus } from "@prisma/client";
import { plainToInstance } from "class-transformer";
import { validate } from "class-validator";
import { describe, expect, it } from "vitest";
import { ListApprovalsQuery } from "./approvals/dto/list-approvals.query";
import { ListAuditQuery } from "./audit/dto/list-audit.query";
import { ListDocumentsQuery } from "./documents/dto/list-documents.query";
import { ListLegalHoldsQuery } from "./legal-holds/dto/list-legal-holds.query";
import { ListEmployeesQuery } from "./org/dto/org.dto";
import { ListNotificationsQuery } from "./notifications/dto/list-notifications.query";
import { ListReportRunsQuery } from "./reports/dto/list-report-runs.query";
import { ListRetentionQuery } from "./retention/dto/list-retention.query";
import { ListTasksQuery } from "./tasks/dto/list-tasks.query";
import { ListUsersQuery } from "./users/dto/list-users.query";

type QueryDto = new () => { page?: number; pageSize?: number };
type QueryCase = [name: string, dto: QueryDto, defaultPageSize: number, maxPageSize: number];

const CASES: QueryCase[] = [
  ["approvals", ListApprovalsQuery, 25, 200],
  ["audit", ListAuditQuery, 50, 200],
  ["documents", ListDocumentsQuery, 25, 100],
  ["legal-holds", ListLegalHoldsQuery, 25, 200],
  ["notifications", ListNotificationsQuery, 25, 200],
  ["org employees", ListEmployeesQuery, 50, 200],
  ["report-runs", ListReportRunsQuery, 25, 200],
  ["retention", ListRetentionQuery, 25, 200],
  ["tasks", ListTasksQuery, 25, 200],
  ["users", ListUsersQuery, 25, 100],
];

async function errorsOf(dto: QueryDto, input: Record<string, unknown>) {
  const instance = plainToInstance(dto, input);
  const errors = await validate(instance, { whitelist: true, forbidNonWhitelisted: true });
  return { instance, properties: errors.map((error) => error.property) };
}

describe.each(CASES)("%s list query", (_name, dto, defaultPageSize, maxPageSize) => {
  it("starts on the first page with the module default size", async () => {
    const { instance, properties } = await errorsOf(dto, {});

    expect(properties).toEqual([]);
    expect(instance.page).toBe(1);
    expect(instance.pageSize).toBe(defaultPageSize);
  });

  it("accepts a string page and pageSize from the query string", async () => {
    const { instance, properties } = await errorsOf(dto, { page: "3", pageSize: "10" });

    expect(properties).toEqual([]);
    expect(instance.page).toBe(3);
    expect(instance.pageSize).toBe(10);
  });

  it(`refuses a page below one and a size above ${maxPageSize}`, async () => {
    await expect(errorsOf(dto, { page: "0" })).resolves.toMatchObject({ properties: ["page"] });
    await expect(errorsOf(dto, { page: "-2" })).resolves.toMatchObject({ properties: ["page"] });
    await expect(errorsOf(dto, { pageSize: "0" })).resolves.toMatchObject({ properties: ["pageSize"] });
    await expect(errorsOf(dto, { pageSize: `${maxPageSize + 1}` })).resolves.toMatchObject({ properties: ["pageSize"] });
    await expect(errorsOf(dto, { pageSize: `${maxPageSize}` })).resolves.toMatchObject({ properties: [] });
  });

  it("refuses a fractional page", async () => {
    await expect(errorsOf(dto, { page: "2.5" })).resolves.toMatchObject({ properties: ["page"] });
  });
});

describe("list query filters", () => {
  it("accepts the documented enum values and refuses unknown ones", async () => {
    const documents = (input: Record<string, unknown>) => errorsOf(ListDocumentsQuery, input);

    await expect(documents({ status: DocumentStatus.PUBLISHED, classification: Classification.INTERNAL })).resolves.toMatchObject({
      properties: [],
    });
    await expect(documents({ status: "DELETED" })).resolves.toMatchObject({ properties: ["status"] });
    await expect(documents({ classification: "TOP_SECRET" })).resolves.toMatchObject({ properties: ["classification"] });
    await expect(documents({ order: "sideways" })).resolves.toMatchObject({ properties: ["order"] });

    await expect(errorsOf(ListApprovalsQuery, { status: ApprovalStatus.PENDING })).resolves.toMatchObject({ properties: [] });
    await expect(errorsOf(ListApprovalsQuery, { status: "DONE" })).resolves.toMatchObject({ properties: ["status"] });

    await expect(errorsOf(ListLegalHoldsQuery, { status: HoldStatus.ACTIVE })).resolves.toMatchObject({ properties: [] });
    await expect(errorsOf(ListLegalHoldsQuery, { status: "CLOSED" })).resolves.toMatchObject({ properties: ["status"] });

    await expect(errorsOf(ListAuditQuery, { result: "success" })).resolves.toMatchObject({ properties: [] });
    await expect(errorsOf(ListAuditQuery, { result: "maybe" })).resolves.toMatchObject({ properties: ["result"] });

    await expect(errorsOf(ListTasksQuery, { status: "open" })).resolves.toMatchObject({ properties: [] });
    await expect(errorsOf(ListTasksQuery, { status: "lost" })).resolves.toMatchObject({ properties: ["status"] });
  });

  it("rejects identifiers that are not uuids", async () => {
    await expect(errorsOf(ListDocumentsQuery, { folderId: "folder-1" })).resolves.toMatchObject({ properties: ["folderId"] });
    await expect(errorsOf(ListDocumentsQuery, { folderId: "3f2504e0-4f89-11d3-9a0c-0305e82c3301" })).resolves.toMatchObject({
      properties: [],
    });
    await expect(errorsOf(ListApprovalsQuery, { documentId: "doc-1" })).resolves.toMatchObject({ properties: ["documentId"] });
    await expect(errorsOf(ListLegalHoldsQuery, { page: "1", status: "ACTIVE" })).resolves.toMatchObject({ properties: [] });
    await expect(errorsOf(ListTasksQuery, { assigneeId: "user-1" })).resolves.toMatchObject({ properties: ["assigneeId"] });
    await expect(errorsOf(ListRetentionQuery, { departmentId: "dept-1" })).resolves.toMatchObject({
      properties: ["departmentId"],
    });
  });

  it("turns the unread and due flags into real booleans", async () => {
    const unread = plainToInstance(ListNotificationsQuery, { unreadOnly: "true" });
    const all = plainToInstance(ListNotificationsQuery, { unreadOnly: "false" });

    expect(unread.unreadOnly).toBe(true);
    expect(all.unreadOnly).toBe(false);
    await expect(validate(unread)).resolves.toEqual([]);

    const due = plainToInstance(ListRetentionQuery, { dueOnly: "true" });
    const later = plainToInstance(ListRetentionQuery, { dueOnly: "false" });

    expect(due.dueOnly).toBe(true);
    expect(later.dueOnly).toBe(false);
    await expect(validate(due)).resolves.toEqual([]);
  });

  it("rejects a malformed timestamp on the audit window", async () => {
    await expect(errorsOf(ListAuditQuery, { from: "01/01/2026" })).resolves.toMatchObject({ properties: ["from"] });
    await expect(errorsOf(ListAuditQuery, { from: "2026-01-01T00:00:00.000Z" })).resolves.toMatchObject({ properties: [] });
    await expect(errorsOf(ListAuditQuery, { to: "yesterday" })).resolves.toMatchObject({ properties: ["to"] });
    await expect(errorsOf(ListAuditQuery, { to: "2026-01-31T23:59:59.000Z" })).resolves.toMatchObject({ properties: [] });
  });

  it("keeps free-text filters on their string decorators", async () => {
    await expect(errorsOf(ListDocumentsQuery, { q: "عقد", tag: "2026", category: "عقود" })).resolves.toMatchObject({
      properties: [],
    });
    await expect(errorsOf(ListUsersQuery, { q: "أمل", departmentId: "dept-1" })).resolves.toMatchObject({ properties: [] });
    await expect(errorsOf(ListReportRunsQuery, { reportType: "documents", status: "done" })).resolves.toMatchObject({
      properties: [],
    });
  });

  it("refuses an undeclared query parameter instead of dropping it silently", async () => {
    await expect(errorsOf(ListUsersQuery, { role: "SYSTEM_ADMIN" })).resolves.toMatchObject({ properties: ["role"] });
    await expect(errorsOf(ListAuditQuery, { actor: "user-1" })).resolves.toMatchObject({ properties: ["actor"] });
  });
});
