import { getCsrfToken } from "./csrf";

let csrfRecovery: Promise<unknown> | null = null;

async function mutationCsrfToken() {
  if (!getCsrfToken()) {
    // A readable CSRF cookie can expire while the HttpOnly session is renewed.
    // An authenticated read restores it without submitting the mutation twice.
    csrfRecovery ??= portalApi("me").finally(() => { csrfRecovery = null; });
    await csrfRecovery;
  }
  const token = getCsrfToken();
  if (!token)
    throw new PortalApiError("Your session could not be verified. Please sign in again.", 403);
  return token;
}

export class PortalApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
  }
}

export async function portalApi<T>(
  path: string,
  init: RequestInit = {},
): Promise<T> {
  const method = init.method?.toUpperCase() ?? "GET";
  const csrfToken = method !== "GET" ? await mutationCsrfToken() : undefined;
  const isFormData = typeof FormData !== "undefined" && init.body instanceof FormData;
  const response = await fetch(`/api/merchant/${path.replace(/^\//, "")}`, {
    ...init,
    cache: "no-store",
    headers: {
      Accept: "application/json",
      ...(init.body && !isFormData ? { "Content-Type": "application/json" } : {}),
      ...(csrfToken ? { "X-CSRF-Token": csrfToken } : {}),
      ...init.headers,
    },
  });
  const payload = (await response.json().catch(() => ({}))) as {
    message?: string;
  };
  if (response.status === 401 && typeof window !== "undefined") {
    window.location.assign("/sign-in");
  }
  if (!response.ok)
    throw new PortalApiError(
      payload.message ?? "Request failed",
      response.status,
    );
  return payload as T;
}
