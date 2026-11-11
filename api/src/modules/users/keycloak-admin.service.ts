import { ConflictException, Injectable, Logger, ServiceUnavailableException } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";

interface KeycloakUserInput {
  username: string;
  email: string;
  firstName: string;
  lastName: string;
  password: string;
  role: string;
}

interface KeycloakUserUpdate {
  username?: string;
  email?: string;
  firstName?: string;
  lastName?: string;
  enabled?: boolean;
  requiredActions?: string[];
}

interface RoleRepresentation {
  id: string;
  name: string;
}

interface KeycloakSessionRepresentation {
  id: string;
  ipAddress?: string;
  start?: number;
  lastAccess?: number;
  clients?: Record<string, string>;
}

@Injectable()
export class KeycloakAdminService {
  private readonly logger = new Logger(KeycloakAdminService.name);
  private readonly baseUrl: string;
  private readonly realm: string;
  private readonly adminUser: string;
  private readonly adminPassword: string;
  private tokenCache: { value: string; expiresAt: number } | null = null;

  constructor(config: ConfigService) {
    const issuer = config.getOrThrow<string>("KEYCLOAK_ISSUER").replace(/\/$/, "");
    const match = /^(.*)\/realms\/([^/]+)$/.exec(issuer);
    if (!match) throw new Error(`Unsupported KEYCLOAK_ISSUER: ${issuer}`);
    this.baseUrl = config.get<string>("KEYCLOAK_ADMIN_BASE_URL", match[1]).replace(/\/$/, "");
    this.realm = match[2];
    this.adminUser = config.get<string>("KEYCLOAK_ADMIN", "admin");
    this.adminPassword = config.get<string>("KEYCLOAK_ADMIN_PASSWORD", "admin");
  }

  async createUser(input: KeycloakUserInput): Promise<string> {
    const response = await this.request("POST", "/users", {
      username: input.username,
      email: input.email,
      firstName: input.firstName,
      lastName: input.lastName,
      enabled: true,
      emailVerified: true,
      credentials: [{ type: "password", value: input.password, temporary: false }],
    });
    const location = response.headers.get("location");
    let id = location?.split("/").pop() ?? null;
    if (!id) {
      const users = await this.json<{ id: string }[]>(
        await this.request("GET", `/users?username=${encodeURIComponent(input.username)}&exact=true`),
      );
      id = users[0]?.id ?? null;
    }
    if (!id) throw new ServiceUnavailableException("Keycloak did not return the created user");
    await this.setRole(id, input.role);
    return id;
  }

  async updateUser(id: string, update: KeycloakUserUpdate) {
    await this.request("PUT", `/users/${id}`, update);
  }

  async setRole(id: string, role: string) {
    const target = await this.role(role);
    const current = await this.json<RoleRepresentation[]>(await this.request("GET", `/users/${id}/role-mappings/realm`));
    const appRoles = await this.json<RoleRepresentation[]>(await this.request("GET", "/roles"));
    const managed = current.filter((mapping) => appRoles.some((entry) => entry.id === mapping.id && this.isAppRole(entry.name)));
    if (managed.length > 0) await this.request("DELETE", `/users/${id}/role-mappings/realm`, managed);
    if (target) await this.request("POST", `/users/${id}/role-mappings/realm`, [target]);
  }

  async deleteUser(id: string) {
    const response = await this.request("DELETE", `/users/${id}`, undefined, [404]);
    if (response.status >= 400 && response.status !== 404) throw new ServiceUnavailableException("Keycloak delete failed");
  }

  async resetPassword(id: string, password: string) {
    await this.request("PUT", `/users/${id}/reset-password`, { type: "password", value: password, temporary: false });
  }

  async logoutUser(id: string) {
    await this.request("POST", `/users/${id}/logout`, undefined, [404]);
  }

  async listSessions(id: string): Promise<KeycloakSessionRepresentation[]> {
    const response = await this.request("GET", `/users/${id}/sessions`, undefined, [404]);
    if (response.status === 404) return [];
    return this.json<KeycloakSessionRepresentation[]>(response);
  }

  private async role(name: string): Promise<RoleRepresentation | null> {
    const response = await this.request("GET", `/roles/${encodeURIComponent(name.toLowerCase())}`, undefined, [404]);
    if (response.status === 404) return null;
    return this.json<RoleRepresentation>(response);
  }

  private isAppRole(name: string) {
    return ["employee", "supervisor", "dept_manager", "archivist", "auditor", "system_admin"].includes(name.toLowerCase());
  }

  private async request(method: string, path: string, body?: unknown, allowed: number[] = []): Promise<Response> {
    const token = await this.token();
    const response = await fetch(`${this.baseUrl}/admin/realms/${this.realm}${path}`, {
      method,
      headers: {
        Authorization: `Bearer ${token}`,
        ...(body === undefined ? {} : { "Content-Type": "application/json" }),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    if (!response.ok && !allowed.includes(response.status)) {
      const detail = await response.text().catch(() => "");
      this.logger.error(`Keycloak ${method} ${path} failed: ${response.status} ${detail}`);
      if (response.status === 409) throw new ConflictException(detail || "Keycloak rejected the change as conflicting");
      throw new ServiceUnavailableException("Keycloak admin request failed");
    }
    return response;
  }

  private async json<T>(response: Response): Promise<T> {
    return (await response.json()) as T;
  }

  private async token(): Promise<string> {
    if (this.tokenCache && this.tokenCache.expiresAt > Date.now() + 5_000) return this.tokenCache.value;
    const response = await fetch(`${this.baseUrl}/realms/master/protocol/openid-connect/token`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "password",
        client_id: "admin-cli",
        username: this.adminUser,
        password: this.adminPassword,
      }),
    });
    if (!response.ok) {
      this.logger.error(`Keycloak admin login failed: ${response.status}`);
      throw new ServiceUnavailableException("Keycloak admin login failed");
    }
    const payload = (await response.json()) as { access_token: string; expires_in: number };
    this.tokenCache = { value: payload.access_token, expiresAt: Date.now() + payload.expires_in * 1000 };
    return payload.access_token;
  }
}
