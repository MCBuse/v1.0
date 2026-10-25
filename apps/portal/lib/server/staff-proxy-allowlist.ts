/** Staff API paths (relative to `/staff/`) the portal proxy forwards. Anything else is 404. */
const allowed = [
  /^me$/,
  /^credit-assessments(?:\/(?:merchants|model|[a-f0-9-]{36}))?$/i,
  /^changes\/merchants$/,
  /^changes\/update-now$/,
];

export function isAllowedStaffPath(path: string): boolean {
  return allowed.some((pattern) => pattern.test(path));
}
