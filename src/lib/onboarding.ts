const SEEN_KEY = "edas.v1.onboardingSeen";

function readSeen(): string[] {
  try {
    const raw = localStorage.getItem(SEEN_KEY);
    const parsed: unknown = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed.filter((value): value is string => typeof value === "string") : [];
  } catch {
    return [];
  }
}

export function hasSeenOnboarding(userId: string): boolean {
  return readSeen().includes(userId);
}

export function markOnboardingSeen(userId: string): void {
  try {
    const seen = readSeen();
    if (seen.includes(userId)) return;
    localStorage.setItem(SEEN_KEY, JSON.stringify([...seen, userId]));
  } catch {
    /* ignore quota errors */
  }
}
