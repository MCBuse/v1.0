import { SseFrameBuffer, type SseFrame } from '@repo/shared';
import { fetch as expoFetch } from 'expo/fetch';

import { env } from '@/lib/api';

export type { SseFrame };

export interface SseHandlers {
  onOpen?: () => void;
  onFrame: (frame: SseFrame) => void;
  onError: (reason: unknown) => void;
}

/**
 * Q.8 — an authenticated event stream on the device.
 *
 * React Native has no `EventSource`, and the stream needs an Authorization
 * header, which the browser API could not send anyway. Expo's fetch exposes
 * the response body as a stream, so the SSE framing is parsed here: frames are
 * separated by a blank line, and a frame's `data:` lines are joined with a
 * newline exactly as the specification says.
 *
 * Returns a function that closes the connection.
 */
export function openMerchantEventStream(
  accessToken: string,
  handlers: SseHandlers,
  options: { lastEventId?: string | null } = {},
): () => void {
  const controller = new AbortController();
  let closed = false;

  void (async () => {
    try {
      const response = await expoFetch(
        `${env.apiBaseUrl}/merchants/me/events/stream`,
        {
          method: 'GET',
          headers: {
            Accept: 'text/event-stream',
            Authorization: `Bearer ${accessToken}`,
            ...(options.lastEventId
              ? { 'Last-Event-ID': options.lastEventId }
              : {}),
          },
          signal: controller.signal,
        },
      );

      if (!response.ok || !response.body) {
        handlers.onError(new Error(`Stream refused with ${response.status}`));
        return;
      }

      handlers.onOpen?.();

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      // Chunk boundaries fall wherever the network puts them; the buffer holds
      // whatever does not yet make a whole frame.
      const frames = new SseFrameBuffer();

      for (;;) {
        const { value, done } = await reader.read();
        if (done) break;
        if (closed) return;

        for (const frame of frames.push(decoder.decode(value, { stream: true })))
          handlers.onFrame(frame);
      }

      if (!closed) handlers.onError(new Error('Stream ended'));
    } catch (reason) {
      if (!closed) handlers.onError(reason);
    }
  })();

  return () => {
    closed = true;
    controller.abort();
  };
}
