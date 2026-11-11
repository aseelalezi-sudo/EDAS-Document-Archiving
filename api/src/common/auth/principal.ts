import { UserRole } from "@prisma/client";

export interface Principal {
  sub: string;
  username: string;
  email?: string;
  name?: string;
  roles: UserRole[];
  identityRoles: UserRole[];
}
