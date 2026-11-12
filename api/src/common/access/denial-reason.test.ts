import { describe, expect, it } from "vitest";
import { denialReason } from "./denial-reason";

describe("denialReason", () => {
  it("maps the scope, permission and provisioning refusals", () => {
    expect(denialReason(new Error("Out of department scope"))).toBe("out_of_scope");
    expect(denialReason(new Error("Missing permission: EXPORT"))).toBe("missing_download_permission");
    expect(denialReason(new Error("Missing permission: VIEW"))).toBe("missing_view_permission");
    expect(denialReason(new Error("Missing permission: document.delete"))).toBe("missing_permission");
    expect(denialReason(new Error("Account is not provisioned"))).toBe("account_not_provisioned");
    expect(denialReason(new Error("User is not assigned to a department"))).toBe("account_without_department");
    expect(denialReason(new Error("File not found"))).toBe("not_found");
  });

  it("falls back to a generic reason for an unknown error", () => {
    expect(denialReason(new Error("Something else broke"))).toBe("not_allowed");
  });

  it("does not treat a thrown value that is not an error as a message", () => {
    expect(denialReason("Out of department scope")).toBe("not_allowed");
  });
});
