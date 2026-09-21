import { useCallback, useEffect, useRef, useState } from 'react';

import { authSession } from '@/lib/api';

import {
  merchantEvent,
  presentedRequest as presentedRequestSchema,
  type LiveConnectionStatus,
  type MerchantEvent,
  type PresentedRequest,
} from './models';
import { merchantEventsRepository } from './repository';
import { openMerchantEventStream } from './sse-client';

// Leave time for the hosted request and rendering within the two-second target.
const POLL_INTERVAL_MS = 1_000;
const STREAM_FAILURES_BEFORE_POLLING = 3;

/**
 * Q.8 and Q.11 — the counter's live state on a device.
 *
 * The stream only runs while `enabled` is true, which the Receive screen ties
 * to focus. A background screen holding an open stream would be exactly the
 * hijacking the plan rules out, and would keep the radio awake for nothing.
 */
export function useMerchantCounter({ enabled }: { enabled: boolean }) {
  const [status, setStatus] = useState<LiveConnectionStatus>('connecting');
  const [presented, setPresented] = useState<PresentedRequest | null>(null);
  const cursor = useRef<string | null>(null);
  const failures = useRef(0);

  const applyEvent = useCallback((event: MerchantEvent) => {
    cursor.current = event.sequence;
    if (event.type === 'request_cleared') {
      setPresented(null);
      return;
    }
    const parsed = presentedRequestSchema.safeParse(
      (event.payload as { request?: unknown }).request,
    );
    if (parsed.success) {
      setPresented(parsed.data);
      return;
    }
    const nextStatus = (event.payload as { status?: string }).status;
    if (event.type === 'request_status_changed' && nextStatus) {
      setPresented((current) =>
        current && current.paymentRequestId === event.paymentRequestId
          ? { ...current, status: nextStatus }
          : current,
      );
    }
  }, []);

  const catchUp = useCallback(async (isCurrent: () => boolean) => {
    const page = await merchantEventsRepository.since(cursor.current);
    if (!isCurrent()) return;
    for (const event of page.events) applyEvent(event);
    if (!cursor.current && page.latestSequence)
      cursor.current = page.latestSequence;
  }, [applyEvent]);

  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;
    let closeStream: (() => void) | null = null;
    let pollTimer: ReturnType<typeof setInterval> | null = null;
    let pollInFlight = false;

    async function poll() {
      if (cancelled || pollInFlight) return;
      pollInFlight = true;
      try {
        await catchUp(() => !cancelled);
      } catch {
        // The next tick resumes from the last successfully applied event.
      } finally {
        pollInFlight = false;
      }
    }

    function startPolling() {
      if (cancelled || pollTimer) return;
      setStatus('polling');
      pollTimer = setInterval(() => void poll(), POLL_INTERVAL_MS);
    }

    function stopPolling() {
      if (pollTimer) {
        clearInterval(pollTimer);
        pollTimer = null;
      }
    }

    function connect() {
      if (cancelled) return;
      const token = authSession.get()?.accessToken;
      if (!token) {
        // No session yet: polling goes through the axios client, which will
        // have one by the time it fires.
        startPolling();
        return;
      }

      closeStream = openMerchantEventStream(
        token,
        {
          onOpen: () => {
            if (cancelled) return;
            failures.current = 0;
            stopPolling();
            setStatus('live');
          },
          onFrame: (frame) => {
            if (cancelled) return;
            setStatus('live');
            try {
              const body: unknown = JSON.parse(frame.data);
              if (frame.event === 'snapshot') {
                const snapshot = body as {
                  request?: unknown;
                  sequence?: string;
                };
                const parsed = presentedRequestSchema.safeParse(
                  snapshot.request,
                );
                setPresented(parsed.success ? parsed.data : null);
                if (snapshot.sequence && snapshot.sequence !== '0')
                  cursor.current = snapshot.sequence;
                return;
              }
              if (frame.event === 'heartbeat') return;
              const event = merchantEvent.safeParse(body);
              if (event.success) applyEvent(event.data);
            } catch {
              // A malformed frame is not a reason to drop the connection.
            }
          },
          onError: () => {
            if (cancelled) return;
            closeStream?.();
            closeStream = null;
            failures.current += 1;
            if (failures.current >= STREAM_FAILURES_BEFORE_POLLING) {
              startPolling();
              void poll();
              return;
            }
            setStatus('reconnecting');
            setTimeout(connect, 1_000 * failures.current);
          },
        },
        { lastEventId: cursor.current },
      );
    }

    void merchantEventsRepository
      .presented()
      .then((current) => {
        if (cancelled) return;
        setPresented(current.request);
        if (current.latestSequence) cursor.current = current.latestSequence;
      })
      .catch(() => undefined)
      .finally(connect);

    return () => {
      cancelled = true;
      stopPolling();
      closeStream?.();
    };
  }, [applyEvent, catchUp, enabled]);

  const clear = useCallback(async () => {
    await merchantEventsRepository.clear();
    setPresented(null);
  }, []);

  return { status, presented, clear };
}
