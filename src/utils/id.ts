let counter = 0;

/**
 * Collision-resistant id generator. Combines a monotonic counter with a
 * timestamp so several ids can be created within the same millisecond.
 */
export function uid(prefix = "id"): string {
  counter = (counter + 1) % Number.MAX_SAFE_INTEGER;
  return `${prefix}-${Date.now().toString(36)}-${counter.toString(36)}`;
}
