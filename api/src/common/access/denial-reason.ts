const REASONS: [RegExp, string][] = [
  [/Out of department scope/i, "out_of_scope"],
  [/Missing permission: EXPORT/i, "missing_download_permission"],
  [/Missing permission: VIEW/i, "missing_view_permission"],
  [/Missing permission/i, "missing_permission"],
  [/not provisioned/i, "account_not_provisioned"],
  [/not assigned to a department/i, "account_without_department"],
  [/File not found|not found/i, "not_found"],
];

export function denialReason(error: unknown): string {
  const message = error instanceof Error ? error.message : "";
  for (const [pattern, reason] of REASONS) {
    if (pattern.test(message)) return reason;
  }
  return "not_allowed";
}
