import { ConflictException, ServiceUnavailableException } from "@nestjs/common";
import type { ConfigService } from "@nestjs/config";
import { afterEach, describe, expect, it, vi } from "vitest";
import { KeycloakAdminService } from "./keycloak-admin.service";

const ISSUER = "https://kc.example/realms/edas";
const TOKEN_URL = "POST /realms/master/protocol/openid-connect/token";

function makeConfig(values: Record<string, string> = {}) {
  const all: Record<string, string> = {
    KEYCLOAK_ISSUER: ISSUER,
    KEYCLOAK_ADMIN: "admin",
    KEYCLOAK_ADMIN_PASSWORD: "secret",
    ...values,
  };
  return {
    getOrThrow: (key: string) => {
      if (!all[key]) throw new Error(`missing ${key}`);
      return all[key];
    },
    get: (key: string, fallback?: string) => all[key] ?? fallback,
  } as unknown as ConfigService;
}

function reply(
  options: {
    status?: number;
    location?: string | null;
    json?: unknown;
    text?: string;
    textFails?: boolean;
  } = {},
) {
  const status = options.status ?? 200;
  return {
    ok: status < 400,
    status,
    headers: { get: (name: string) => (name.toLowerCase() === "location" ? (options.location ?? null) : null) },
    json: async () => options.json,
    text: async () => {
      if (options.textFails) throw new Error("stream closed");
      return options.text ?? "";
    },
  };
}

type Handler = () => unknown;

function stubFetch(routes: Record<string, Handler>) {
  const fetchMock = vi.fn(async (url: string, init: RequestInit = {}) => {
    const parsed = new URL(url);
    const key = `${init.method ?? "GET"} ${parsed.pathname}${parsed.search}`;
    const handler = routes[key];
    if (!handler) throw new Error(`unexpected request: ${key}`);
    return handler();
  });
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

function tokenRoute(token = "token-1", expiresIn = 300): Handler {
  return () => reply({ json: { access_token: token, expires_in: expiresIn } });
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("KeycloakAdminService configuration", () => {
  it("rejects an issuer that is not a realm URL", () => {
    expect(() => new KeycloakAdminService(makeConfig({ KEYCLOAK_ISSUER: "https://kc.example" }))).toThrow(/Unsupported KEYCLOAK_ISSUER/);
  });

  it("derives the admin base URL from the issuer and honours an override", async () => {
    const fromIssuer = stubFetch({ [TOKEN_URL]: tokenRoute() });
    await new KeycloakAdminService(makeConfig()).logoutUser("kc-1").catch(() => undefined);
    expect(String(fromIssuer.mock.calls[0][0] as string)).toBe("https://kc.example/realms/master/protocol/openid-connect/token");

    const override = stubFetch({ [TOKEN_URL]: tokenRoute() });
    await new KeycloakAdminService(makeConfig({ KEYCLOAK_ADMIN_BASE_URL: "http://keycloak:8080/" }))
      .logoutUser("kc-1")
      .catch(() => undefined);
    expect(String(override.mock.calls[0][0] as string)).toBe("http://keycloak:8080/realms/master/protocol/openid-connect/token");
  });
});

describe("KeycloakAdminService user creation", () => {
  function creationRoutes(overrides: Record<string, Handler> = {}) {
    return {
      [TOKEN_URL]: tokenRoute(),
      "POST /admin/realms/edas/users": () => reply({ status: 201, location: "https://kc.example/admin/realms/edas/users/kc-1" }),
      "GET /admin/realms/edas/roles/employee": () => reply({ json: { id: "role-employee", name: "employee" } }),
      "GET /admin/realms/edas/users/kc-1/role-mappings/realm": () =>
        reply({
          json: [
            { id: "role-employee", name: "employee" },
            { id: "role-offline", name: "offline_access" },
          ],
        }),
      "GET /admin/realms/edas/roles": () =>
        reply({
          json: [
            { id: "role-employee", name: "employee" },
            { id: "role-offline", name: "offline_access" },
          ],
        }),
      "DELETE /admin/realms/edas/users/kc-1/role-mappings/realm": () => reply({ status: 204 }),
      "POST /admin/realms/edas/users/kc-1/role-mappings/realm": () => reply({ status: 204 }),
      ...overrides,
    };
  }

  it("creates the account, reads the id from Location and swaps only the application roles", async () => {
    const fetchMock = stubFetch(creationRoutes());
    const service = new KeycloakAdminService(makeConfig());

    const id = await service.createUser({
      username: "ahmad",
      email: "ahmad@edas.local",
      firstName: "أحمد",
      lastName: "علي",
      password: "Password123",
      role: "EMPLOYEE",
    });

    expect(id).toBe("kc-1");
    const createCall = fetchMock.mock.calls.find(([url]) => String(url).endsWith("/users"));
    expect(createCall?.[1]).toMatchObject({ method: "POST" });
    expect(JSON.parse(String(createCall?.[1]?.body))).toEqual({
      username: "ahmad",
      email: "ahmad@edas.local",
      firstName: "أحمد",
      lastName: "علي",
      enabled: true,
      emailVerified: true,
      credentials: [{ type: "password", value: "Password123", temporary: false }],
    });
    expect((createCall?.[1]?.headers as Record<string, string>).Authorization).toBe("Bearer token-1");

    const removeCall = fetchMock.mock.calls.find(([, init]) => init?.method === "DELETE");
    expect(JSON.parse(String(removeCall?.[1]?.body))).toEqual([{ id: "role-employee", name: "employee" }]);
    const addCall = fetchMock.mock.calls.filter(([, init]) => init?.method === "POST").at(-1);
    expect(JSON.parse(String(addCall?.[1]?.body))).toEqual([{ id: "role-employee", name: "employee" }]);
  });

  it("looks the created account up by username when Keycloak omits Location", async () => {
    const fetchMock = stubFetch(
      creationRoutes({
        "POST /admin/realms/edas/users": () => reply({ status: 201 }),
        "GET /admin/realms/edas/users?username=ahmad&exact=true": () => reply({ json: [{ id: "kc-2" }] }),
        "GET /admin/realms/edas/roles/employee": () => reply({ status: 404 }),
        "GET /admin/realms/edas/users/kc-2/role-mappings/realm": () => reply({ json: [] }),
      }),
    );

    const id = await new KeycloakAdminService(makeConfig()).createUser({
      username: "ahmad",
      email: "ahmad@edas.local",
      firstName: "أحمد",
      lastName: "علي",
      password: "Password123",
      role: "EMPLOYEE",
    });

    expect(id).toBe("kc-2");
    expect(fetchMock.mock.calls.some(([url]) => String(url).includes("username=ahmad&exact=true"))).toBe(true);
    expect(fetchMock.mock.calls.some(([, init]) => init?.method === "POST" && String(init.body).includes("role-employee"))).toBe(false);
  });

  it("fails when neither Location nor the username lookup yields an id", async () => {
    stubFetch(
      creationRoutes({
        "POST /admin/realms/edas/users": () => reply({ status: 201 }),
        "GET /admin/realms/edas/users?username=ahmad&exact=true": () => reply({ json: [] }),
      }),
    );

    await expect(
      new KeycloakAdminService(makeConfig()).createUser({
        username: "ahmad",
        email: "ahmad@edas.local",
        firstName: "أحمد",
        lastName: "علي",
        password: "Password123",
        role: "EMPLOYEE",
      }),
    ).rejects.toBeInstanceOf(ServiceUnavailableException);
  });

  it("leaves non-application role mappings untouched", async () => {
    const fetchMock = stubFetch(
      creationRoutes({
        "GET /admin/realms/edas/users/kc-1/role-mappings/realm": () => reply({ json: [{ id: "role-offline", name: "offline_access" }] }),
        "GET /admin/realms/edas/roles/employee": () => reply({ status: 404 }),
      }),
    );

    await new KeycloakAdminService(makeConfig()).setRole("kc-1", "EMPLOYEE");

    const mappings = fetchMock.mock.calls.filter(([url]) => String(url).includes("/role-mappings/realm"));
    expect(mappings.some(([, init]) => init?.method === "DELETE")).toBe(false);
    expect(mappings.some(([, init]) => init?.method === "POST")).toBe(false);
  });
});

describe("KeycloakAdminService user operations", () => {
  it("updates the profile with the supplied fields", async () => {
    const fetchMock = stubFetch({
      [TOKEN_URL]: tokenRoute(),
      "PUT /admin/realms/edas/users/kc-1": () => reply({ status: 204 }),
    });

    await new KeycloakAdminService(makeConfig()).updateUser("kc-1", {
      username: "ahmad",
      email: "new@edas.local",
      firstName: "أحمد",
      lastName: "محمد",
      enabled: true,
      requiredActions: ["UPDATE_PASSWORD"],
    });

    const call = fetchMock.mock.calls.at(-1);
    expect(call?.[1]).toMatchObject({ method: "PUT" });
    expect(JSON.parse(String(call?.[1]?.body))).toEqual({
      username: "ahmad",
      email: "new@edas.local",
      firstName: "أحمد",
      lastName: "محمد",
      enabled: true,
      requiredActions: ["UPDATE_PASSWORD"],
    });
  });

  it("treats a missing account as already deleted and surfaces other delete failures", async () => {
    stubFetch({
      [TOKEN_URL]: tokenRoute(),
      "DELETE /admin/realms/edas/users/kc-1": () => reply({ status: 404 }),
    });
    await expect(new KeycloakAdminService(makeConfig()).deleteUser("kc-1")).resolves.toBeUndefined();

    stubFetch({
      [TOKEN_URL]: tokenRoute(),
      "DELETE /admin/realms/edas/users/kc-2": () => reply({ status: 503 }),
    });
    await expect(new KeycloakAdminService(makeConfig()).deleteUser("kc-2")).rejects.toBeInstanceOf(ServiceUnavailableException);
  });

  it("resets the password without a temporary flag", async () => {
    const fetchMock = stubFetch({
      [TOKEN_URL]: tokenRoute(),
      "PUT /admin/realms/edas/users/kc-1/reset-password": () => reply({ status: 204 }),
    });

    await new KeycloakAdminService(makeConfig()).resetPassword("kc-1", "NewPass123");

    expect(JSON.parse(String(fetchMock.mock.calls.at(-1)?.[1]?.body))).toEqual({
      type: "password",
      value: "NewPass123",
      temporary: false,
    });
  });

  it("logs the user out and tolerates an unknown account", async () => {
    stubFetch({
      [TOKEN_URL]: tokenRoute(),
      "POST /admin/realms/edas/users/kc-1/logout": () => reply({ status: 204 }),
      "POST /admin/realms/edas/users/kc-2/logout": () => reply({ status: 404 }),
    });
    const service = new KeycloakAdminService(makeConfig());

    await expect(service.logoutUser("kc-1")).resolves.toBeUndefined();
    await expect(service.logoutUser("kc-2")).resolves.toBeUndefined();
  });

  it("returns an empty session list for an unknown account and the payload otherwise", async () => {
    stubFetch({
      [TOKEN_URL]: tokenRoute(),
      "GET /admin/realms/edas/users/kc-1/sessions": () => reply({ status: 404 }),
      "GET /admin/realms/edas/users/kc-2/sessions": () =>
        reply({ json: [{ id: "s1", ipAddress: "10.0.0.1", start: 1, lastAccess: 2, clients: { edas: "edas" } }] }),
    });
    const service = new KeycloakAdminService(makeConfig());

    await expect(service.listSessions("kc-1")).resolves.toEqual([]);
    await expect(service.listSessions("kc-2")).resolves.toEqual([
      { id: "s1", ipAddress: "10.0.0.1", start: 1, lastAccess: 2, clients: { edas: "edas" } },
    ]);
  });
});

describe("KeycloakAdminService failures and token reuse", () => {
  it("maps a conflict to ConflictException with the provider detail", async () => {
    stubFetch({
      [TOKEN_URL]: tokenRoute(),
      "POST /admin/realms/edas/users": () => reply({ status: 409, text: "User exists with same username" }),
    });

    await expect(
      new KeycloakAdminService(makeConfig()).createUser({
        username: "ahmad",
        email: "ahmad@edas.local",
        firstName: "أحمد",
        lastName: "علي",
        password: "Password123",
        role: "EMPLOYEE",
      }),
    ).rejects.toThrow(new ConflictException("User exists with same username"));
  });

  it("describes a conflict that carried no provider detail", async () => {
    stubFetch({
      [TOKEN_URL]: tokenRoute(),
      "POST /admin/realms/edas/users": () => reply({ status: 409 }),
    });

    await expect(
      new KeycloakAdminService(makeConfig()).createUser({
        username: "ahmad",
        email: "ahmad@edas.local",
        firstName: "أحمد",
        lastName: "علي",
        password: "Password123",
        role: "EMPLOYEE",
      }),
    ).rejects.toThrow(new ConflictException("Keycloak rejected the change as conflicting"));
  });

  it("maps other failures to ServiceUnavailable and survives an unreadable error body", async () => {
    stubFetch({
      [TOKEN_URL]: tokenRoute(),
      "POST /admin/realms/edas/users": () => reply({ status: 502, textFails: true }),
    });

    await expect(
      new KeycloakAdminService(makeConfig()).createUser({
        username: "ahmad",
        email: "ahmad@edas.local",
        firstName: "أحمد",
        lastName: "علي",
        password: "Password123",
        role: "EMPLOYEE",
      }),
    ).rejects.toBeInstanceOf(ServiceUnavailableException);
  });

  it("fails when the admin login is refused", async () => {
    stubFetch({ [TOKEN_URL]: () => reply({ status: 401 }) });

    await expect(new KeycloakAdminService(makeConfig()).logoutUser("kc-1")).rejects.toBeInstanceOf(ServiceUnavailableException);
  });

  it("reuses a cached token until it is about to expire", async () => {
    const fetchMock = stubFetch({
      [TOKEN_URL]: tokenRoute("token-1", 300),
      "POST /admin/realms/edas/users/kc-1/logout": () => reply({ status: 204 }),
    });
    const service = new KeycloakAdminService(makeConfig());

    await service.logoutUser("kc-1");
    await service.logoutUser("kc-1");

    expect(fetchMock.mock.calls.filter(([url]) => String(url).includes("/protocol/openid-connect/token"))).toHaveLength(1);
  });

  it("refreshes a token that would expire inside the safety window", async () => {
    const fetchMock = stubFetch({
      [TOKEN_URL]: tokenRoute("short-lived", 4),
      "POST /admin/realms/edas/users/kc-1/logout": () => reply({ status: 204 }),
    });
    const service = new KeycloakAdminService(makeConfig());

    await service.logoutUser("kc-1");
    await service.logoutUser("kc-1");

    expect(fetchMock.mock.calls.filter(([url]) => String(url).includes("/protocol/openid-connect/token"))).toHaveLength(2);
  });
});
