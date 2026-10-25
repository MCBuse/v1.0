"use client";
import { useEffect, useId, useState } from "react";
import type {
  ChangeProcessingState,
  StaffChangeMerchant,
  StaffUpdateNowResponse,
} from "@repo/shared";
import { Alert } from "@repo/ui/alert";
import { Button } from "@repo/ui/button";
import { Card, CardContent, CardHeader } from "@repo/ui/card";
import { Field, FieldLabel, FieldMessage, Input } from "@repo/ui/field";
import { getCsrfToken } from "@/lib/client/csrf";

class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
  }
}

async function api<T>(path: string, init: RequestInit = {}): Promise<T> {
  if (init.method === "POST" && !getCsrfToken()) await api("me");
  const response = await fetch(`/api/staff/${path}`, {
    ...init,
    cache: "no-store",
    headers: {
      "Content-Type": "application/json",
      ...(getCsrfToken() ? { "X-CSRF-Token": getCsrfToken()! } : {}),
      ...init.headers,
    },
  });
  const result = (await response.json().catch(() => ({}))) as {
    message?: string | string[];
  };
  if (!response.ok)
    throw new ApiError(
      [result.message].flat().filter(Boolean).join(" ") || "Request failed",
      response.status,
    );
  return result as T;
}

const STATUS_LABEL: Record<ChangeProcessingState, string> = {
  idle: "Up to date",
  pending: "Update waiting to run",
  processing: "Updating now",
  delayed: "Update delayed",
  failed: "Last update failed",
};

const REASON_MAX = 200;

const optionLabel = (m: StaffChangeMerchant) =>
  `${m.businessName} — ${m.ownerEmail ?? "no owner email"}`;

const formatTime = (iso: string | null) =>
  iso
    ? new Intl.DateTimeFormat(undefined, {
        dateStyle: "medium",
        timeStyle: "short",
      }).format(new Date(iso))
    : "Never";

export function UpdateNowWorkspace() {
  const listId = useId();
  const [query, setQuery] = useState("");
  const [options, setOptions] = useState<StaffChangeMerchant[]>([]);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  const [searching, setSearching] = useState(false);
  const [selected, setSelected] = useState<StaffChangeMerchant | null>(null);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  // Debounced search by business name or owner email.
  useEffect(() => {
    let cancelled = false;
    setSearching(true);
    const timer = setTimeout(() => {
      api<{ merchants: StaffChangeMerchant[] }>(
        `changes/merchants${query.trim() ? `?q=${encodeURIComponent(query.trim())}` : ""}`,
      )
        .then((result) => {
          if (cancelled) return;
          setOptions(result.merchants);
          setActive(result.merchants.length ? 0 : -1);
        })
        .catch((e: unknown) => {
          if (!cancelled)
            setError(e instanceof Error ? e.message : "Search failed");
        })
        .finally(() => {
          if (!cancelled) setSearching(false);
        });
    }, 250);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [query]);

  function choose(merchant: StaffChangeMerchant) {
    setSelected(merchant);
    setQuery(optionLabel(merchant));
    setOpen(false);
    setNotice("");
    setError("");
  }

  async function refreshSelected(merchantId: string, label: string) {
    const result = await api<{ merchants: StaffChangeMerchant[] }>(
      `changes/merchants?q=${encodeURIComponent(label)}`,
    );
    const fresh = result.merchants.find((m) => m.merchantId === merchantId);
    if (fresh) setSelected(fresh);
  }

  async function updateNow() {
    if (!selected || !reason.trim()) return;
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const result = await api<StaffUpdateNowResponse>("changes/update-now", {
        method: "POST",
        body: JSON.stringify({
          merchantId: selected.merchantId,
          reason: reason.trim(),
        }),
      });
      setNotice(
        result.status === "queued"
          ? `Update started for ${selected.businessName}. Stock and threshold changes usually show within two minutes. Sales trends still need their full history and confirmation days.`
          : `An update for ${selected.businessName} is already running or was started less than a minute ago. No new update was started.`,
      );
      if (result.status === "queued") setReason("");
    } catch (e) {
      if (e instanceof ApiError && e.status === 503)
        setError(
          "The update is queued and will run with the next hourly analysis, but starting it now failed. Try again in a minute or tell engineering.",
        );
      else if (e instanceof ApiError && e.status === 404)
        setError(
          "This merchant is no longer available for Changes. Search again.",
        );
      else setError(e instanceof Error ? e.message : "Update failed");
    } finally {
      setBusy(false);
      await refreshSelected(
        selected.merchantId,
        selected.ownerEmail ?? selected.businessName,
      ).catch(() => undefined);
    }
  }

  const activeId =
    open && active >= 0 && options[active]
      ? `${listId}-${options[active].merchantId}`
      : undefined;

  return (
    <div className="grid min-w-0 grid-cols-1 gap-6">
      <div>
        <p className="text-sm text-blue-700">Operations</p>
        <h1 className="mt-1 text-3xl font-semibold">Changes: update now</h1>
        <p className="mt-3 max-w-3xl text-sm leading-6 text-slate-600">
          Process one merchant&apos;s pending changes immediately instead of
          waiting for the hourly run, for example after a merchant restocked and
          still sees a low-stock warning. It applies the normal rules and never
          confirms a sales trend early. Every use is recorded.
        </p>
      </div>
      {error ? (
        <Alert role="alert" className="border-red-200 bg-red-50 text-red-800">
          {error}
        </Alert>
      ) : null}
      {notice ? <Alert>{notice}</Alert> : null}
      <Card className="min-w-0">
        <CardHeader>
          <h2 className="font-semibold">Merchant</h2>
        </CardHeader>
        <CardContent className="grid min-w-0 gap-5">
          <Field className="relative min-w-0">
            <FieldLabel htmlFor={`${listId}-search`}>
              Search by business name or owner email
            </FieldLabel>
            <Input
              id={`${listId}-search`}
              role="combobox"
              aria-autocomplete="list"
              aria-expanded={open}
              aria-controls={`${listId}-list`}
              aria-activedescendant={activeId}
              autoComplete="off"
              value={query}
              placeholder="Aci Café or owner@example.com"
              onFocus={() => setOpen(true)}
              onBlur={() => setTimeout(() => setOpen(false), 150)}
              onChange={(e) => {
                setQuery(e.target.value);
                setOpen(true);
                if (selected && e.target.value !== optionLabel(selected))
                  setSelected(null);
              }}
              onKeyDown={(e) => {
                if (e.key === "ArrowDown") {
                  e.preventDefault();
                  setOpen(true);
                  setActive((i) => Math.min(options.length - 1, i + 1));
                } else if (e.key === "ArrowUp") {
                  e.preventDefault();
                  setActive((i) => Math.max(0, i - 1));
                } else if (e.key === "Enter" && open && options[active]) {
                  e.preventDefault();
                  choose(options[active]);
                } else if (e.key === "Escape") setOpen(false);
              }}
            />
            {open ? (
              <ul
                id={`${listId}-list`}
                role="listbox"
                aria-label="Merchants"
                className="absolute top-full z-10 mt-1 max-h-72 w-full overflow-auto rounded-lg border bg-white py-1 shadow-lg"
              >
                {options.length ? (
                  options.map((m, i) => (
                    <li
                      key={m.merchantId}
                      id={`${listId}-${m.merchantId}`}
                      role="option"
                      aria-selected={i === active}
                      className={`cursor-pointer break-words px-3 py-2 text-sm ${i === active ? "bg-blue-50 text-blue-900" : ""}`}
                      onMouseDown={(e) => {
                        e.preventDefault();
                        choose(m);
                      }}
                      onMouseEnter={() => setActive(i)}
                    >
                      {optionLabel(m)}
                    </li>
                  ))
                ) : (
                  <li className="px-3 py-2 text-sm text-slate-500">
                    {searching
                      ? "Searching…"
                      : "No merchant with Changes enabled matches."}
                  </li>
                )}
              </ul>
            ) : null}
            <FieldMessage>
              Only merchants with Changes enabled are listed (up to 50).
            </FieldMessage>
          </Field>

          {selected ? (
            <dl className="grid gap-4 rounded-lg border bg-slate-50 p-4 text-sm sm:grid-cols-3">
              <div className="min-w-0">
                <dt className="text-slate-500">Merchant</dt>
                <dd className="break-words font-medium">
                  {selected.businessName}
                </dd>
                <dd className="break-words text-slate-600">
                  {selected.ownerEmail ?? "No owner email"}
                </dd>
              </div>
              <div>
                <dt className="text-slate-500">Last successful update</dt>
                <dd className="font-medium">
                  {formatTime(selected.lastSuccessfulUpdateAt)}
                </dd>
              </div>
              <div>
                <dt className="text-slate-500">Status</dt>
                <dd className="font-medium">
                  {STATUS_LABEL[selected.processing]}
                </dd>
              </div>
            </dl>
          ) : null}

          <Field>
            <FieldLabel htmlFor={`${listId}-reason`}>Reason</FieldLabel>
            <textarea
              id={`${listId}-reason`}
              className="min-h-24 w-full rounded-lg border border-slate-300 bg-white p-3 text-base outline-none focus:border-blue-600 focus:ring-2 focus:ring-blue-100"
              maxLength={REASON_MAX}
              required
              value={reason}
              aria-describedby={`${listId}-reason-help`}
              placeholder="Merchant restocked croissants; warning still shows low stock"
              onChange={(e) => setReason(e.target.value)}
            />
            <FieldMessage id={`${listId}-reason-help`}>
              Required, recorded with the update. {reason.length}/{REASON_MAX}
            </FieldMessage>
          </Field>

          <div>
            <Button
              disabled={busy || !selected || !reason.trim()}
              onClick={() => void updateNow()}
            >
              {busy ? "Starting update…" : "Update now"}
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
