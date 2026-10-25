import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { usePolledResource } from "./use-polled-resource";

type Pending = { path: string; resolve: (body: unknown, status?: number) => void };

let calls: Pending[] = [];
let visibility: DocumentVisibilityState = "visible";

function respond(index: number, body: unknown, status = 200) {
  act(() => calls[index]!.resolve(body, status));
}

beforeEach(() => {
  vi.useFakeTimers();
  calls = [];
  visibility = "visible";
  Object.defineProperty(document, "visibilityState", {
    configurable: true,
    get: () => visibility,
  });
  vi.stubGlobal(
    "fetch",
    vi.fn(
      (url: string) =>
        new Promise((resolve) => {
          calls.push({
            path: url,
            resolve: (body, status = 200) =>
              resolve(new Response(JSON.stringify(body), { status })),
          });
        }),
    ),
  );
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

const settle = () => act(async () => { await vi.advanceTimersByTimeAsync(0); });

describe("usePolledResource", () => {
  it("polls only after the previous request settles, so requests never overlap", async () => {
    renderHook(() => usePolledResource<{ n: number }>("me/changes/status", 60_000));
    expect(calls).toHaveLength(1);
    // The response is slower than the interval: no second request is sent.
    await act(async () => { await vi.advanceTimersByTimeAsync(180_000); });
    expect(calls).toHaveLength(1);
    respond(0, { n: 1 });
    await settle();
    await act(async () => { await vi.advanceTimersByTimeAsync(59_999); });
    expect(calls).toHaveLength(1);
    await act(async () => { await vi.advanceTimersByTimeAsync(1); });
    expect(calls).toHaveLength(2);
    expect(calls[1]!.path).toBe("/api/merchant/me/changes/status");
  });

  it("joins a refresh that is already in flight instead of sending another", async () => {
    const { result } = renderHook(() => usePolledResource("me/changes", 60_000));
    act(() => void result.current.refresh());
    act(() => void result.current.refresh());
    expect(calls).toHaveLength(1);
  });

  it("stops in a hidden tab and catches up when it becomes visible", async () => {
    renderHook(() => usePolledResource("me/changes", 60_000));
    respond(0, {});
    await settle();
    visibility = "hidden";
    act(() => void document.dispatchEvent(new Event("visibilitychange")));
    await act(async () => { await vi.advanceTimersByTimeAsync(600_000); });
    expect(calls).toHaveLength(1);
    visibility = "visible";
    act(() => void document.dispatchEvent(new Event("visibilitychange")));
    expect(calls).toHaveLength(2);
  });

  it("reschedules on a new interval without an extra request", async () => {
    const { rerender } = renderHook(
      ({ interval }) => usePolledResource("me/changes/status", interval),
      { initialProps: { interval: 60_000 } },
    );
    respond(0, {});
    await settle();
    rerender({ interval: 5_000 });
    expect(calls).toHaveLength(1);
    await act(async () => { await vi.advanceTimersByTimeAsync(5_000); });
    expect(calls).toHaveLength(2);
  });

  it("keeps the last good value when a refresh fails", async () => {
    const { result } = renderHook(() => usePolledResource<{ n: number }>("me/changes", 60_000));
    respond(0, { n: 1 });
    await settle();
    act(() => void result.current.refresh());
    respond(1, { message: "Service unavailable" }, 503);
    await settle();
    expect(result.current.data).toEqual({ n: 1 });
    expect(result.current.error?.message).toBe("Service unavailable");
    expect(result.current.errorStatus).toBe(503);
  });

  it("does nothing while the path is null", async () => {
    const { result } = renderHook(() => usePolledResource(null, 60_000));
    await act(async () => { await vi.advanceTimersByTimeAsync(120_000); });
    expect(calls).toHaveLength(0);
    expect(result.current.loading).toBe(false);
  });
});
