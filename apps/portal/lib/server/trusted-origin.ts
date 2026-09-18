export function isTrustedPortalOrigin(
  requestOrigin: string | null,
  configuredOrigins: string | readonly string[],
  environment: string | undefined,
) {
  const origins =
    typeof configuredOrigins === "string" ? [configuredOrigins] : configuredOrigins;
  if (requestOrigin && origins.includes(requestOrigin)) return true;
  if (!requestOrigin || environment === "production") return false;
  const primaryOrigin = origins[0];
  if (!primaryOrigin) return false;

  try {
    const requestUrl = new URL(requestOrigin);
    const portalUrl = new URL(primaryOrigin);
    const loopbackHosts = new Set(["localhost", "127.0.0.1", "[::1]"]);

    return (
      loopbackHosts.has(requestUrl.hostname) &&
      loopbackHosts.has(portalUrl.hostname) &&
      requestUrl.protocol === portalUrl.protocol &&
      requestUrl.port === portalUrl.port
    );
  } catch {
    return false;
  }
}
