import { describe, expect, it } from "vitest";
import { SseFrameBuffer, parseSseFrame } from "@repo/shared";

/**
 * The event stream is parsed by hand on the mobile client, because React
 * Native has no `EventSource` and the stream needs an Authorization header
 * that `EventSource` could not send. These cases are the ones a hand-rolled
 * parser gets wrong: the optional space, multi-line data, comments, and a
 * frame arriving in pieces.
 */
describe("SSE frame parsing", () => {
  it("reads a complete frame", () => {
    expect(parseSseFrame('id: 42\nevent: snapshot\ndata: {"a":1}')).toEqual({
      id: "42",
      event: "snapshot",
      data: '{"a":1}',
    });
  });

  it("defaults the event name to message", () => {
    expect(parseSseFrame("data: hello")?.event).toBe("message");
  });

  it("treats only the first space after the colon as framing", () => {
    expect(parseSseFrame("data:  two spaces")?.data).toBe(" two spaces");
  });

  it("accepts a field with no space at all", () => {
    expect(parseSseFrame("data:tight")?.data).toBe("tight");
  });

  it("joins multi-line data with newlines", () => {
    expect(parseSseFrame("data: first\ndata: second")?.data).toBe(
      "first\nsecond",
    );
  });

  it("ignores comment lines", () => {
    expect(parseSseFrame(": keep-alive\ndata: real")?.data).toBe("real");
  });

  it("ignores a frame that carries no data", () => {
    expect(parseSseFrame(": just a comment")).toBeNull();
    expect(parseSseFrame("event: heartbeat")).toBeNull();
  });

  it("handles a field with no colon", () => {
    expect(parseSseFrame("data: value\nbare")?.data).toBe("value");
  });

  it("tolerates carriage returns", () => {
    expect(parseSseFrame("id: 7\r\ndata: windows\r")).toEqual({
      id: "7",
      event: "message",
      data: "windows",
    });
  });
});

describe("SSE chunk buffering", () => {
  it("yields whole frames from one chunk", () => {
    const buffer = new SseFrameBuffer();
    const frames = buffer.push("data: one\n\ndata: two\n\n");
    expect(frames.map((frame) => frame.data)).toEqual(["one", "two"]);
    expect(buffer.pending).toBe("");
  });

  it("holds an incomplete frame until the rest arrives", () => {
    const buffer = new SseFrameBuffer();
    expect(buffer.push("data: par")).toEqual([]);
    expect(buffer.push("tial\n\n").map((frame) => frame.data)).toEqual([
      "partial",
    ]);
  });

  it("survives a chunk boundary inside the separator", () => {
    const buffer = new SseFrameBuffer();
    expect(buffer.push("data: split\n")).toEqual([]);
    expect(buffer.push("\n").map((frame) => frame.data)).toEqual(["split"]);
  });

  it("keeps the tail of a chunk that ends mid-frame", () => {
    const buffer = new SseFrameBuffer();
    buffer.push("data: done\n\ndata: not yet");
    expect(buffer.pending).toBe("data: not yet");
  });

  it("drops keep-alive comments without dropping the frames around them", () => {
    const buffer = new SseFrameBuffer();
    const frames = buffer.push(": ping\n\ndata: real\n\n");
    expect(frames.map((frame) => frame.data)).toEqual(["real"]);
  });

  it("parses the frames the API actually emits", () => {
    // Exactly the shape of the controller's snapshot, event and heartbeat.
    const buffer = new SseFrameBuffer();
    const frames = buffer.push(
      'id: 12\nevent: snapshot\ndata: {"request":null,"sequence":"12"}\n\n' +
        'id: 13\nevent: request_presented\ndata: {"sequence":"13","type":"request_presented"}\n\n' +
        'id: 13\nevent: heartbeat\ndata: {"at":"2026-09-21T17:00:00.000Z"}\n\n',
    );

    expect(frames.map((frame) => frame.event)).toEqual([
      "snapshot",
      "request_presented",
      "heartbeat",
    ]);
    expect(frames[1]!.id).toBe("13");
    // The heartbeat repeats the last real id, so a reconnect cannot skip past
    // events the client never received.
    expect(frames[2]!.id).toBe("13");
  });
});
