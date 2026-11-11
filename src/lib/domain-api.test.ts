import { afterEach, describe, expect, it, vi } from "vitest";
import { domainApi } from "./domain-api";

type Step = { call: () => Promise<unknown>; method?: string; url: string };

function fetchSpy() {
  const fetchMock = vi.fn(async (_url: string, _init?: RequestInit) => ({
    ok: true,
    status: 200,
    statusText: "OK",
    text: async () => JSON.stringify({ data: {} }),
  }));
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

function callOf(fetchMock: ReturnType<typeof fetchSpy>, index: number) {
  const [url, init] = fetchMock.mock.calls[index] as [string, RequestInit];
  return { url, method: init.method ?? "GET", body: init.body as string | undefined };
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("domainApi endpoint contract", () => {
  it("maps every read to its documented path", async () => {
    const steps: Step[] = [
      { call: () => domainApi.me(), url: "/api/v1/auth/me" },
      { call: () => domainApi.reportSummary(), url: "/api/v1/reports/summary" },
      { call: () => domainApi.approvals(), url: "/api/v1/approvals?pageSize=100" },
      { call: () => domainApi.pendingApprovals(), url: "/api/v1/approvals/pending" },
      { call: () => domainApi.approvalChains(), url: "/api/v1/approval-chains" },
      { call: () => domainApi.retentionPolicies(), url: "/api/v1/retention/policies" },
      { call: () => domainApi.retentionItems(), url: "/api/v1/retention/items" },
      { call: () => domainApi.retentionItems({ dueOnly: true }), url: "/api/v1/retention/items?dueOnly=true" },
      { call: () => domainApi.retentionCertificate("item-1"), url: "/api/v1/retention/items/item-1/certificate" },
      { call: () => domainApi.holds(), url: "/api/v1/legal-holds?pageSize=100" },
      { call: () => domainApi.tasks(), url: "/api/v1/tasks?pageSize=100" },
      { call: () => domainApi.taskComments("t1"), url: "/api/v1/tasks/t1/comments" },
      { call: () => domainApi.users(), url: "/api/v1/users?pageSize=100" },
      { call: () => domainApi.settings(), url: "/api/v1/settings" },
      { call: () => domainApi.health(), url: "/api/v1/health/ready" },
      { call: () => domainApi.reportSchedules(), url: "/api/v1/reports/schedules" },
      { call: () => domainApi.reportRuns(), url: "/api/v1/reports/runs?pageSize=100" },
      { call: () => domainApi.downloadReportRun("run-1"), url: "/api/v1/reports/runs/run-1/download" },
      { call: () => domainApi.notifications(), url: "/api/v1/notifications?pageSize=50" },
      { call: () => domainApi.notifications({ unreadOnly: true }), url: "/api/v1/notifications?pageSize=50&unreadOnly=true" },
      { call: () => domainApi.auditEvents(), url: "/api/v1/audit?pageSize=100" },
      { call: () => domainApi.auditEvents({ action: "document.read" }), url: "/api/v1/audit?pageSize=100&action=document.read" },
      { call: () => domainApi.verifyAuditChain(), url: "/api/v1/audit/verify" },
      { call: () => domainApi.storageIntegrity(), url: "/api/v1/files/integrity" },
      { call: () => domainApi.savedSearches(), url: "/api/v1/saved-searches" },
      { call: () => domainApi.orgTree(), url: "/api/v1/org/tree" },
      { call: () => domainApi.orgProjects(), url: "/api/v1/org/projects" },
      { call: () => domainApi.orgEmployees(), url: "/api/v1/org/employees" },
      { call: () => domainApi.orgEmployees({ page: 2 }), url: "/api/v1/org/employees?page=2" },
      { call: () => domainApi.reportTemplates(), url: "/api/v1/report-templates" },
      { call: () => domainApi.notificationTemplates(), url: "/api/v1/notification-templates" },
      { call: () => domainApi.rolePolicies(), url: "/api/v1/roles" },
      { call: () => domainApi.groups(), url: "/api/v1/groups" },
      { call: () => domainApi.myPreferences(), url: "/api/v1/users/me/preferences" },
      { call: () => domainApi.userSessions("u1"), url: "/api/v1/users/u1/sessions" },
      { call: () => domainApi.departmentDefaults("dept-1"), url: "/api/v1/org/departments/dept-1/defaults" },
    ];

    const fetchMock = fetchSpy();
    for (const step of steps) await step.call();

    expect(fetchMock.mock.calls.map((_call, index) => callOf(fetchMock, index).url)).toEqual(steps.map((step) => step.url));
  });

  it("maps every write to its method and path", async () => {
    const steps: Step[] = [
      { call: () => domainApi.submitApproval({ documentId: "d1" }), method: "POST", url: "/api/v1/approvals" },
      { call: () => domainApi.decideApproval("ap-1", { decision: "APPROVED" }), method: "POST", url: "/api/v1/approvals/ap-1/decide" },
      {
        call: () => domainApi.createApprovalChain({ name: "c", steps: [{ role: "SUPERVISOR" }] as never }),
        method: "POST",
        url: "/api/v1/approval-chains",
      },
      { call: () => domainApi.updateApprovalChain("c1", { isActive: false }), method: "PATCH", url: "/api/v1/approval-chains/c1" },
      { call: () => domainApi.createRetentionPolicy({} as never), method: "POST", url: "/api/v1/retention/policies" },
      { call: () => domainApi.updateRetentionPolicy("p1", {}), method: "PATCH", url: "/api/v1/retention/policies/p1" },
      { call: () => domainApi.deleteRetentionPolicy("p1"), method: "DELETE", url: "/api/v1/retention/policies/p1" },
      { call: () => domainApi.scheduleRetention("d1", "p1"), method: "POST", url: "/api/v1/retention/items" },
      { call: () => domainApi.extendRetention("item-1", "2027-01-01"), method: "PATCH", url: "/api/v1/retention/items/item-1" },
      { call: () => domainApi.executeRetention("item-1"), method: "POST", url: "/api/v1/retention/items/item-1/execute" },
      { call: () => domainApi.executeRetention("item-1", "DESTROY"), method: "POST", url: "/api/v1/retention/items/item-1/execute" },
      { call: () => domainApi.createHold({ caseNo: "C1", reason: "r" }), method: "POST", url: "/api/v1/legal-holds" },
      { call: () => domainApi.releaseHold("h1"), method: "POST", url: "/api/v1/legal-holds/h1/release" },
      { call: () => domainApi.addTaskComment("t1", "ملاحظة"), method: "POST", url: "/api/v1/tasks/t1/comments" },
      { call: () => domainApi.completeTask("t1"), method: "POST", url: "/api/v1/tasks/t1/complete" },
      { call: () => domainApi.updateTask("t1", { status: "DONE" }), method: "PATCH", url: "/api/v1/tasks/t1" },
      { call: () => domainApi.putSetting("ui.theme", "dark"), method: "PUT", url: "/api/v1/settings/ui.theme" },
      { call: () => domainApi.createReportSchedule({} as never), method: "POST", url: "/api/v1/reports/schedules" },
      { call: () => domainApi.updateReportSchedule("s1", { isActive: true }), method: "PATCH", url: "/api/v1/reports/schedules/s1" },
      { call: () => domainApi.deleteReportSchedule("s1"), method: "DELETE", url: "/api/v1/reports/schedules/s1" },
      { call: () => domainApi.createReportRun({ reportType: "usage" }), method: "POST", url: "/api/v1/reports/runs" },
      { call: () => domainApi.runReportSchedule("s1"), method: "POST", url: "/api/v1/reports/schedules/s1/run" },
      { call: () => domainApi.markNotificationRead("n1"), method: "POST", url: "/api/v1/notifications/n1/read" },
      { call: () => domainApi.markAllNotificationsRead(), method: "POST", url: "/api/v1/notifications/read-all" },
      { call: () => domainApi.recordAuditChainBaseline(), method: "POST", url: "/api/v1/audit/verify/baseline" },
      { call: () => domainApi.purgeUnreferencedFiles({ confirm: true }), method: "POST", url: "/api/v1/files/integrity/purge" },
      { call: () => domainApi.verifyFile("f1"), method: "POST", url: "/api/v1/files/f1/verify" },
      { call: () => domainApi.createSavedSearch({ name: "s", query: {} }), method: "POST", url: "/api/v1/saved-searches" },
      { call: () => domainApi.updateSavedSearch("s1", { name: "x" }), method: "PATCH", url: "/api/v1/saved-searches/s1" },
      { call: () => domainApi.deleteSavedSearch("s1"), method: "DELETE", url: "/api/v1/saved-searches/s1" },
      { call: () => domainApi.setReportTemplateFavorite("t1", true), method: "PATCH", url: "/api/v1/report-templates/t1/favorite" },
      { call: () => domainApi.createNotificationTemplate({ name: "n" } as never), method: "POST", url: "/api/v1/notification-templates" },
      {
        call: () => domainApi.updateNotificationTemplate("n1", { subject: "s" }),
        method: "PATCH",
        url: "/api/v1/notification-templates/n1",
      },
      { call: () => domainApi.deleteNotificationTemplate("n1"), method: "DELETE", url: "/api/v1/notification-templates/n1" },
      { call: () => domainApi.resetNotificationTemplate("n1"), method: "POST", url: "/api/v1/notification-templates/n1/reset" },
      { call: () => domainApi.updateRolePolicy("ARCHIVIST", []), method: "PATCH", url: "/api/v1/roles/ARCHIVIST" },
      { call: () => domainApi.resetRolePolicy("ARCHIVIST"), method: "DELETE", url: "/api/v1/roles/ARCHIVIST" },
      { call: () => domainApi.createGroup({ name: "g" }), method: "POST", url: "/api/v1/groups" },
      { call: () => domainApi.updateGroup("g1", { name: "x" }), method: "PATCH", url: "/api/v1/groups/g1" },
      { call: () => domainApi.deleteGroup("g1"), method: "DELETE", url: "/api/v1/groups/g1" },
      { call: () => domainApi.createUser({} as never), method: "POST", url: "/api/v1/users" },
      { call: () => domainApi.updateUser("u1", { name: "x" }), method: "PATCH", url: "/api/v1/users/u1" },
      { call: () => domainApi.updateMyProfile({ name: "x" }), method: "PATCH", url: "/api/v1/users/me" },
      { call: () => domainApi.putMyPreference("ui.theme", "dark"), method: "PUT", url: "/api/v1/users/me/preferences/ui.theme" },
      { call: () => domainApi.deleteUser("u1"), method: "DELETE", url: "/api/v1/users/u1" },
      { call: () => domainApi.resetUserPassword("u1", "secret"), method: "POST", url: "/api/v1/users/u1/reset-password" },
      { call: () => domainApi.revokeUserSessions("u1"), method: "POST", url: "/api/v1/users/u1/revoke-sessions" },
      { call: () => domainApi.putDepartmentDefaults("dept-1", {}), method: "PUT", url: "/api/v1/org/departments/dept-1/defaults" },
      { call: () => domainApi.createDepartment({} as never), method: "POST", url: "/api/v1/org/departments" },
      { call: () => domainApi.updateDepartment("dept-1", {}), method: "PATCH", url: "/api/v1/org/departments/dept-1" },
      { call: () => domainApi.deleteDepartment("dept-1"), method: "DELETE", url: "/api/v1/org/departments/dept-1" },
      { call: () => domainApi.createSection({} as never), method: "POST", url: "/api/v1/org/sections" },
      { call: () => domainApi.updateSection("sec-1", {}), method: "PATCH", url: "/api/v1/org/sections/sec-1" },
      { call: () => domainApi.deleteSection("sec-1"), method: "DELETE", url: "/api/v1/org/sections/sec-1" },
      { call: () => domainApi.createProject({} as never), method: "POST", url: "/api/v1/org/projects" },
      { call: () => domainApi.updateProject("prj-1", {}), method: "PATCH", url: "/api/v1/org/projects/prj-1" },
      { call: () => domainApi.deleteProject("prj-1"), method: "DELETE", url: "/api/v1/org/projects/prj-1" },
      { call: () => domainApi.createEmployee({} as never), method: "POST", url: "/api/v1/org/employees" },
      { call: () => domainApi.updateEmployee("emp-1", {}), method: "PATCH", url: "/api/v1/org/employees/emp-1" },
      { call: () => domainApi.deleteEmployee("emp-1"), method: "DELETE", url: "/api/v1/org/employees/emp-1" },
    ];

    const fetchMock = fetchSpy();
    for (const step of steps) await step.call();

    expect(fetchMock.mock.calls.map((_call, index) => [callOf(fetchMock, index).method, callOf(fetchMock, index).url])).toEqual(
      steps.map((step) => [step.method ?? "GET", step.url]),
    );
  });

  it("encodes path segments and keeps request bodies intact", async () => {
    const fetchMock = fetchSpy();

    await domainApi.putSetting("ui theme/2026", { nested: true });
    await domainApi.verifyFile("f/1");
    await domainApi.executeRetention("item-1", "DESTROY");
    await domainApi.putMyPreference("ui.theme", "dark");
    await domainApi.addTaskComment("t1", "ملاحظة");

    expect(callOf(fetchMock, 0)).toMatchObject({
      url: "/api/v1/settings/ui%20theme%2F2026",
      body: JSON.stringify({ value: { nested: true } }),
    });
    expect(callOf(fetchMock, 1).url).toBe("/api/v1/files/f%2F1/verify");
    expect(callOf(fetchMock, 2).body).toBe(JSON.stringify({ action: "DESTROY" }));
    expect(callOf(fetchMock, 3).body).toBe(JSON.stringify({ value: "dark" }));
    expect(callOf(fetchMock, 4).body).toBe(JSON.stringify({ body: "ملاحظة" }));
  });
});
