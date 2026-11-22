import type { StorageService } from "./storage.service";

export async function removeCurrentObjects(storage: Pick<StorageService, "remove">, keys: string[]): Promise<string[]> {
  async function attempt(batch: string[]) {
    const results = await Promise.allSettled(batch.map((key) => storage.remove(key)));
    return batch.filter((_, index) => results[index].status === "rejected");
  }

  const unique = [...new Set(keys)];
  const remaining: string[] = [];
  for (let i = 0; i < unique.length; i += 8) {
    const failed = await attempt(unique.slice(i, i + 8));
    if (failed.length) remaining.push(...await attempt(failed));
  }
  return remaining;
}
