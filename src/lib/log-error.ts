export function logError(context: string, error: unknown): void {
  console.error(`[EDAS] ${context} failed`, error);
}
