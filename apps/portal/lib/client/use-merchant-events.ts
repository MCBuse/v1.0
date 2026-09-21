"use client";

import type {
  LiveConnectionStatus,
  MerchantEvent,
  MerchantEventsPage,
  PresentedRequestResponse,
  PresentedRequestView,
} from "@repo/shared";
import { useCallback, useEffect, useRef, useState } from "react";
import { portalApi } from "./api";

/** How long a stream may stay silent before we treat it as dead. */
const SILENCE_LIMIT_MS = 45_000;
/** How often the fallback asks for anything it missed. */
const POLL_INTERVAL_MS = 3_000;
/** Consecutive stream failures before giving up on it and polling instead. */
const STREAM_FAILURES_BEFORE_POLLING = 3;

/**
 * Q.6, Q.8 and Q.10 — the merchant's live feed, and the truth about it.
 *
 * The stream is preferred because it is immediate. When it cannot be held
 * open, the hook falls back to the polling endpoint using the same cursor, so
 * nothing is missed — and says it has done so, because a counter device that
 * is three seconds behind should not look identical to one that is live.
 */
export function useMerchantEvents({ enabled = true }: { enabled?: boolean } = {}) {
  const [status, setStatus] = useState<LiveConnectionStatus>("connecting");
  const [presented, setPresented] = useState<PresentedRequestView | null>(null);
  const [lastEventAt, setLastEventAt] = useState<string | null>(null);
  const cursor = useRef<string | null>(null);
  const failures = useRef(0);

  const applyEvent = useCallback((event: MerchantEvent) => {
    cursor.current = event.sequence;
    setLastEventAt(new Date().toISOString());
    if (event.type === "request_cleared") {
      setPresented(null);
      return;
    }
    const request = (event.payload as { request?: PresentedRequestView })
      .request;
    if (request) setPresented(request);
    else if (event.type === "request_status_changed") {
      const status = (event.payload as { status?: string }).status;
      if (status)
        setPresented((current) =>
          current && current.paymentRequestId === event.paymentRequestId
            ? { ...current, status }
            : current,
        );
    }
    window.dispatchEvent(new Event("merchant:refresh"));
  }, []);

  /** One catch-up read; also the whole of the fallback mode. */
  const catchUp = useCallback(async () => {
    const search = cursor.current ? `?after=${cursor.current}` : "";
    const page = await portalApi<MerchantEventsPage>(`me/events${search}`);
    for (const event of page.events) applyEvent(event);
    if (!cursor.current && page.latestSequence)
      cursor.current = page.latestSequence;
  }, [applyEvent]);

  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;
    let source: EventSource | null = null;
    let pollTimer: number | undefined;
    let silenceTimer: number | undefined;

    async function loadSnapshot() {
      try {
        const current = await portalApi<PresentedRequestResponse>(
          "me/presented-request",
        );
        if (cancelled) return;
        setPresented(current.request);
        if (current.latestSequence) cursor.current = current.latestSequence;
      } catch {
        // The stream's own snapshot will cover this if it connects.
      }
    }

    function startPolling() {
      if (cancelled || pollTimer !== undefined) return;
      setStatus(navigator.onLine ? "polling" : "offline");
      pollTimer = window.setInterval(() => {
        void catchUp()
          .then(() => {
            if (!cancelled) setStatus(navigator.onLine ? "polling" : "offline");
          })
          .catch(() => {
            if (!cancelled) setStatus(navigator.onLine ? "polling" : "offline");
          });
      }, POLL_INTERVAL_MS);
    }

    function stopPolling() {
      if (pollTimer !== undefined) {
        window.clearInterval(pollTimer);
        pollTimer = undefined;
      }
    }

    function armSilenceTimer() {
      if (silenceTimer !== undefined) window.clearTimeout(silenceTimer);
      // Heartbeats arrive every 20s; twice that with nothing means the
      // connection is open in name only.
      silenceTimer = window.setTimeout(() => {
        if (cancelled) return;
        setStatus("reconnecting");
        source?.close();
        connect();
      }, SILENCE_LIMIT_MS);
    }

    function connect() {
      if (cancelled) return;
      if (typeof EventSource === "undefined") {
        startPolling();
        return;
      }
      setStatus((current) => (current === "live" ? "reconnecting" : current));
      source = new EventSource("/api/merchant/me/events/stream");

      source.addEventListener("open", () => {
        if (cancelled) return;
        failures.current = 0;
        stopPolling();
        setStatus("live");
        armSilenceTimer();
      });

      const onMessage = (raw: MessageEvent<string>) => {
        if (cancelled) return;
        armSilenceTimer();
        setStatus("live");
        try {
          const parsed = JSON.parse(raw.data) as
            | { request?: PresentedRequestView | null; sequence?: string }
            | MerchantEvent;
          if ("sequence" in parsed && "type" in parsed) {
            applyEvent(parsed as MerchantEvent);
            return;
          }
          // The snapshot: authoritative state, not an incremental change.
          const snapshot = parsed as {
            request?: PresentedRequestView | null;
            sequence?: string;
          };
          setPresented(snapshot.request ?? null);
          if (snapshot.sequence && snapshot.sequence !== "0")
            cursor.current = snapshot.sequence;
        } catch {
          // A malformed frame is not a reason to tear the connection down.
        }
      };

      for (const type of [
        "snapshot",
        "request_presented",
        "request_status_changed",
        "request_cleared",
      ])
        source.addEventListener(type, onMessage as EventListener);
      source.addEventListener("heartbeat", () => {
        if (!cancelled) armSilenceTimer();
      });

      source.addEventListener("error", () => {
        if (cancelled) return;
        source?.close();
        failures.current += 1;
        if (!navigator.onLine) {
          setStatus("offline");
          startPolling();
          return;
        }
        if (failures.current >= STREAM_FAILURES_BEFORE_POLLING) {
          // The stream is not going to work here. Keep the data moving.
          startPolling();
          void catchUp().catch(() => undefined);
          return;
        }
        setStatus("reconnecting");
        window.setTimeout(connect, 1_000 * failures.current);
      });
    }

    void loadSnapshot().then(connect);

    const online = () => {
      failures.current = 0;
      stopPolling();
      source?.close();
      connect();
    };
    const offline = () => setStatus("offline");
    window.addEventListener("online", online);
    window.addEventListener("offline", offline);

    return () => {
      cancelled = true;
      stopPolling();
      if (silenceTimer !== undefined) window.clearTimeout(silenceTimer);
      source?.close();
      window.removeEventListener("online", online);
      window.removeEventListener("offline", offline);
    };
  }, [applyEvent, catchUp, enabled]);

  return { status, presented, lastEventAt, setPresented };
}
