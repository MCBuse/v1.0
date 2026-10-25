import type { StaffChangeMerchant } from "@repo/shared";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { UpdateNowWorkspace } from "./workspace";

const merchant = (businessName: string, ownerEmail: string, merchantId: string): StaffChangeMerchant => ({
  merchantId,
  publicId: `mrc_${merchantId.slice(0, 8)}`,
  businessName,
  ownerEmail,
  lastSuccessfulUpdateAt: null,
  processing: "idle",
});
const ACI = merchant("Aci Café", "owner@aci.example", "7a0f6c1e-4a52-4c1f-9a64-0e7b8a5d2c11");
const MCBUSE = merchant("MCBuse", "fred@mcbuse.example", "1b2c3d4e-5f60-4a71-8b92-a3b4c5d6e7f8");
const NORD = merchant("Bäckerei Nord", "team@baeckerei.example", "9c8b7a6d-5e4f-4a3b-8c2d-1e0f9a8b7c6d");
const ALL = [ACI, MCBUSE, NORD];

/** The staff search endpoint, answered only when the test releases each request. */
let pending: Array<{ q: string; resolve: () => void }>;

beforeEach(() => {
  vi.useFakeTimers();
  pending = [];
  vi.stubGlobal(
    "fetch",
    vi.fn((input: string) => {
      const q = new URL(input, "http://portal.test").searchParams.get("q")?.toLowerCase() ?? "";
      const merchants = ALL.filter(
        (m) => m.businessName.toLowerCase().includes(q) || m.ownerEmail!.toLowerCase().includes(q),
      );
      return new Promise((resolve) =>
        pending.push({ q, resolve: () => resolve(new Response(JSON.stringify({ merchants }), { status: 200 })) }),
      );
    }),
  );
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

/** Fires the debounced search and answers the request for `q`. */
async function answer(q: string) {
  await act(async () => {
    vi.advanceTimersByTime(250);
  });
  const request = pending.find((p) => p.q === q);
  expect(request).toBeDefined();
  await act(async () => {
    request!.resolve();
  });
}

const search = () => screen.getByRole("combobox", { name: "Search by business name or owner email" });

describe("Update now merchant picker", () => {
  it("never offers or selects results from an earlier query", async () => {
    render(<UpdateNowWorkspace />);
    fireEvent.focus(search());
    await answer(""); // every merchant listed
    fireEvent.change(search(), { target: { value: "bäckerei" } });

    // The earlier results are not shown or selectable while the new search runs.
    expect(screen.queryByRole("option")).toBeNull();
    expect(screen.getByText("Searching…")).toBeTruthy();
    fireEvent.keyDown(search(), { key: "ArrowDown" });
    fireEvent.keyDown(search(), { key: "Enter" });
    expect(screen.queryByText("fred@mcbuse.example")).toBeNull();

    await answer("bäckerei");
    expect(screen.getAllByRole("option").map((o) => o.textContent)).toEqual([
      "Bäckerei Nord — team@baeckerei.example",
    ]);
    fireEvent.keyDown(search(), { key: "ArrowDown" });
    fireEvent.keyDown(search(), { key: "Enter" });
    expect(screen.getByText("team@baeckerei.example")).toBeTruthy();
    expect(screen.getByText("Up to date")).toBeTruthy();
  });

  it("ignores a response that arrives after a newer query", async () => {
    render(<UpdateNowWorkspace />);
    fireEvent.focus(search());
    fireEvent.change(search(), { target: { value: "fred@" } });
    await act(async () => {
      vi.advanceTimersByTime(250);
    });
    fireEvent.change(search(), { target: { value: "aci" } });
    await answer("aci");
    // The slower "fred@" response lands last and must not replace the newer results.
    await act(async () => {
      pending.find((p) => p.q === "fred@")!.resolve();
    });
    expect(screen.getAllByRole("option").map((o) => o.textContent)).toEqual(["Aci Café — owner@aci.example"]);
  });

  it("keeps the highlighted merchant by identity when moving through the list", async () => {
    render(<UpdateNowWorkspace />);
    fireEvent.focus(search());
    await answer("");
    fireEvent.keyDown(search(), { key: "ArrowDown" });
    fireEvent.keyDown(search(), { key: "ArrowDown" });
    fireEvent.keyDown(search(), { key: "ArrowDown" }); // stays on the last one
    fireEvent.keyDown(search(), { key: "ArrowUp" });
    const selected = screen.getAllByRole("option").filter((o) => o.getAttribute("aria-selected") === "true");
    expect(selected.map((o) => o.textContent)).toEqual(["MCBuse — fred@mcbuse.example"]);
    expect(search().getAttribute("aria-activedescendant")).toMatch(new RegExp(`${MCBUSE.merchantId}$`));
  });
});
