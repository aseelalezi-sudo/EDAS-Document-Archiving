import type { Prisma } from "@prisma/client";

/**
 * Holds a transaction-scoped advisory lock for `key` until the caller's transaction ends.
 * Used where a guard is a read (a legal-hold count, a chain head, a child count) that a concurrent writer could
 * invalidate before the guarded write lands; both sides of the race must take the same key.
 */
export async function advisoryLock(tx: Prisma.TransactionClient, key: string): Promise<void> {
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${key}))`;
}

export function documentHoldLock(documentId: string): string {
  return `edas.document.hold.${documentId}`;
}
