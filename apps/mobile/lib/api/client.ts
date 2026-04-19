import axios, {
  AxiosError,
  type AxiosInstance,
  type AxiosRequestConfig,
  type InternalAxiosRequestConfig,
} from "axios";

import { env } from "./env";
import { toApiError } from "./errors";
import { authSession } from "./session";

type RetriableRequest = InternalAxiosRequestConfig & { _retried?: boolean };

/**
 * Invoked when refresh fails → the user must re-authenticate. Wired from the
 * Auth provider so the client doesn't import UI stores directly.
 */
let onAuthExpired: (() => void) | null = null;

export function setOnAuthExpired(handler: (() => void) | null): void {
  onAuthExpired = handler;
}

export const api: AxiosInstance = axios.create({
  baseURL: env.apiBaseUrl,
  timeout: 15_000,
  headers: { "Content-Type": "application/json" },
});

// ── Request interceptor: attach Authorization header ────────────────────────
api.interceptors.request.use((config) => {
  const tokens = authSession.get();
  if (tokens?.accessToken && config.headers) {
    config.headers.Authorization = `Bearer ${tokens.accessToken}`;
  }
  return config;
});

// ── Response interceptor: single-flight refresh on 401 ──────────────────────
let refreshPromise: Promise<string | null> | null = null;

async function performRefresh(): Promise<string | null> {
  const tokens = authSession.get();
  if (!tokens?.refreshToken) return null;

  try {
    const res = await axios.post<{ accessToken: string; refreshToken: string }>(
      `${env.apiBaseUrl}/auth/refresh`,
      { refreshToken: tokens.refreshToken },
      { headers: { "Content-Type": "application/json" } },
    );
    await authSession.set({
      accessToken: res.data.accessToken,
      refreshToken: res.data.refreshToken,
    });
    return res.data.accessToken;
  } catch {
    return null;
  }
}

api.interceptors.response.use(
  (response) => response,
  async (error: AxiosError) => {
    const original = error.config as RetriableRequest | undefined;
    const status = error.response?.status;

    // The refresh endpoint itself failing should not trigger another refresh.
    const isRefreshCall =
      typeof original?.url === "string" &&
      original.url.includes("/auth/refresh");

    if (status === 401 && original && !original._retried && !isRefreshCall) {
      original._retried = true;

      refreshPromise ??= performRefresh().finally(() => {
        refreshPromise = null;
      });
      const newAccessToken = await refreshPromise;

      if (newAccessToken) {
        if (original.headers) {
          original.headers.Authorization = `Bearer ${newAccessToken}`;
        }
        return api.request(original);
      }

      // Refresh failed → force logout.
      await authSession.clear();
      onAuthExpired?.();
    }

    return Promise.reject(toApiError(error));
  },
);

// ── Request helpers ─────────────────────────────────────────────────────────
// These unwrap the AxiosResponse and re-throw normalised ApiError instances.
async function request<T>(config: AxiosRequestConfig): Promise<T> {
  try {
    const res = await api.request<T>(config);
    return res.data;
  } catch (err) {
    throw toApiError(err);
  }
}

export const http = {
  get: <T>(url: string, config?: AxiosRequestConfig) =>
    request<T>({ ...config, method: "GET", url }),
  post: <T>(url: string, data?: unknown, config?: AxiosRequestConfig) =>
    request<T>({ ...config, method: "POST", url, data }),
  put: <T>(url: string, data?: unknown, config?: AxiosRequestConfig) =>
    request<T>({ ...config, method: "PUT", url, data }),
  patch: <T>(url: string, data?: unknown, config?: AxiosRequestConfig) =>
    request<T>({ ...config, method: "PATCH", url, data }),
  delete: <T>(url: string, config?: AxiosRequestConfig) =>
    request<T>({ ...config, method: "DELETE", url }),
};
