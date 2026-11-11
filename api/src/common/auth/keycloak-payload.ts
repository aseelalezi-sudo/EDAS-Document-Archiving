import { UnauthorizedException } from "@nestjs/common";
import { UserRole, UserStatus } from "@prisma/client";
import type { Principal } from "./principal";
import { normalizeRoles } from "./roles";

export interface KeycloakPayload {
  sub: string;
  preferred_username?: string;
  email?: string;
  name?: string;
  given_name?: string;
  family_name?: string;
  realm_access?: { roles?: string[] };
  resource_access?: Record<string, { roles?: string[] }>;
}

export interface AccountSnapshot {
  status: UserStatus;
  role: UserRole;
}

/** Builds the request principal from a Keycloak token payload plus the provisioned account, if any. */
export function principalFromPayload(payload: KeycloakPayload, account: AccountSnapshot | null, clientId: string): Principal {
  if (account && account.status !== UserStatus.ACTIVE) {
    throw new UnauthorizedException("Account is locked or inactive");
  }
  const realmRoles = payload.realm_access?.roles ?? [];
  const clientRoles = payload.resource_access?.[clientId]?.roles ?? [];
  const identityRoles = normalizeRoles([...realmRoles, ...clientRoles]);
  const fullName = payload.name ?? [payload.given_name, payload.family_name].filter(Boolean).join(" ");

  return {
    sub: payload.sub,
    username: payload.preferred_username ?? payload.sub,
    email: payload.email,
    name: fullName || undefined,
    roles: account ? [account.role] : [],
    identityRoles: identityRoles.length > 0 ? identityRoles : [UserRole.EMPLOYEE],
  };
}

/**
 * Decodes a JWT payload without verifying the signature. Only used on tokens the API received directly
 * from the identity provider over TLS and stored server-side, so there is no untrusted hop.
 */
export function decodeAccessTokenPayload(accessToken: string): KeycloakPayload {
  const segment = accessToken.split(".")[1];
  if (!segment) throw new UnauthorizedException("Invalid access token");
  try {
    return JSON.parse(Buffer.from(segment, "base64url").toString("utf8")) as KeycloakPayload;
  } catch {
    throw new UnauthorizedException("Invalid access token");
  }
}
