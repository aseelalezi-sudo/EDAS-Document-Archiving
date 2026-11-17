export interface SettledOutcome {
  doneIds: string[];
  failure?: PromiseRejectedResult;
  ok: boolean;
}

export function settledOutcome<T>(ids: string[], results: PromiseSettledResult<T>[]): SettledOutcome {
  const doneIds = ids.filter((_id, index) => results[index]?.status === "fulfilled");
  const failure = results.find((result): result is PromiseRejectedResult => result.status === "rejected");
  return { doneIds, failure, ok: doneIds.length === ids.length };
}

export function settleResult<T>(result: PromiseSettledResult<T>): T | null {
  return result.status === "fulfilled" ? result.value : null;
}
