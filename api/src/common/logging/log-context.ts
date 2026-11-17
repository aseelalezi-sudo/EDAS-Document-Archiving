import { AsyncLocalStorage } from "node:async_hooks";

export interface LogContext {
  correlationId: string;
  traceId?: string;
  spanId?: string;
  userId?: string;
  method?: string;
  path?: string;
  route?: string;
}

const storage = new AsyncLocalStorage<LogContext>();

export function runWithLogContext<T>(context: LogContext, work: () => T): T {
  return storage.run(context, work);
}

export function currentLogContext(): LogContext | undefined {
  return storage.getStore();
}
