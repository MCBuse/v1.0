"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { PortalApiError, portalApi } from "./api";

/**
 * Like `usePortalResource`, with the refresh rules of plan §3.10:
 *
 * - the next poll is scheduled only after the previous request settles, so
 *   requests never overlap, and a manual refresh joins one already in flight;
 * - polling stops while the tab is hidden and catches up once it is visible;
 * - the last good value stays on screen through errors and while a new path
 *   loads (`dataPath` tells the two apart);
 * - a changed interval reschedules without an extra request.
 *
 * `path === null` pauses the resource (nothing to fetch yet).
 */
export function usePolledResource<T>(path: string | null, intervalMs: number) {
  const [data, setData] = useState<T | null>(null);
  const [dataPath, setDataPath] = useState<string | null>(null);
  const [error, setError] = useState<Error | null>(null);
  const [loading, setLoading] = useState(path !== null);
  const [offline, setOffline] = useState(false);

  const latestPath = useRef(path);
  latestPath.current = path;
  const inFlight = useRef<{ path: string; promise: Promise<void> } | null>(null);
  const fetched = useRef<string | null>(null);
  const mounted = useRef(true);

  const refresh = useCallback((): Promise<void> => {
    const target = latestPath.current;
    if (target === null) return Promise.resolve();
    if (inFlight.current?.path === target) return inFlight.current.promise;
    setLoading(true);
    const entry: { path: string; promise?: Promise<void> } = { path: target };
    const promise = (async () => {
      try {
        const value = await portalApi<T>(target);
        if (!mounted.current || latestPath.current !== target) return;
        fetched.current = target;
        setData(value);
        setDataPath(target);
        setError(null);
        setOffline(false);
      } catch (reason) {
        if (!mounted.current || latestPath.current !== target) return;
        setError(reason instanceof Error ? reason : new Error("Request failed"));
        setOffline(!navigator.onLine || !(reason instanceof PortalApiError));
      } finally {
        if (inFlight.current === entry) inFlight.current = null;
        if (mounted.current && latestPath.current === target) setLoading(false);
      }
    })();
    entry.promise = promise;
    inFlight.current = entry as { path: string; promise: Promise<void> };
    return promise;
  }, []);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  useEffect(() => {
    if (path === null) return;
    let timer: number | undefined;
    let stopped = false;
    const schedule = () => {
      window.clearTimeout(timer);
      if (stopped || document.visibilityState === "hidden") return;
      timer = window.setTimeout(() => void tick(), intervalMs);
    };
    const tick = async () => {
      if (document.visibilityState === "hidden") return;
      await refresh();
      schedule();
    };
    // A new path loads straight away; a new interval only reschedules.
    if (fetched.current !== path) void tick();
    else schedule();

    const onVisibility = () => {
      if (document.visibilityState === "hidden") window.clearTimeout(timer);
      else void tick();
    };
    const onOnline = () => void tick();
    const onMerchantRefresh = () => void refresh();
    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("online", onOnline);
    window.addEventListener("merchant:refresh", onMerchantRefresh);
    return () => {
      stopped = true;
      window.clearTimeout(timer);
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("online", onOnline);
      window.removeEventListener("merchant:refresh", onMerchantRefresh);
    };
  }, [path, intervalMs, refresh]);

  return {
    data,
    dataPath,
    error,
    loading: path !== null && loading,
    offline,
    refresh,
    /** HTTP status of the last failure, when the API answered. */
    errorStatus: error instanceof PortalApiError ? error.status : null,
  };
}
