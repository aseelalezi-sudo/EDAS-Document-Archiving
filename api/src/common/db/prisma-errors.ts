import { Prisma } from "@prisma/client";

/** True when Prisma surface a unique-constraint violation — the database rejected a write that raced ahead of us. */
export function isUniqueViolation(error: unknown): error is Prisma.PrismaClientKnownRequestError {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002";
}
