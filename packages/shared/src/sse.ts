/**
 * Server-sent event framing, shared by whoever has to parse it by hand.
 *
 * The browser has `EventSource`; React Native does not, and could not use it
 * anyway because the stream needs an Authorization header. So the framing is
 * parsed in application code, and the rules are subtle enough — multi-line
 * data, comments, the single optional space after the colon, frames split
 * across network chunks — to be worth having in one tested place rather than
 * reimplemented per client.
 */

export interface SseFrame {
  id: string | null;
  event: string;
  data: string;
}

/**
 * Parses one complete frame: the text between two blank lines.
 *
 * Returns null for a frame with no `data` field, which the specification says
 * to ignore — a comment-only keep-alive being the usual case.
 */
export function parseSseFrame(raw: string): SseFrame | null {
  let id: string | null = null;
  let event = 'message';
  const data: string[] = [];

  for (const line of raw.split('\n')) {
    const trimmed = line.endsWith('\r') ? line.slice(0, -1) : line;
    // A blank line cannot appear inside a frame, and a leading colon is a
    // comment.
    if (!trimmed || trimmed.startsWith(':')) continue;

    const separator = trimmed.indexOf(':');
    const field = separator === -1 ? trimmed : trimmed.slice(0, separator);
    let value = separator === -1 ? '' : trimmed.slice(separator + 1);
    // Exactly one leading space belongs to the framing, not the value.
    if (value.startsWith(' ')) value = value.slice(1);

    if (field === 'id') id = value;
    else if (field === 'event') event = value;
    else if (field === 'data') data.push(value);
  }

  if (!data.length) return null;
  return { id, event, data: data.join('\n') };
}

/**
 * Accumulates network chunks and yields whole frames.
 *
 * A chunk boundary falls wherever the network puts it, which is regularly in
 * the middle of a frame. Anything after the last blank line is kept until the
 * rest of it arrives.
 */
export class SseFrameBuffer {
  private buffer = '';

  push(chunk: string): SseFrame[] {
    this.buffer += chunk;
    const frames: SseFrame[] = [];

    for (;;) {
      const separator = nextSeparator(this.buffer);
      if (!separator) break;
      const raw = this.buffer.slice(0, separator.index);
      this.buffer = this.buffer.slice(separator.index + separator.length);
      const frame = parseSseFrame(raw);
      if (frame) frames.push(frame);
    }

    return frames;
  }

  /** What has arrived but does not yet form a complete frame. */
  get pending(): string {
    return this.buffer;
  }
}

function nextSeparator(
  buffer: string,
): { index: number; length: number } | null {
  const plain = buffer.indexOf('\n\n');
  const crlf = buffer.indexOf('\r\n\r\n');
  if (plain === -1 && crlf === -1) return null;
  if (crlf !== -1 && (plain === -1 || crlf < plain))
    return { index: crlf, length: 4 };
  return { index: plain, length: 2 };
}
