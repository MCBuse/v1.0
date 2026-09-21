"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { PortalApiError, portalApi } from "./api";

/**
 * Module-level so the default is referentially stable. An inline default would
 * be a new function on every render, which would restart the polling effect
 * every render.
 */
const merchantFetcher = <T,>(path: string) => portalApi<T>(path);

/**
 * Polls a portal endpoint and keeps the last good value on screen.
 *
 * `fetcher` exists because not every endpoint lives under `/api/merchant`:
 * the account flows have their own proxy. Everything else about the behaviour
 * — refresh on focus, on reconnect, and on the `merchant:refresh` event — is
 * the same whichever upstream a path belongs to.
 */
export function usePortalResource<T>(
  path: string,
  intervalMs = 30_000,
  /** Must be referentially stable: define it outside the component. */
  fetcher: (path: string) => Promise<T> = merchantFetcher,
) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<Error | null>(null);
  const [loading, setLoading] = useState(true);
  const [offline, setOffline] = useState(false);
  const active = useRef(true);

  const refresh = useCallback(async () => {
    try {
      const value = await fetcher(path);
      if (!active.current) return;
      setData(value);
      setError(null);
      setOffline(false);
    } catch (reason) {
      if (!active.current) return;
      setError(reason instanceof Error ? reason : new Error("Request failed"));
      setOffline(!navigator.onLine || !(reason instanceof PortalApiError));
    } finally {
      if (active.current) setLoading(false);
    }
  }, [fetcher, path]);

  useEffect(() => {
    active.current = true;
    void refresh();
    const timer = window.setInterval(() => void refresh(), intervalMs);
    const online = () => void refresh();
    const merchantRefresh = () => void refresh();
    window.addEventListener("online", online);
    window.addEventListener("merchant:refresh", merchantRefresh);
    return () => {
      active.current = false;
      window.clearInterval(timer);
      window.removeEventListener("online", online);
      window.removeEventListener("merchant:refresh", merchantRefresh);
    };
  }, [intervalMs, refresh]);

  return { data, error, loading, offline, refresh };
}
