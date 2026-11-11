export const SERVER_UNAVAILABLE_REPORTS = new Set(["rpt-7"]);

export function isReportRunnable(reportId: string, apiMode: boolean): boolean {
  return !apiMode || !SERVER_UNAVAILABLE_REPORTS.has(reportId);
}
