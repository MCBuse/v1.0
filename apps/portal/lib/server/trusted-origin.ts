export function isTrustedPortalOrigin(
  requestOrigin: string | null,
  portalOrigin: string,
  environment: string | undefined,
) {
  if (requestOrigin === portalOrigin) return true;
  if (!requestOrigin || environment === "production") return false;

  try {
    const requestUrl = new URL(requestOrigin);
    const portalUrl = new URL(portalOrigin);
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
