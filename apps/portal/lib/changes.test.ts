import type { ChangeCaseSummary, ChangeStatusResponse } from "@repo/shared";
import { describe, expect, it } from "vitest";
import {
  announcement,
  changeKind,
  changesListPath,
  dateRangeError,
  emptyListCopy,
  filtersFromSearch,
  filtersToSearch,
  formatChangeValue,
  formatDateTime,
  formatPeriod,
  hasActiveFilters,
  isLocalDate,
  pageFromSearch,
  pollInterval,
  processingNotice,
  productReadiness,
  readinessNotices,
  withUnit,
} from "./changes";

const PRODUCT = "5f0c6a52-1c1e-4a57-9d43-3b1c4e1f2a10";

function status(overrides: Partial<ChangeStatusResponse> = {}): ChangeStatusResponse {
  return {
    available: true,
    unavailableReason: null,
    timezone: "Europe/Berlin",
    modelVersion: "change-intelligence-v1",
    cadence: { stockMinutes: 60, trendsDaily: true },
    initialized: true,
    lastSuccessfulAnalysisAt: "2026-10-24T23:00:00.000Z",
    processing: "idle",
    pendingSince: null,
    lastFailureAt: null,
    readiness: {
      trends: "ready",
      requiredHistoryDays: 28,
      daysUntilTrendsReady: 0,
      minUsualWeeklyUnits: 5,
      minBaselineWeeks: 3,
      forecastMinUnits: 14,
      forecastWindowDays: 28,
      products: [],
    },
    recordingGap: false,
    lastRecordedSaleDate: "2026-10-24",
    summary: { activeChanges: 2, productsNeedingStockReview: 1 },
    provenance: { account: "ordinary", includesTestPayments: false },
    ...overrides,
  };
}

const params = (query: string) => new URLSearchParams(query);

describe("URL filters", () => {
  it("defaults to active changes with nothing else set", () => {
    const filters = filtersFromSearch(params(""));
    expect(filters).toEqual({ productId: null, type: null, status: "active", from: null, to: null });
    expect(hasActiveFilters(filters)).toBe(false);
    expect(filtersToSearch(filters)).toBe("");
  });

  it("round-trips every filter through the address", () => {
    const query = `productId=${PRODUCT}&type=stock&status=all&from=2026-10-01&to=2026-10-25`;
    const filters = filtersFromSearch(params(query));
    expect(filters).toEqual({
      productId: PRODUCT,
      type: "stock",
      status: "all",
      from: "2026-10-01",
      to: "2026-10-25",
    });
    expect(hasActiveFilters(filters)).toBe(true);
    expect(filtersToSearch(filters)).toBe(query);
    expect(filtersToSearch(filters, { cursor: "abc", page: 2 })).toBe(`${query}&cursor=abc&page=2`);
  });

  it("drops values the API would reject rather than sending a bad request", () => {
    expect(
      filtersFromSearch(params("productId=nope&type=bogus&status=open&from=2026-02-30&to=26-10-01")),
    ).toEqual({ productId: null, type: null, status: "active", from: null, to: null });
  });

  it("treats a non-default status alone as a filter", () => {
    expect(hasActiveFilters(filtersFromSearch(params("status=resolved")))).toBe(true);
  });

  it("validates calendar dates", () => {
    expect(isLocalDate("2026-10-25")).toBe(true);
    expect(isLocalDate("2026-02-29")).toBe(false);
    expect(isLocalDate("2028-02-29")).toBe(true);
    expect(isLocalDate("2026-13-01")).toBe(false);
  });

  it("refuses reversed or longer-than-a-year ranges before asking the API", () => {
    expect(dateRangeError({ from: "2026-10-10", to: "2026-10-01" })).toMatch(/on or before/);
    expect(dateRangeError({ from: "2025-09-01", to: "2026-09-02" })).toMatch(/one year/);
    expect(dateRangeError({ from: "2025-09-23", to: "2026-09-23" })).toBeNull();
    expect(dateRangeError({ from: "2026-10-01", to: null })).toBeNull();
    expect(changesListPath({ ...filtersFromSearch(params("")), from: "2026-10-10", to: "2026-10-01" }, null)).toBeNull();
  });

  it("builds the list request with 25 per page and the cursor", () => {
    expect(changesListPath(filtersFromSearch(params("")), null)).toBe("me/changes?limit=25");
    expect(changesListPath(filtersFromSearch(params("type=demand&status=resolved")), "c1")).toBe(
      "me/changes?type=demand&status=resolved&limit=25&cursor=c1",
    );
  });

  it("reads the page position", () => {
    expect(pageFromSearch(params(""))).toEqual({ cursor: null, page: 1 });
    expect(pageFromSearch(params("cursor=x&page=3"))).toEqual({ cursor: "x", page: 3 });
    expect(pageFromSearch(params("cursor=x&page=nope"))).toEqual({ cursor: "x", page: 2 });
    expect(pageFromSearch(params("page=4"))).toEqual({ cursor: null, page: 1 });
  });
});

describe("formatting", () => {
  it("states every value with an explicit, correctly pluralised unit", () => {
    expect(formatChangeValue({ key: "recent", label: "", value: 42, unit: "units" })).toBe("42 units");
    expect(formatChangeValue({ key: "recent", label: "", value: 1, unit: "units" })).toBe("1 unit");
    expect(formatChangeValue({ key: "d", label: "", value: 6.04, unit: "days" })).toBe("6 days");
    expect(formatChangeValue({ key: "d", label: "", value: 4.25, unit: "units_per_day" })).toBe("4.3 units per day");
    expect(formatChangeValue({ key: "s", label: "", value: 12_500, unit: "sales" })).toBe("12,500 sales");
    expect(withUnit(1, "weeks")).toBe("1 week");
  });

  it("names risk levels, dates and missing values in merchant language", () => {
    expect(formatChangeValue({ key: "risk", label: "", value: "low_stock", unit: "risk" })).toBe("At or below minimum");
    expect(formatChangeValue({ key: "risk", label: "", value: null, unit: "risk" })).toBe("Not flagged");
    expect(formatChangeValue({ key: "date", label: "", value: "2026-10-31", unit: "local_date" })).toBe("31 Oct 2026");
    expect(
      formatChangeValue({ key: "d", label: "", value: null, unit: "days", reason: "insufficient_units" }),
    ).toBe("Not enough recorded sales");
    expect(formatChangeValue({ key: "d", label: "", value: null, unit: "days" })).toBe("Unavailable");
  });

  it("formats periods and times in the merchant timezone", () => {
    expect(formatPeriod({ from: "2026-10-17", to: "2026-10-23" })).toBe("17–23 Oct 2026");
    // Across months ICU uses thin spaces around the dash; match loosely.
    expect(formatPeriod({ from: "2026-09-28", to: "2026-10-04" })).toMatch(/^28 Sept? – 4 Oct 2026$/);
    expect(formatPeriod({ from: "2025-12-29", to: "2026-01-04" })).toBe("29 Dec 2025 – 4 Jan 2026");
    expect(formatPeriod({ from: "2026-10-23", to: "2026-10-23" })).toBe("23 Oct 2026");
    // 23:00 UTC is 01:00 the next day in Berlin (CEST).
    expect(formatDateTime("2026-10-24T23:00:00.000Z", "Europe/Berlin")).toBe("25 Oct 2026, 01:00");
    expect(formatDateTime("2026-10-24T23:00:00.000Z", "UTC")).toBe("24 Oct 2026, 23:00");
  });
});

describe("change kind", () => {
  const base = { status: "active", after: [] } as unknown as ChangeCaseSummary;
  it("only marks out-of-stock and below-minimum as needing attention", () => {
    const risk = (value: string, s = "active") =>
      changeKind({ ...base, status: s, type: "stock_risk", after: [{ key: "risk", label: "Stock risk", value, unit: "risk" }] } as ChangeCaseSummary);
    expect(risk("out_of_stock")).toEqual({ label: "Out of stock", tone: "warning" });
    expect(risk("low_stock")).toEqual({ label: "At or below minimum", tone: "warning" });
    expect(risk("projected_stock_risk")).toEqual({ label: "May reach minimum soon", tone: "info" });
    expect(risk("out_of_stock", "resolved").tone).toBe("neutral");
    expect(changeKind({ ...base, type: "unit_demand_increase" })).toEqual({ label: "Selling faster", tone: "neutral" });
    expect(changeKind({ ...base, type: "historical_correction" }).tone).toBe("neutral");
  });
});

describe("status copy", () => {
  it("says nothing when processing is idle", () => {
    expect(processingNotice(status())).toBeNull();
  });

  it("describes pending, processing, delayed and failed without percentages", () => {
    expect(processingNotice(status({ processing: "pending" }))?.title).toBe(
      "New records are waiting for the next hourly update.",
    );
    const processing = processingNotice(status({ processing: "processing" }));
    expect(processing?.title).toBe("Updating your changes now.");
    expect(JSON.stringify(processing)).not.toMatch(/%/);
    expect(processingNotice(status({ processing: "delayed" }))?.body).toBe(
      "The results below are from the analysis on 25 Oct 2026, 01:00.",
    );
    const failed = processingNotice(status({ processing: "failed" }));
    expect(failed?.title).toBe("The latest analysis failed.");
    expect(failed?.body).toMatch(/last successful analysis on 25 Oct 2026, 01:00/);
  });

  it("uses the building-baseline copy with numbers from the status", () => {
    const [notice] = readinessNotices(
      status({ readiness: { ...status().readiness, trends: "building_baseline", requiredHistoryDays: 28, daysUntilTrendsReady: 9 } }),
    );
    expect(notice?.title).toBe("Sales trends need 28 days of recorded sales. 9 more days needed.");
  });

  it("names the requirement when product history is insufficient", () => {
    const [notice] = readinessNotices(
      status({ readiness: { ...status().readiness, trends: "insufficient_history", requiredHistoryDays: 28, daysUntilTrendsReady: null } }),
    );
    expect(notice?.body).toMatch(/at least 5 units sold in a usual week/);
  });

  it("uses the recording-gap copy and keeps stock problems visible", () => {
    const notices = readinessNotices(
      status({ recordingGap: true, lastRecordedSaleDate: "2026-10-12", readiness: { ...status().readiness, trends: "recording_gap", requiredHistoryDays: 28, daysUntilTrendsReady: null } }),
    );
    expect(notices).toHaveLength(1);
    expect(notices[0]!.title).toBe("No sales recorded since 12 Oct 2026.");
    expect(notices[0]!.body).toMatch(/^Sales trends and projections resume when new sales are recorded\./);
  });
});

describe("empty list copy never hides a problem", () => {
  it("distinguishes filtered-empty from no detected changes", () => {
    expect(emptyListCopy(status(), true)).toMatchObject({ clearFilters: true, title: "No changes match these filters" });
    expect(emptyListCopy(status(), false)).toMatchObject({
      clearFilters: false,
      description: "No significant changes were detected in your recorded sales.",
    });
  });

  it("does not claim no changes while trends are not assessed, before the first analysis, or after a failure", () => {
    for (const trends of ["building_baseline", "insufficient_history", "recording_gap", "data_quality_blocked"] as const)
      expect(
        emptyListCopy(status({ readiness: { ...status().readiness, trends, requiredHistoryDays: 28, daysUntilTrendsReady: null } }), false).description,
      ).not.toMatch(/No significant changes/);
    expect(emptyListCopy(status({ initialized: false, lastSuccessfulAnalysisAt: null }), false).title).toBe(
      "Your first analysis has not finished yet",
    );
    expect(
      emptyListCopy(status({ initialized: true, processing: "failed", lastSuccessfulAnalysisAt: null }), false).title,
    ).toBe("No results yet");
  });
});

describe("announcements", () => {
  const state = { available: true, processing: "idle" as const, recordingGap: false, offline: false };
  it("is silent on first load and when nothing significant changed", () => {
    expect(announcement(null, state)).toBeNull();
    expect(announcement(state, { ...state })).toBeNull();
    expect(announcement(state, { ...state, processing: "pending" })).toBeNull();
  });

  it("announces significant transitions once", () => {
    expect(announcement(state, { ...state, processing: "processing" })).toBe("Updating your changes.");
    expect(announcement({ ...state, processing: "processing" }, state)).toBe("Changes updated.");
    expect(announcement(state, { ...state, processing: "failed" })).toBe("The latest analysis failed.");
    expect(announcement(state, { ...state, offline: true })).toMatch(/offline/);
    expect(announcement(state, { ...state, recordingGap: true })).toMatch(/No new sales/);
  });
});

describe("poll interval", () => {
  it("is 5 s only while the backend reports processing", () => {
    expect(pollInterval(status({ processing: "processing" }))).toBe(5_000);
    expect(pollInterval(status({ processing: "pending" }))).toBe(60_000);
    expect(pollInterval(null)).toBe(60_000);
  });
});

describe("products not yet assessed (§3.8)", () => {
  const candy = {
    productId: PRODUCT,
    productName: "Coffee Candy",
    trends: "insufficient_history" as const,
    baselineWeeksUsed: 4,
    usualWeeklyUnits: 1,
    daysUntilTrendsReady: null,
    forecast: { available: false, reason: "insufficient_units" as const },
  };
  const readiness = (products: ChangeStatusResponse["readiness"]["products"]) =>
    status({ readiness: { ...status().readiness, products } });

  it("names what is unavailable, the requirement and the weeks the usual level is based on", () => {
    expect(productReadiness(readiness([candy]))).toEqual([
      {
        productId: PRODUCT,
        name: "Coffee Candy",
        lines: [
          "Sales trends unavailable: needs at least 5 units in a usual week (usual is 1 unit).",
          "Stock outlook unavailable: needs at least 14 units sold in the last 28 days.",
        ],
        weeks: "Usual is based on 4 weeks.",
      },
    ]);
  });

  it("explains a product still building its history, with the days left", () => {
    const [loaf] = productReadiness(
      readiness([
        {
          ...candy,
          productName: "Sourdough loaf",
          trends: "building_baseline",
          baselineWeeksUsed: 1,
          usualWeeklyUnits: 28,
          daysUntilTrendsReady: 15,
          forecast: { available: false, reason: "building_baseline" },
        },
      ]),
    );
    expect(loaf!.lines).toEqual([
      "Sales trends unavailable: needs 3 complete weeks of sales history (15 more days).",
      "Stock outlook unavailable: needs 28 days of sales history.",
    ]);
    expect(loaf!.weeks).toBe("Usual is based on 1 week so far.");
  });

  it("omits lines for parts that are available, and weeks when none are complete", () => {
    const [item] = productReadiness(
      readiness([
        { ...candy, trends: "ready", forecast: { available: false, reason: "no_positive_demand" } },
      ]),
    );
    expect(item!.lines).toEqual(["Stock outlook unavailable: no units sold recently."]);
    const [blocked] = productReadiness(
      readiness([
        {
          ...candy,
          trends: "data_quality_blocked",
          baselineWeeksUsed: 0,
          usualWeeklyUnits: null,
          forecast: { available: true, reason: null },
        },
      ]),
    );
    expect(blocked!.lines).toEqual(["Sales trends paused: some recorded sales could not be read."]);
    expect(blocked!.weeks).toBeNull();
  });

  it("lists nothing during a recording gap or when every product is assessed", () => {
    expect(productReadiness(readiness([]))).toEqual([]);
    expect(productReadiness({ ...readiness([candy]), recordingGap: true })).toEqual([]);
  });
});
