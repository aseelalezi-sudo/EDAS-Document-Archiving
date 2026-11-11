import type { AclAction, ProfileDto } from "@edas/shared";
import { describe, expect, it } from "vitest";
import { aclActionFor, initialsFromName, permsFromAclActions, profileToAppUser, roleFromApi, roleToApi } from "./role-bridge";

const profile: ProfileDto = {
  id: "u-1",
  username: "ahmad",
  name: "أحمد البلوي",
  nameEn: "Ahmad Al-Balawi",
  email: "ahmad@edas.test",
  role: "DEPT_MANAGER",
  status: "ACTIVE",
  departmentId: "dept-1",
  sectionId: null,
  jobTitle: "مدير القسم",
  jobTitleEn: "Department manager",
  phone: "+966 550000001",
  isNew: false,
};

describe("roleFromApi", () => {
  it("maps every API role onto a UI role", () => {
    expect(roleFromApi("SYSTEM_ADMIN")).toBe("system_admin");
    expect(roleFromApi("DEPT_MANAGER")).toBe("dept_manager");
    expect(roleFromApi("ARCHIVIST")).toBe("archivist");
    expect(roleFromApi("AUDITOR")).toBe("auditor");
    expect(roleFromApi("SUPERVISOR")).toBe("supervisor");
    expect(roleFromApi("EMPLOYEE")).toBe("employee");
  });

  it("maps the supervisor back onto its API role", () => {
    expect(roleToApi("supervisor")).toBe("SUPERVISOR");
    expect(roleFromApi(roleToApi("supervisor"))).toBe("supervisor");
  });
});

describe("permission bridge", () => {
  it("maps UI actions onto ACL actions", () => {
    expect(aclActionFor("view")).toBe("VIEW");
    expect(aclActionFor("edit")).toBe("EDIT");
    expect(aclActionFor("delete")).toBe("DELETE");
    expect(aclActionFor("download")).toBe("EXPORT");
  });

  it("round-trips ACL actions and drops non-UI actions", () => {
    const actions: AclAction[] = ["VIEW", "CREATE", "EDIT", "APPROVE", "EXPORT", "VIEW"];
    expect(permsFromAclActions(actions)).toEqual(["view", "edit", "download"]);
    expect(permsFromAclActions([])).toEqual([]);
  });
});

describe("profileToAppUser", () => {
  it("copies identity fields and defaults missing optional ones", () => {
    const user = profileToAppUser(profile);
    expect(user).toMatchObject({
      id: "u-1",
      name: "أحمد البلوي",
      nameEn: "Ahmad Al-Balawi",
      username: "ahmad",
      email: "ahmad@edas.test",
      department: "dept-1",
      section: "",
      jobTitle: "مدير القسم",
      role: "dept_manager",
    });
    expect(user.initials).toBe("أا");
    expect(user.color).toMatch(/^bg-/);
  });

  it("falls back to the Arabic name when no English name exists", () => {
    const user = profileToAppUser({ ...profile, nameEn: null, jobTitle: null, jobTitleEn: null });
    expect(user.nameEn).toBe(profile.name);
    expect(user.jobTitle).toBe("");
    expect(user.jobTitleEn).toBe("");
  });

  it("falls back to the Arabic job title when no English title exists", () => {
    const user = profileToAppUser({ ...profile, jobTitleEn: null });
    expect(user.jobTitleEn).toBe(profile.jobTitle);
  });

  it("derives stable avatar colors from the user id", () => {
    expect(profileToAppUser(profile).color).toBe(profileToAppUser(profile).color);
  });
});

describe("initialsFromName", () => {
  it("uses the first letters of the first two words", () => {
    expect(initialsFromName("Ahmad Al Balawi")).toBe("AA");
    expect(initialsFromName("  سارة   محمد  ")).toBe("سم");
  });

  it("uses the first two characters for a single word", () => {
    expect(initialsFromName("Admin")).toBe("Ad");
  });

  it("returns a placeholder for empty input", () => {
    expect(initialsFromName("   ")).toBe("؟");
  });
});
