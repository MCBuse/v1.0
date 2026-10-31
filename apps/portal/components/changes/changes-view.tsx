"use client";

import type {
  ChangeListResponse,
  ChangeStatusResponse,
  ChangeTypeFilter,
  MerchantProductPage,
} from "@repo/shared";
import { Badge } from "@repo/ui/badge";
import { Button } from "@repo/ui/button";
import { Card } from "@repo/ui/card";
import { EmptyState } from "@repo/ui/empty-state";
import { Input } from "@repo/ui/field";
import { Skeleton } from "@repo/ui/skeleton";
import { CalendarDays, ChevronDown, ChevronLeft, ChevronRight, RefreshCw, X } from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { AnalyticsNav } from "@/components/analytics-nav";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import {
  CHANGE_GROUPS,
  CHANGE_STATUSES,
  CHANGE_TYPES,
  DEFAULT_RANGE_DAYS,
  announcement,
  changeGroup,
  changesListPath,
  dateRangeError,
  emptyListCopy,
  filtersFromSearch,
  filtersToSearch,
  formatCount,
  formatDateTime,
  formatLocalDate,
  hasActiveFilters,
  pageFromSearch,
  pollInterval,
  processingNotice,
  productReadiness,
  readinessNotices,
  summaryCounts,
  type AnnounceState,
  type ChangeFilters,
} from "@/lib/changes";
import { usePolledResource } from "@/lib/client/use-polled-resource";
import { ChangeEntry, LEDGER_COLUMNS, NoticeBox } from "./change-parts";

const ALL = "all";

/** Status for both Changes pages: polled at the §3.10 pace, with the significant-change announcement. */
export function useChangeStatus() {
  const [pace, setPace] = useState(60_000);
  const status = usePolledResource<ChangeStatusResponse>("me/changes/status", pace);
  const next = pollInterval(status.data);
  useEffect(() => setPace(next), [next]);

  const unavailable =
    status.data?.available === false || (!status.data && status.errorStatus === 404);

  const [message, setMessage] = useState("");
  const previous = useRef<AnnounceState | null>(null);
  const current: AnnounceState | null = status.data
    ? {
        available: status.data.available,
        processing: status.data.processing,
        recordingGap: status.data.recordingGap,
        offline: status.offline,
      }
    : null;
  const key = current ? JSON.stringify(current) : null;
  useEffect(() => {
    if (!current) return;
    const text = announcement(previous.current, current);
    previous.current = current;
    if (text) setMessage(text);
    // `key` captures every field of `current`.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  return { ...status, unavailable, announcement: message };
}

export function ChangesHeader({
  status,
  onRefresh,
  refreshing,
}: {
  status: ChangeStatusResponse | null;
  onRefresh?: () => void;
  refreshing?: boolean;
}) {
  const counts = status ? summaryCounts(status.summary) : null;
  return (
    <div className="grid gap-2">
      <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-3">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
          <h1 className="text-3xl font-semibold tracking-tight text-slate-950">Changes</h1>
          {status?.provenance.account === "sample" ? (
            <Badge tone="neutral" title="This account holds sample records, not a trading business's sales.">
              Sample account
            </Badge>
          ) : null}
        </div>
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
          {status ? (
            <p className="text-xs text-slate-500">
              {status.lastSuccessfulAnalysisAt ? (
                <>
                  Analysed{" "}
                  <time dateTime={status.lastSuccessfulAnalysisAt} className="font-mono text-slate-700">
                    {formatDateTime(status.lastSuccessfulAnalysisAt, status.timezone)}
                  </time>
                </>
              ) : (
                "Not analysed yet"
              )}
            </p>
          ) : null}
          {onRefresh ? (
            <Button variant="secondary" onClick={onRefresh} aria-busy={refreshing}>
              <RefreshCw className="size-4" aria-hidden="true" />
              Refresh
            </Button>
          ) : null}
        </div>
      </div>
      {counts === null ? (
        onRefresh ? <Skeleton className="h-6 w-80 max-w-full" /> : null
      ) : (
        <p data-summary className="text-base text-slate-600">
          {counts.length
            ? counts.map(([count, words], index) => (
                <span key={words}>
                  {index ? " " : null}
                  <span className="font-mono font-semibold text-slate-950">{formatCount(count)}</span> {words}
                </span>
              ))
            : "No active changes."}
        </p>
      )}
    </div>
  );
}

export function ChangesUnavailable({ status }: { status: ChangeStatusResponse | null }) {
  return (
    <Card>
      <EmptyState
        title={
          status?.unavailableReason === "disabled"
            ? "Change Intelligence is temporarily unavailable"
            : "Change Intelligence is not available for this account"
        }
        description="Your sales and stock records are not affected. General and Deep analytics remain available."
        action={
          <Button asChild variant="secondary">
            <Link href="/analytics/general">Open General analytics</Link>
          </Button>
        }
      />
    </Card>
  );
}

function ListSkeleton() {
  return (
    <div aria-hidden="true" className="overflow-hidden rounded-lg border border-slate-200 bg-white">
      <div className="border-b border-slate-200 bg-slate-50 px-4 py-2.5 sm:px-5">
        <Skeleton className="h-4 w-24" />
      </div>
      <div className="divide-y divide-slate-100">
        {[0, 1, 2, 3].map((row) => (
          <div key={row} className={`grid grid-cols-[minmax(0,1fr)_auto] gap-x-6 px-4 py-4 sm:px-5 ${LEDGER_COLUMNS}`}>
            <Skeleton className="h-4 w-2/3" />
            <Skeleton className="hidden h-4 w-20 justify-self-end sm:block" />
            <Skeleton className="hidden h-4 w-20 justify-self-end sm:block" />
            <Skeleton className="h-4 w-16 justify-self-end" />
          </div>
        ))}
      </div>
    </div>
  );
}

function rangeCaption(filters: ChangeFilters) {
  const { from, to, status } = filters;
  if (from && to) return `Showing changes updated ${formatLocalDate(from)} to ${formatLocalDate(to)}.`;
  if (from) return `Showing changes updated from ${formatLocalDate(from)}.`;
  if (to) return `Showing changes updated up to ${formatLocalDate(to)}.`;
  return status === "active"
    ? "Showing every active change, most important first."
    : `Showing changes updated in the last ${DEFAULT_RANGE_DAYS} days, most recent first.`;
}

/**
 * The Changes page (plan §3.3). Everything shown is a saved backend result;
 * filters and the page position live in the address, and the background
 * refresh only swaps data in place, so filters and scroll survive it.
 */
export function ChangesView() {
  const router = useRouter();
  const pathname = usePathname();
  const search = useSearchParams();
  const filters = useMemo(() => filtersFromSearch(new URLSearchParams(search.toString())), [search]);
  const position = pageFromSearch(new URLSearchParams(search.toString()));
  const filtered = hasActiveFilters(filters);
  const rangeError = dateRangeError(filters);

  const status = useChangeStatus();
  const interval = pollInterval(status.data);
  const path = status.unavailable ? null : changesListPath(filters, position.cursor);
  const list = usePolledResource<ChangeListResponse>(path, interval);
  const products = usePolledResource<MerchantProductPage>(
    status.unavailable ? null : "me/products?status=all&source=all&pageSize=100",
    300_000,
  );

  /** Earlier cursors visited this session, so Previous can step back. */
  const [history, setHistory] = useState<Array<string | null>>([]);
  const listHeading = useRef<HTMLHeadingElement>(null);

  function go(next: ChangeFilters, page: { cursor: string; page: number } | null, mode: "push" | "replace") {
    const query = filtersToSearch(next, page);
    const url = `${pathname}${query ? `?${query}` : ""}`;
    if (mode === "push") router.push(url, { scroll: false });
    else router.replace(url, { scroll: false });
  }
  /** Filters as last requested: two quick edits must not overwrite each other before the address updates. */
  const latestFilters = useRef(filters);
  useEffect(() => {
    latestFilters.current = filters;
  }, [filters]);
  function setFilter(patch: Partial<ChangeFilters>) {
    setHistory([]);
    latestFilters.current = { ...latestFilters.current, ...patch };
    go(latestFilters.current, null, "replace");
  }
  function turnPage(cursor: string | null, page: number) {
    go(filters, cursor ? { cursor, page } : null, "push");
    listHeading.current?.focus({ preventScroll: true });
    listHeading.current?.scrollIntoView({ block: "start" });
  }

  const refreshing = list.loading || status.loading;
  const refreshAll = () => {
    void status.refresh();
    void list.refresh();
  };

  const statusData = status.data;
  const listData = list.data;
  const stale = Boolean(listData) && list.dataPath !== path;
  const offline = status.offline || list.offline;

  const notices = [
    ...(statusData ? [processingNotice(statusData)].filter((n) => n !== null) : []),
    ...(statusData ? readinessNotices(statusData) : []),
  ];

  const productOptions = products.data?.items ?? [];
  const selectedProductMissing =
    filters.productId && !productOptions.some((product) => product.id === filters.productId);
  const listTitle =
    filters.status === "active" ? "Active changes" : filters.status === "resolved" ? "Resolved changes" : "All changes";

  return (
    <div className="grid min-w-0 gap-6 [&>*]:min-w-0">
      <ChangesHeader status={statusData} onRefresh={status.unavailable ? undefined : refreshAll} refreshing={refreshing} />
      <AnalyticsNav />
      <p className="sr-only" aria-live="polite" aria-atomic="true">
        {status.announcement}
      </p>

      {status.unavailable ? (
        <ChangesUnavailable status={statusData} />
      ) : (
        <>
          {offline ? (
            <NoticeBox
              notice={{
                id: "offline",
                tone: "warning",
                title: "You appear to be offline.",
                body: "The information below is what was last loaded. It updates when the connection returns.",
              }}
            />
          ) : null}
          {!statusData && status.error && !offline ? (
            <NoticeBox
              notice={{
                id: "status-failed",
                tone: "warning",
                title: "The analysis status could not be loaded.",
                body: "Changes below may still be shown; their update time is unknown until the status loads.",
              }}
              action={<RetryButton onClick={() => void status.refresh()} />}
            />
          ) : null}
          {notices.map((notice) => (
            <NoticeBox key={notice.id} notice={notice} />
          ))}

          <section aria-labelledby="changes-list" className="grid gap-3">
            <h2
              id="changes-list"
              ref={listHeading}
              tabIndex={-1}
              className="sr-only scroll-mt-28 focus:outline-none"
            >
              {listTitle}
            </h2>

            <div role="group" aria-label="Change filters" className="flex flex-wrap items-center gap-2">
              <ToggleGroup
                type="single"
                aria-label="Status"
                value={filters.status}
                onValueChange={(value) => {
                  if (value) setFilter({ status: value as ChangeFilters["status"] });
                }}
                className="h-auto p-0"
              >
                {CHANGE_STATUSES.map((option) => (
                  <ToggleGroupItem
                    key={option.value}
                    value={option.value}
                    className="min-h-11 min-w-11 data-[state=on]:text-blue-700"
                  >
                    {option.label}
                  </ToggleGroupItem>
                ))}
              </ToggleGroup>
              <div className="flex w-full flex-wrap gap-2 sm:ml-auto sm:w-auto">
                <Select
                  value={filters.productId ?? ALL}
                  onValueChange={(value) => setFilter({ productId: value === ALL ? null : value })}
                >
                  <SelectTrigger className="h-11 min-w-0 basis-full sm:max-w-64 sm:basis-auto" aria-label="Product">
                    <span className="text-slate-500">Product</span>
                    <span className="min-w-0 truncate">
                      <SelectValue />
                    </span>
                  </SelectTrigger>
                  <SelectContent className="max-h-80">
                    <SelectItem value={ALL}>All products</SelectItem>
                    {selectedProductMissing ? (
                      <SelectItem value={filters.productId!}>Selected product</SelectItem>
                    ) : null}
                    {productOptions.map((product) => (
                      <SelectItem key={product.id} value={product.id}>
                        {product.name}
                        {product.status === "archived" ? " (archived)" : ""}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Select
                  value={filters.type ?? ALL}
                  onValueChange={(value) =>
                    setFilter({ type: value === ALL ? null : (value as ChangeTypeFilter) })
                  }
                >
                  <SelectTrigger className="h-11 min-w-0 flex-1 sm:flex-none" aria-label="Change type">
                    <span className="text-slate-500">Type</span>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={ALL}>All types</SelectItem>
                    {CHANGE_TYPES.map((type) => (
                      <SelectItem key={type.value} value={type.value}>
                        {type.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Popover>
                  <PopoverTrigger asChild>
                    <Button variant="secondary" className="h-11 font-normal">
                      <CalendarDays className="size-4 text-slate-500" aria-hidden="true" />
                      {filters.from || filters.to ? (
                        <span className="font-mono text-xs">
                          {filters.from ? formatLocalDate(filters.from) : "…"} – {filters.to ? formatLocalDate(filters.to) : "…"}
                        </span>
                      ) : (
                        "Dates"
                      )}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="grid w-64 gap-3">
                    <label className="grid gap-1 text-xs text-slate-500">
                      From
                      <Input
                        type="date"
                        value={filters.from ?? ""}
                        max={filters.to ?? undefined}
                        onChange={(event) => setFilter({ from: event.target.value || null })}
                      />
                    </label>
                    <label className="grid gap-1 text-xs text-slate-500">
                      To
                      <Input
                        type="date"
                        value={filters.to ?? ""}
                        min={filters.from ?? undefined}
                        onChange={(event) => setFilter({ to: event.target.value || null })}
                      />
                    </label>
                  </PopoverContent>
                </Popover>
                {filtered ? (
                  <Button
                    variant="ghost"
                    className="h-11"
                    onClick={() => {
                      setHistory([]);
                      router.replace(pathname, { scroll: false });
                    }}
                  >
                    Clear filters
                    <X className="size-4" aria-hidden="true" />
                  </Button>
                ) : null}
              </div>
            </div>
            {rangeError ? (
              <p className="text-sm font-medium text-red-700" role="alert">
                {rangeError}
              </p>
            ) : (
              <p className="text-xs text-slate-500">{rangeCaption(filters)}</p>
            )}

            {list.error && listData && !offline ? (
              <NoticeBox
                notice={{
                  id: "list-refresh-failed",
                  tone: "warning",
                  title: "The latest refresh failed.",
                  body: "These are the changes that last loaded.",
                }}
                action={<RetryButton onClick={() => void list.refresh()} />}
              />
            ) : null}

            {!listData && list.error ? (
              <Card>
                <EmptyState
                  title="Changes could not be loaded"
                  description={
                    list.offline
                      ? "You appear to be offline. Changes load when the connection returns. This is a connection problem, not a finding that nothing changed."
                      : "This is a problem reading your changes, not a finding that nothing changed."
                  }
                  action={<RetryButton onClick={() => void list.refresh()} />}
                />
              </Card>
            ) : !listData ? (
              rangeError ? null : <ListSkeleton />
            ) : (
              <ChangeList
                data={listData}
                stale={stale}
                copy={emptyListCopy(statusData, filtered)}
                onClear={() => router.replace(pathname, { scroll: false })}
                page={position.page}
                hasPrevious={position.cursor !== null}
                onPrevious={() => {
                  const previous = history.at(-1);
                  setHistory(history.slice(0, -1));
                  turnPage(previous ?? null, previous ? position.page - 1 : 1);
                }}
                previousLabel={history.length || position.page <= 2 ? "Previous" : "First page"}
                onNext={() => {
                  if (!listData.nextCursor) return;
                  setHistory([...history, position.cursor]);
                  turnPage(listData.nextCursor, position.page + 1);
                }}
              />
            )}
          </section>

          {statusData ? <ProductsNotAssessed status={statusData} /> : null}
        </>
      )}
    </div>
  );
}

/** §3.8: quiet, collapsed list of products whose trends or stock outlook are not yet assessed. */
function ProductsNotAssessed({ status }: { status: ChangeStatusResponse }) {
  const items = productReadiness(status);
  if (!items.length) return null;
  return (
    <details className="group overflow-hidden rounded-lg border border-slate-200 bg-white">
      <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between gap-3 bg-slate-50 px-4 py-2.5 text-sm font-semibold text-slate-950 sm:px-5 [&::-webkit-details-marker]:hidden">
        <span>
          Products not yet assessed{" "}
          <span className="font-mono font-normal text-slate-500">{formatCount(items.length)}</span>
        </span>
        <ChevronDown className="size-4 shrink-0 text-slate-400 transition-transform group-open:rotate-180" aria-hidden="true" />
      </summary>
      <ul className="divide-y divide-slate-100 border-t border-slate-200">
        {items.map((item) => (
          <li key={item.productId} className="grid gap-1 px-4 py-3 text-sm sm:px-5">
            <p className="font-medium text-slate-900 [overflow-wrap:anywhere]">{item.name}</p>
            {item.lines.map((line) => (
              <p key={line} className="text-slate-600">
                {line}
              </p>
            ))}
            {item.weeks ? <p className="text-slate-500">{item.weeks}</p> : null}
          </li>
        ))}
      </ul>
    </details>
  );
}

function RetryButton({ onClick }: { onClick: () => void }) {
  return (
    <Button variant="secondary" onClick={onClick}>
      <RefreshCw className="size-4" aria-hidden="true" />
      Try again
    </Button>
  );
}

function ChangeList({
  data,
  stale,
  copy,
  onClear,
  page,
  hasPrevious,
  previousLabel,
  onPrevious,
  onNext,
}: {
  data: ChangeListResponse;
  stale: boolean;
  copy: ReturnType<typeof emptyListCopy>;
  onClear: () => void;
  page: number;
  hasPrevious: boolean;
  previousLabel: string;
  onPrevious: () => void;
  onNext: () => void;
}) {
  if (!data.items.length && !hasPrevious)
    return (
      <Card aria-busy={stale} className={stale ? "opacity-60 transition-opacity" : ""}>
        <EmptyState
          title={copy.title}
          description={copy.description}
          action={
            copy.clearFilters ? (
              <Button variant="secondary" onClick={onClear}>
                Clear filters
              </Button>
            ) : undefined
          }
        />
      </Card>
    );
  const groups = CHANGE_GROUPS.map((group) => ({
    ...group,
    items: data.items.filter((change) => changeGroup(change.type) === group.id),
  })).filter((group) => group.items.length);
  return (
    <div
      aria-busy={stale}
      className={`overflow-hidden rounded-lg border border-slate-200 bg-white motion-safe:transition-opacity ${stale ? "opacity-60" : ""}`}
    >
      {groups.map((group) => (
        <section key={group.id} aria-labelledby={`group-${group.id}`} className="border-b border-slate-200 last:border-b-0">
          <div
            className={`grid grid-cols-[minmax(0,1fr)_auto] items-baseline gap-x-6 border-b border-slate-200 bg-slate-50 px-4 py-2.5 sm:px-5 ${LEDGER_COLUMNS}`}
          >
            <h3 id={`group-${group.id}`} className="text-sm font-semibold text-slate-950">
              {group.title}
            </h3>
            <span aria-hidden="true" className={`hidden text-xs text-slate-500 sm:block ${group.id === "stock" ? "" : "text-right"}`}>
              Was
            </span>
            <span aria-hidden="true" className={`hidden text-xs text-slate-500 sm:block ${group.id === "stock" ? "" : "text-right"}`}>
              Now
            </span>
            <span className="text-right text-xs text-slate-500 sm:col-start-4">{group.cadence}</span>
          </div>
          <ul className="divide-y divide-slate-100">
            {group.items.map((change) => (
              <li key={change.id}>
                <ChangeEntry change={change} timezone={data.timezone} />
              </li>
            ))}
          </ul>
        </section>
      ))}
      {hasPrevious || data.nextCursor ? (
        <nav
          aria-label="Change pages"
          className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-200 px-4 py-3 sm:px-5"
        >
          <p className="text-sm text-slate-500">
            Page <span className="font-mono tabular-nums">{page}</span>
          </p>
          <div className="flex gap-2">
            <Button variant="secondary" disabled={!hasPrevious} onClick={onPrevious}>
              <ChevronLeft size={16} aria-hidden="true" />
              {previousLabel}
            </Button>
            <Button variant="secondary" disabled={!data.nextCursor} onClick={onNext}>
              Next
              <ChevronRight size={16} aria-hidden="true" />
            </Button>
          </div>
        </nav>
      ) : null}
    </div>
  );
}
