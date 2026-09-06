"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { PortalApiError, portalApi } from "./api";

export function usePortalResource<T>(path: string, intervalMs = 30_000) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<Error | null>(null);
  const [loading, setLoading] = useState(true);
  const [offline, setOffline] = useState(false);
  const active = useRef(true);

  const refresh = useCallback(async () => {
    try {
      const value = await portalApi<T>(path);
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
  }, [path]);

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
