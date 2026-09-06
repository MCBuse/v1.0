export function getCsrfToken() {
  if (typeof document === "undefined") return "";
  const entry = document.cookie
    .split("; ")
    .find((value) => value.startsWith("mcbuse_portal_csrf="));
  return entry ? decodeURIComponent(entry.split("=").slice(1).join("=")) : "";
}
