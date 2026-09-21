import { clearOperationIntents } from "./operation-intent";
import { getCsrfToken } from "./csrf";
import { PortalApiError, portalApi } from "./api";

/**
 * The account endpoints sit outside `/merchants`, so they go through their own
 * proxy. Everything else — CSRF recovery, the 401 redirect, the error shape —
 * behaves exactly as it does for merchant calls, because a caller should not
 * have to know which upstream a path belongs to.
 */
export async function accountsApi<T>(
  path = "",
  init: RequestInit = {},
): Promise<T> {
  const method = init.method?.toUpperCase() ?? "GET";
  let csrfToken: string | undefined;
  if (method !== "GET") {
    if (!getCsrfToken()) {
      // An authenticated read restores a CSRF cookie that expired while the
      // HttpOnly session was renewed.
      await portalApi("me").catch(() => undefined);
    }
    csrfToken = getCsrfToken() ?? undefined;
    if (!csrfToken)
      throw new PortalApiError(
        "Your session could not be verified. Please sign in again.",
        403,
      );
  }

  const response = await fetch(`/api/accounts/${path.replace(/^\//, "")}`, {
    ...init,
    cache: "no-store",
    headers: {
      Accept: "application/json",
      ...(init.body ? { "Content-Type": "application/json" } : {}),
      ...(csrfToken ? { "X-CSRF-Token": csrfToken } : {}),
      ...init.headers,
    },
  });

  const payload = (await response.json().catch(() => ({}))) as {
    message?: string;
  };
  if (response.status === 401 && typeof window !== "undefined") {
    clearOperationIntents();
    window.location.assign("/sign-in");
  }
  if (!response.ok)
    throw new PortalApiError(payload.message ?? "Request failed", response.status);
  return payload as T;
}

/** Stable reference for `usePortalResource`, which restarts on a new fetcher. */
export const accountsFetcher = <T,>(path: string) => accountsApi<T>(path);
