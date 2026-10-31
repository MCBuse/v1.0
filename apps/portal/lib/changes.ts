import type {
  CaseResolution,
  ChangeCaseSummary,
  ChangeEvidenceEnvironment,
  ChangeLocalPeriod,
  ChangeStatusResponse,
  ChangeTypeFilter,
  ChangeValue,
  StockRiskLevel,
} from "@repo/shared";

/**
 * Pure helpers for the merchant Changes pages (plan §3): URL filters, the
 * list request, number/date/unit formatting in the merchant timezone, and the
 * choice of status, readiness and empty-state copy. Kept free of React so
 * every rule is unit tested.
 */

// ------------------------------------------------------------------ filters

export const CHANGE_TYPES: ReadonlyArray<{ value: ChangeTypeFilter; label: string }> = [
  { value: "demand", label: "Sales changes" },
  { value: "stock", label: "Stock problems" },
  { value: "threshold", label: "Minimum stock changes" },
  { value: "correction", label: "Sales corrections" },
];

export const CHANGE_STATUSES = [
  { value: "active", label: "Active" },
  { value: "resolved", label: "Resolved" },
  { value: "all", label: "All" },
] as const;
export type ChangeStatusFilter = (typeof CHANGE_STATUSES)[number]["value"];

export type ChangeFilters = {
  productId: string | null;
  type: ChangeTypeFilter | null;
  status: ChangeStatusFilter;
  from: string | null;
  to: string | null;
};

// ------------------------------------------------------------------ list groups

/** The list's sections, in display order. Stock and sales trends are analysed at different paces. */
export const CHANGE_GROUPS = [
  { id: "stock", title: "Stock", cadence: "Updates hourly" },
  { id: "sales", title: "Sales trends", cadence: "Updates daily" },
  { id: "corrections", title: "Corrections to earlier sales", cadence: null },
] as const;
export type ChangeGroupId = (typeof CHANGE_GROUPS)[number]["id"];

const GROUP_OF: Record<ChangeCaseSummary["type"], ChangeGroupId> = {
  stock_risk: "stock",
  stock_threshold_change: "stock",
  unit_demand_increase: "sales",
  unit_demand_decrease: "sales",
  transaction_velocity_increase: "sales",
  transaction_velocity_decrease: "sales",
  historical_correction: "corrections",
};
export const changeGroup = (type: ChangeCaseSummary["type"]): ChangeGroupId => GROUP_OF[type];

/**
 * The header's one-sentence summary as [count, words] pairs, so the page can
 * set each count in mono. Saved counts only; nothing is derived. Empty = none.
 */
export function summaryCounts(summary: ChangeStatusResponse["summary"]): Array<[number, string]> {
  const parts: Array<[number, string]> = [];
  if (summary.activeChanges)
    parts.push([summary.activeChanges, summary.activeChanges === 1 ? "active change." : "active changes."]);
  if (summary.productsNeedingStockReview)
    parts.push([
      summary.productsNeedingStockReview,
      summary.productsNeedingStockReview === 1
        ? "product needs a stock review."
        : "products need a stock review.",
    ]);
  return parts;
}

export const DEFAULT_RANGE_DAYS = 30;
export const MAX_RANGE_DAYS = 366;
export const PAGE_SIZE = 25;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const DATE = /^\d{4}-\d{2}-\d{2}$/;

export const isUuid = (value: string | null | undefined): value is string =>
  typeof value === "string" && UUID.test(value);

/** A real calendar date in `YYYY-MM-DD` form (rejects 2026-02-30). */
export function isLocalDate(value: string | null | undefined): value is string {
  if (typeof value !== "string" || !DATE.test(value)) return false;
  const date = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

/** Reads filters from the address, dropping anything the API would reject. */
export function filtersFromSearch(search: URLSearchParams): ChangeFilters {
  const type = search.get("type");
  const status = search.get("status");
  const from = search.get("from");
  const to = search.get("to");
  return {
    productId: isUuid(search.get("productId")) ? search.get("productId") : null,
    type: CHANGE_TYPES.some((option) => option.value === type)
      ? (type as ChangeTypeFilter)
      : null,
    status: CHANGE_STATUSES.some((option) => option.value === status)
      ? (status as ChangeStatusFilter)
      : "active",
    from: isLocalDate(from) ? from : null,
    to: isLocalDate(to) ? to : null,
  };
}

export const hasActiveFilters = (filters: ChangeFilters) =>
  Boolean(
    filters.productId ||
      filters.type ||
      filters.from ||
      filters.to ||
      filters.status !== "active",
  );

const dayNumber = (date: string) =>
  Math.round(new Date(`${date}T00:00:00.000Z`).getTime() / 86_400_000);

/** Merchant-facing problem with the chosen dates, or null when they can be sent. */
export function dateRangeError(filters: Pick<ChangeFilters, "from" | "to">): string | null {
  if (!filters.from || !filters.to) return null;
  const days = dayNumber(filters.to) - dayNumber(filters.from) + 1;
  if (days < 1) return "The start date must be on or before the end date.";
  if (days > MAX_RANGE_DAYS) return "Choose a date range of one year or less.";
  return null;
}

/** The address query for a set of filters plus an optional page position. */
export function filtersToSearch(
  filters: ChangeFilters,
  page?: { cursor: string; page: number } | null,
): string {
  const params = new URLSearchParams();
  if (filters.productId) params.set("productId", filters.productId);
  if (filters.type) params.set("type", filters.type);
  if (filters.status !== "active") params.set("status", filters.status);
  if (filters.from) params.set("from", filters.from);
  if (filters.to) params.set("to", filters.to);
  if (page) {
    params.set("cursor", page.cursor);
    params.set("page", String(page.page));
  }
  return params.toString();
}

/** The list request for the current address; null while the dates are invalid. */
export function changesListPath(filters: ChangeFilters, cursor: string | null): string | null {
  if (dateRangeError(filters)) return null;
  const params = new URLSearchParams(filtersToSearch(filters));
  params.set("limit", String(PAGE_SIZE));
  if (cursor) params.set("cursor", cursor);
  return `me/changes?${params.toString()}`;
}

/** The page position in the address: `cursor` plus a 1-based page number for display. */
export function pageFromSearch(search: URLSearchParams): { cursor: string | null; page: number } {
  const cursor = search.get("cursor");
  if (!cursor) return { cursor: null, page: 1 };
  const page = Number(search.get("page"));
  return { cursor, page: Number.isInteger(page) && page > 1 ? page : 2 };
}

// --------------------------------------------------------------- formatting

const numberFormat = new Intl.NumberFormat("en-GB", { maximumFractionDigits: 1 });
export const formatCount = (value: number) => numberFormat.format(value);

const UNIT_WORDS: Record<"units" | "sales" | "days" | "weeks" | "units_per_day", [string, string]> = {
  units: ["unit", "units"],
  sales: ["sale", "sales"],
  days: ["day", "days"],
  weeks: ["week", "weeks"],
  units_per_day: ["unit per day", "units per day"],
};

export function withUnit(value: number, unit: keyof typeof UNIT_WORDS): string {
  const [one, many] = UNIT_WORDS[unit];
  return `${formatCount(value)} ${value === 1 ? one : many}`;
}

export const RISK_LABELS: Record<StockRiskLevel, string> = {
  out_of_stock: "Out of stock",
  low_stock: "At or below minimum",
  projected_stock_risk: "May reach minimum soon",
  forecast_unavailable: "Outlook unavailable",
  normal: "Normal",
};

const UNAVAILABLE_REASONS: Record<NonNullable<ChangeValue["reason"]>, string> = {
  building_baseline: "Not available yet",
  insufficient_units: "Not enough recorded sales",
  no_recent_activity: "No recent sales",
  no_positive_demand: "No recent demand",
  data_quality_blocked: "Unavailable",
};

const shortDate = new Intl.DateTimeFormat("en-GB", {
  day: "numeric",
  month: "short",
  year: "numeric",
  timeZone: "UTC",
});

const utcDay = (date: string) => new Date(`${date}T00:00:00.000Z`);

/** A merchant-local calendar date (`YYYY-MM-DD`), e.g. "23 Oct 2026". */
export const formatLocalDate = (date: string) => shortDate.format(utcDay(date));

const dayMonth = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", timeZone: "UTC" });

/**
 * A merchant-local period, e.g. "17–23 Oct 2026" or "28 Sept – 4 Oct 2026".
 * Built by hand so every browser shows the same spacing.
 */
export function formatPeriod(period: ChangeLocalPeriod): string {
  if (period.from === period.to) return formatLocalDate(period.from);
  const [fy, fm] = period.from.split("-");
  const [ty, tm] = period.to.split("-");
  if (fy !== ty) return `${formatLocalDate(period.from)} – ${formatLocalDate(period.to)}`;
  if (fm !== tm) return `${dayMonth.format(utcDay(period.from))} – ${formatLocalDate(period.to)}`;
  return `${Number(period.from.slice(8))}–${formatLocalDate(period.to)}`;
}

/** A moment in the merchant timezone, e.g. "24 Oct 2026, 01:00". */
export function formatDateTime(iso: string, timeZone: string): string {
  return new Intl.DateTimeFormat("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    timeZone,
  }).format(new Date(iso));
}

/** One saved value with its unit, exactly as the backend stored it (rounded for display only). */
export function formatChangeValue(value: ChangeValue): string {
  if (value.value === null) {
    if (value.unit === "risk") return "Not flagged";
    return value.reason ? UNAVAILABLE_REASONS[value.reason] : "Unavailable";
  }
  if (value.unit === "risk")
    return RISK_LABELS[value.value as StockRiskLevel] ?? String(value.value);
  if (value.unit === "local_date")
    return isLocalDate(String(value.value)) ? formatLocalDate(String(value.value)) : String(value.value);
  if (typeof value.value === "string") return value.value;
  return withUnit(value.value, value.unit);
}

// -------------------------------------------------------------- case labels

export type Tone = "neutral" | "info" | "success" | "warning" | "danger";

/** The short label and tone for what kind of change an entry is. Only stock problems are amber. */
export function changeKind(change: ChangeCaseSummary): { label: string; tone: Tone } {
  switch (change.type) {
    case "stock_risk": {
      const risk = change.after.find((value) => value.unit === "risk")?.value as
        | StockRiskLevel
        | null
        | undefined;
      const label = risk ? RISK_LABELS[risk] : "Stock";
      if (change.status === "resolved") return { label, tone: "neutral" };
      return {
        label,
        tone: risk === "out_of_stock" || risk === "low_stock" ? "warning" : "info",
      };
    }
    case "unit_demand_increase":
      return { label: "Selling faster", tone: "neutral" };
    case "unit_demand_decrease":
      return { label: "Selling slower", tone: "neutral" };
    case "transaction_velocity_increase":
      return { label: "Bought more often", tone: "neutral" };
    case "transaction_velocity_decrease":
      return { label: "Bought less often", tone: "neutral" };
    case "stock_threshold_change":
      return { label: "Minimum stock changed", tone: "neutral" };
    case "historical_correction":
      return { label: "Sales corrected", tone: "neutral" };
  }
}

export const RESOLUTION_LABELS: Record<CaseResolution, string> = {
  returned_to_usual: "Back to usual",
  no_longer_detected: "No longer detected",
  no_longer_assessable: "Could not be re-checked",
  direction_reversed: "Changed direction",
  stock_normal: "Stock back to normal",
  product_archived: "Product archived",
};

export const ENVIRONMENT_LABELS: Record<ChangeEvidenceEnvironment, string> = {
  live: "Live payments",
  test: "Test payments",
  synthetic: "Generated sample payments",
  unknown: "Payments of unknown type",
};

// --------------------------------------------------------- status and copy

export type Notice = {
  id: string;
  tone: Tone;
  title: string;
  body?: string;
};

/**
 * The processing line under the header: pending, processing, delayed,
 * failed. Null when nothing is out of the ordinary. Never a percentage.
 */
export function processingNotice(status: ChangeStatusResponse): Notice | null {
  const tz = status.timezone;
  const last = status.lastSuccessfulAnalysisAt
    ? formatDateTime(status.lastSuccessfulAnalysisAt, tz)
    : null;
  switch (status.processing) {
    case "pending":
      return {
        id: "pending",
        tone: "neutral",
        title: "New records are waiting for the next hourly update.",
      };
    case "processing":
      return {
        id: "processing",
        tone: "info",
        title: "Updating your changes now.",
        body: "The results below are from the last completed analysis until the update finishes.",
      };
    case "delayed":
      return {
        id: "delayed",
        tone: "warning",
        title: "The latest update is taking longer than usual.",
        body: last
          ? `The results below are from the analysis on ${last}.`
          : "Results will appear when the first analysis completes.",
      };
    case "failed":
      return {
        id: "failed",
        tone: "danger",
        title: "The latest analysis failed.",
        body: last
          ? `The results below are from the last successful analysis on ${last}. The analysis runs again at the next update.`
          : "No results are available yet. The analysis runs again at the next update.",
      };
    default:
      return null;
  }
}

/** Why sales trends may be missing (§3.8). Stock problems are always still checked. */
export function readinessNotices(status: ChangeStatusResponse): Notice[] {
  const notices: Notice[] = [];
  if (status.recordingGap) {
    notices.push({
      id: "recording-gap",
      tone: "warning",
      title: status.lastRecordedSaleDate
        ? `No sales recorded since ${formatLocalDate(status.lastRecordedSaleDate)}.`
        : "No recent sales have been recorded.",
      body: "Sales trends and projections resume when new sales are recorded. Current stock problems are still shown.",
    });
    return notices;
  }
  const { trends, requiredHistoryDays, daysUntilTrendsReady, minUsualWeeklyUnits } =
    status.readiness;
  if (trends === "building_baseline") {
    notices.push({
      id: "building-baseline",
      tone: "info",
      title: `Sales trends need ${requiredHistoryDays} days of recorded sales.${
        daysUntilTrendsReady
          ? ` ${formatCount(daysUntilTrendsReady)} more ${daysUntilTrendsReady === 1 ? "day" : "days"} needed.`
          : ""
      }`,
      body: "Stock problems are already checked and shown below.",
    });
  } else if (trends === "insufficient_history") {
    notices.push({
      id: "insufficient-history",
      tone: "info",
      title: "Sales trends are not available for your products yet.",
      body: `A product needs at least ${withUnit(minUsualWeeklyUnits, "units")} sold in a usual week before changes in its sales can be detected. Stock problems are still shown.`,
    });
  } else if (trends === "data_quality_blocked") {
    notices.push({
      id: "data-quality",
      tone: "warning",
      title: "Sales trends are paused.",
      body: "Some recorded sales could not be read, so they are not compared with usual sales. Stock problems are still shown.",
    });
  }
  return notices;
}

export type ProductReadinessItem = {
  productId: string;
  name: string;
  /** What is unavailable and what it needs, one line each. */
  lines: string[];
  /** "Usual is based on N weeks." when at least one week is complete. */
  weeks: string | null;
};

/**
 * Products whose sales trends or stock outlook are not yet assessed (§3.8):
 * what is unavailable and the requirement. A recording gap is explained once
 * by its own notice, so no per-product lines are shown then.
 */
export function productReadiness(status: ChangeStatusResponse): ProductReadinessItem[] {
  if (status.recordingGap) return [];
  const { products, minUsualWeeklyUnits, minBaselineWeeks, forecastMinUnits, forecastWindowDays } =
    status.readiness;
  // An API from before per-product readiness sends no list during a rollout.
  return (products ?? []).map((product) => {
    const lines: string[] = [];
    if (product.trends === "insufficient_history")
      lines.push(
        `Sales trends unavailable: needs at least ${withUnit(minUsualWeeklyUnits, "units")} in a usual week${
          product.usualWeeklyUnits !== null ? ` (usual is ${withUnit(product.usualWeeklyUnits, "units")})` : ""
        }.`,
      );
    else if (product.trends === "building_baseline")
      lines.push(
        `Sales trends unavailable: needs ${formatCount(minBaselineWeeks)} complete weeks of sales history${
          product.daysUntilTrendsReady
            ? ` (${formatCount(product.daysUntilTrendsReady)} more ${product.daysUntilTrendsReady === 1 ? "day" : "days"})`
            : ""
        }.`,
      );
    else if (product.trends === "data_quality_blocked")
      lines.push("Sales trends paused: some recorded sales could not be read.");
    const window = withUnit(forecastWindowDays, "days");
    const forecast: Partial<Record<NonNullable<typeof product.forecast.reason>, string>> = {
      insufficient_units: `Stock outlook unavailable: needs at least ${withUnit(forecastMinUnits, "units")} sold in the last ${window}.`,
      building_baseline: `Stock outlook unavailable: needs ${window} of sales history.`,
      no_positive_demand: "Stock outlook unavailable: no units sold recently.",
      data_quality_blocked: "Stock outlook paused: some recorded sales could not be read.",
    };
    const line = product.forecast.reason ? forecast[product.forecast.reason] : undefined;
    if (line) lines.push(line);
    const weeks = product.baselineWeeksUsed;
    return {
      productId: product.productId,
      name: product.productName,
      lines,
      weeks: weeks
        ? `Usual is based on ${withUnit(weeks, "weeks")}${product.trends === "building_baseline" ? " so far" : ""}.`
        : null,
    };
  });
}

/**
 * Copy for an empty list. A filtered view says so and offers Clear filters;
 * an unfiltered one never claims "no changes" when trends were not assessed.
 */
export function emptyListCopy(
  status: ChangeStatusResponse | null,
  filtered: boolean,
): { title: string; description: string; clearFilters: boolean } {
  if (filtered)
    return {
      title: "No changes match these filters",
      description: "Try a different product, type, status or date range, or clear the filters.",
      clearFilters: true,
    };
  if (status && !status.initialized && !status.lastSuccessfulAnalysisAt)
    return {
      title: "Your first analysis has not finished yet",
      description: "Changes appear here once your recorded sales and stock have been analysed.",
      clearFilters: false,
    };
  if (status && status.processing === "failed" && !status.lastSuccessfulAnalysisAt)
    return {
      title: "No results yet",
      description: "The analysis could not be completed. It runs again at the next update.",
      clearFilters: false,
    };
  if (!status || status.readiness.trends === "ready")
    return {
      title: "No significant changes",
      description: "No significant changes were detected in your recorded sales.",
      clearFilters: false,
    };
  return {
    title: "No stock problems need attention",
    description: "Sales trends are not assessed yet. The note above explains why.",
    clearFilters: false,
  };
}

/** What the screen reader hears when the status changes in a way that matters. */
export type AnnounceState = {
  available: boolean;
  processing: ChangeStatusResponse["processing"];
  recordingGap: boolean;
  offline: boolean;
};

export function announcement(previous: AnnounceState | null, next: AnnounceState): string | null {
  if (!previous) return null;
  if (previous.offline !== next.offline)
    return next.offline
      ? "You are offline. Showing the information that was last loaded."
      : "Connection restored.";
  if (previous.available !== next.available)
    return next.available ? "Changes are available." : "Changes are unavailable.";
  if (previous.processing !== next.processing) {
    if (next.processing === "processing") return "Updating your changes.";
    if (next.processing === "failed") return "The latest analysis failed.";
    if (next.processing === "delayed") return "The latest update is delayed.";
    if (previous.processing === "processing" && next.processing === "idle")
      return "Changes updated.";
  }
  if (previous.recordingGap !== next.recordingGap)
    return next.recordingGap
      ? "No new sales have been recorded recently."
      : "New sales recorded. Sales trends resume.";
  return null;
}

/** Background refresh pace (§3.10): every 5 s while the backend reports active processing, else 60 s. */
export const pollInterval = (status: ChangeStatusResponse | null) =>
  status?.processing === "processing" ? 5_000 : 60_000;
