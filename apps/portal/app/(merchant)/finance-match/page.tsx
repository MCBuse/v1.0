"use client";
import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Download, Eye, Mail, X } from "lucide-react";
import type { SavedMerchantAssessment } from "@repo/shared";
import { Alert } from "@repo/ui/alert";
import { Badge } from "@repo/ui/badge";
import { Button } from "@repo/ui/button";
import { Card, CardContent } from "@repo/ui/card";
import { Field, FieldLabel, Input } from "@repo/ui/field";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@repo/ui/table";
import {
  Drawer,
  DrawerClose,
  DrawerContent,
  DrawerDescription,
  DrawerFooter,
  DrawerHeader,
  DrawerTitle,
} from "@/components/ui/drawer";
import { portalApi } from "@/lib/client/api";
import { usePortalResource } from "@/lib/client/use-portal-resource";
import {
  operationIntent,
  finishOperationIntent,
} from "@/lib/client/operation-intent";
import { stageLabel, stageTone } from "@/components/assessment-labels";

type Package = {
  id: string;
  periodFrom: string;
  periodTo: string;
  createdAt: string;
  assessment: SavedMerchantAssessment | null;
  assessmentBinding: string;
  artifacts?: Array<{ kind: string; sha256: string }>;
};
type Attempt = {
  id: string;
  packageId: string;
  recipientEmail: string;
  institutionName?: string | null;
  status: string;
  createdAt: string;
};

const DATE = new Intl.DateTimeFormat("en-GB", { dateStyle: "medium" });
const DATE_TIME = new Intl.DateTimeFormat("en-GB", {
  dateStyle: "medium",
  timeStyle: "short",
});
/** Same window the Run credit assessment flow uses for its PDF. */
const PDF_PERIOD_DAYS = 30;
const pdfHref = (id: string, preview = false) =>
  `/api/merchant/me/finance-packages/${id}/pdf${preview ? "?preview=true" : ""}`;

/** Reports only what the mail server said; never claims inbox delivery. */
const EMAIL_STATUS: Record<
  string,
  { label: string; tone: "info" | "neutral" | "warning" | "danger" }
> = {
  accepted_by_smtp: { label: "Accepted by mail server", tone: "info" },
  sending: { label: "Sending", tone: "neutral" },
  unknown: { label: "Outcome unknown", tone: "warning" },
  failed: { label: "Not sent", tone: "danger" },
};
const emailStatus = (status: string) =>
  EMAIL_STATUS[status] ?? { label: status.replaceAll("_", " "), tone: "neutral" as const };

type Tab = "pdfs" | "emails";

export default function FinanceMatchPage() {
  const profile = usePortalResource<{ id: string }>("me");
  const assessments = usePortalResource<{
    assessments: SavedMerchantAssessment[];
  }>("me/assessments");
  const history = usePortalResource<{ items: Package[] }>("me/finance-packages");
  const emails = usePortalResource<{ items: Attempt[] }>(
    "me/finance-packages/email-attempts",
  );
  const [emailing, setEmailing] = useState<Package | null>(null);
  const [tab, setTab] = useState<Tab>("pdfs");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [requestedId, setRequestedId] = useState<string | null>(null);

  // `?assessmentId=` arrives from Credit Assessment's "Prepare PDF" link.
  useEffect(() => {
    setRequestedId(new URLSearchParams(window.location.search).get("assessmentId"));
  }, []);

  const packages = history.data?.items.slice(0, 10) ?? [];
  const latest = packages[0];
  const earlier = packages.slice(1);
  const attempts = useMemo(() => emails.data?.items ?? [], [emails.data]);
  const lastSent = useMemo(() => {
    const map = new Map<string, Attempt>();
    for (const a of attempts) {
      const seen = map.get(a.packageId);
      if (!seen || seen.createdAt < a.createdAt) map.set(a.packageId, a);
    }
    return map;
  }, [attempts]);
  const packageDate = (id: string) => {
    const p = history.data?.items.find((item) => item.id === id);
    return p ? DATE.format(new Date(p.createdAt)) : "Earlier PDF";
  };

  // An assessment that was asked for but has no PDF yet (older assessments).
  const requested = requestedId
    ? assessments.data?.assessments.find((a) => a.id === requestedId)
    : undefined;
  const requestedHasPdf = requested
    ? history.data?.items.some((p) => p.assessment?.id === requested.id)
    : true;

  async function createPdf(assessmentId: string) {
    if (!profile.data) return;
    setBusy(true);
    setError("");
    try {
      const input = { periodDays: PDF_PERIOD_DAYS, assessmentId };
      const key = operationIntent(profile.data.id, "package", input);
      await portalApi<Package>("me/finance-packages", {
        method: "POST",
        headers: { "Idempotency-Key": key },
        body: JSON.stringify(input),
      });
      finishOperationIntent(profile.data.id, "package");
      await history.refresh();
      setMessage("PDF created. It's now at the top of your list.");
    } catch (e) {
      setError(e instanceof Error ? e.message : "The PDF could not be created");
    } finally {
      setBusy(false);
    }
  }

  const loadError =
    error ||
    profile.error?.message ||
    assessments.error?.message ||
    history.error?.message ||
    emails.error?.message;

  return (
    <div className="grid gap-8">
      <div>
        <p className="text-sm font-medium text-blue-700">Finance Match</p>
        <h1 className="mt-1 text-3xl font-semibold tracking-tight text-slate-950">
          Share your assessment
        </h1>
        <p className="mt-2 max-w-prose text-sm text-slate-600">
          Send your credit assessment PDF to a lender, or download it to share
          yourself.
        </p>
      </div>

      {loadError ? (
        <Alert className="border-amber-200 bg-amber-50 text-amber-900">{loadError}</Alert>
      ) : null}
      {message ? (
        <p role="status" className="text-sm font-medium text-emerald-700">
          {message}
        </p>
      ) : null}

      {requested && !requestedHasPdf ? (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-slate-200 bg-white px-4 py-3 text-sm">
          <p className="text-slate-700">
            The assessment from{" "}
            <span className="font-medium text-slate-950">
              {DATE_TIME.format(new Date(requested.createdAt))}
            </span>{" "}
            doesn&apos;t have a PDF yet.
          </p>
          <Button
            variant="secondary"
            size="sm"
            disabled={busy || !profile.data}
            onClick={() => void createPdf(requested.id)}
          >
            {busy ? "Creating…" : "Create PDF"}
          </Button>
        </div>
      ) : null}

      {/* 1. The one thing people come here to do. */}
      <Card>
        <CardContent className="py-6">
          {history.loading && !history.data ? (
            <p className="text-sm text-slate-600">Loading your PDFs…</p>
          ) : latest ? (
            <LatestPdf
              pkg={latest}
              sent={lastSent.get(latest.id)}
              onEmail={() => setEmailing(latest)}
            />
          ) : (
            <div className="grid justify-items-start gap-3">
              <h2 className="text-lg font-semibold text-slate-950">No PDF yet</h2>
              <p className="max-w-prose text-sm text-slate-600">
                A PDF is created each time you run a credit assessment. Run one
                first, then come back here to share it.
              </p>
              <Button asChild variant="secondary">
                <Link href="/credit-assessment">Go to Credit Assessment</Link>
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      {/* 2. Reference material, one view at a time. */}
      {packages.length ? (
        <section className="grid gap-4">
          <div
            role="tablist"
            aria-label="Finance Match history"
            className="flex gap-6 border-b border-slate-200"
          >
            {(
              [
                ["pdfs", "Earlier PDFs", earlier.length],
                ["emails", "Sent emails", attempts.length],
              ] as const
            ).map(([id, label, count], index, all) => {
              const selected = tab === id;
              return (
                <button
                  key={id}
                  id={`fm-tab-${id}`}
                  type="button"
                  role="tab"
                  aria-selected={selected}
                  aria-controls="fm-panel"
                  tabIndex={selected ? 0 : -1}
                  onClick={() => setTab(id)}
                  onKeyDown={(event) => {
                    if (event.key !== "ArrowRight" && event.key !== "ArrowLeft") return;
                    event.preventDefault();
                    const next = all[(index + 1) % all.length]![0];
                    setTab(next);
                    document.getElementById(`fm-tab-${next}`)?.focus();
                  }}
                  className={`-mb-px inline-flex min-h-11 items-center gap-2 border-b-2 text-sm font-semibold transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-700 ${
                    selected
                      ? "border-blue-600 text-slate-950"
                      : "border-transparent text-slate-500 hover:text-slate-950"
                  }`}
                >
                  {label}
                  <span className="rounded-full bg-slate-100 px-2 py-0.5 font-mono text-xs tabular-nums text-slate-600">
                    {count}
                  </span>
                </button>
              );
            })}
          </div>

          <div id="fm-panel" role="tabpanel" aria-labelledby={`fm-tab-${tab}`}>
            {tab === "pdfs" ? (
              earlier.length ? (
                <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead scope="col">Created</TableHead>
                        <TableHead scope="col" className="hidden sm:table-cell">Assessment</TableHead>
                        <TableHead scope="col" className="hidden sm:table-cell">Last sent</TableHead>
                        <TableHead scope="col" className="text-right">
                          <span className="sr-only">Actions</span>
                        </TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {earlier.map((item) => {
                        const sent = lastSent.get(item.id);
                        return (
                          <TableRow key={item.id}>
                            <TableCell className="text-sm">
                              <span className="block whitespace-nowrap font-mono tabular-nums text-slate-950">
                                {DATE_TIME.format(new Date(item.createdAt))}
                              </span>
                              <span className="block text-xs text-slate-500 sm:hidden">
                                {item.assessmentBinding === "verified" ? stageLabel(item.assessment?.stage) : "Older format"}
                              </span>
                            </TableCell>
                            <TableCell className="hidden text-sm text-slate-700 sm:table-cell">
                              {item.assessmentBinding === "verified"
                                ? stageLabel(item.assessment?.stage)
                                : "Older format"}
                            </TableCell>
                            <TableCell className="hidden text-sm text-slate-600 sm:table-cell">
                              {sent ? `${sent.recipientEmail} · ${DATE.format(new Date(sent.createdAt))}` : "Not sent"}
                            </TableCell>
                            <TableCell className="text-right">
                              <div className="inline-flex gap-1">
                                <Button variant="ghost" size="sm" onClick={() => setEmailing(item)}>
                                  <Mail aria-hidden="true" className="size-4" />
                                  <span className="sr-only sm:not-sr-only">Email</span>
                                </Button>
                                <Button asChild variant="ghost" size="sm">
                                  <a href={pdfHref(item.id, true)} target="_blank" rel="noreferrer">
                                    <Eye aria-hidden="true" className="size-4" />
                                    <span className="sr-only sm:not-sr-only">View</span>
                                  </a>
                                </Button>
                                <Button asChild variant="ghost" size="sm">
                                  <a href={pdfHref(item.id)} download>
                                    <Download aria-hidden="true" className="size-4" />
                                    <span className="sr-only sm:not-sr-only">Download</span>
                                  </a>
                                </Button>
                              </div>
                            </TableCell>
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                </div>
              ) : (
                <p className="text-sm text-slate-600">
                  No earlier PDFs. Each new credit assessment adds one here.
                </p>
              )
            ) : (
              <div className="grid gap-3">
                <p className="text-xs text-slate-500">
                  &quot;Accepted by mail server&quot; means the email left MCBuse. We
                  can&apos;t confirm it reached the recipient&apos;s inbox, and
                  unclear outcomes are never resent automatically.
                </p>
                {attempts.length ? (
                  <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead scope="col">Sent</TableHead>
                          <TableHead scope="col">Recipient</TableHead>
                          <TableHead scope="col" className="hidden sm:table-cell">PDF</TableHead>
                          <TableHead scope="col" className="hidden sm:table-cell">Status</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {attempts.map((a) => {
                          const s = emailStatus(a.status);
                          return (
                            <TableRow key={a.id}>
                              <TableCell className="font-mono text-sm tabular-nums text-slate-950 sm:whitespace-nowrap">
                                {DATE_TIME.format(new Date(a.createdAt))}
                              </TableCell>
                              <TableCell className="min-w-0 text-sm">
                                <span className="block break-all text-slate-950">{a.recipientEmail}</span>
                                {a.institutionName ? (
                                  <span className="block text-xs text-slate-500">{a.institutionName}</span>
                                ) : null}
                                <Badge tone={s.tone} className="mt-1 whitespace-nowrap sm:hidden">{s.label}</Badge>
                              </TableCell>
                              <TableCell className="hidden text-sm text-slate-600 sm:table-cell">
                                {packageDate(a.packageId)}
                              </TableCell>
                              <TableCell className="hidden sm:table-cell">
                                <Badge tone={s.tone} className="whitespace-nowrap">{s.label}</Badge>
                              </TableCell>
                            </TableRow>
                          );
                        })}
                      </TableBody>
                    </Table>
                  </div>
                ) : (
                  <p className="text-sm text-slate-600">You haven&apos;t emailed a PDF yet.</p>
                )}
              </div>
            )}
          </div>
        </section>
      ) : null}

      <EmailDrawer
        pkg={emailing}
        merchantId={profile.data?.id}
        onClose={() => setEmailing(null)}
        onSent={async (text) => {
          setMessage(text);
          await emails.refresh();
        }}
      />
    </div>
  );
}

function LatestPdf({
  pkg,
  sent,
  onEmail,
}: {
  pkg: Package;
  sent: Attempt | undefined;
  onEmail: () => void;
}) {
  const a = pkg.assessment;
  const business = (a?.businessProfile as { businessName?: string } | undefined)?.businessName;
  return (
    <div className="grid gap-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-xs font-medium uppercase tracking-wide text-slate-500">
            Latest assessment PDF
          </p>
          <h2 className="mt-1 text-2xl font-semibold tracking-tight text-slate-950">
            {DATE.format(new Date(pkg.createdAt))}
          </h2>
          <p className="mt-1 text-sm text-slate-600">
            {business ? <>{business} · </> : null}
            Covers {DATE.format(new Date(pkg.periodFrom))} –{" "}
            {DATE.format(new Date(pkg.periodTo))}
          </p>
        </div>
        {a && pkg.assessmentBinding === "verified" ? (
          <Badge tone={stageTone(a.stage)}>{stageLabel(a.stage)}</Badge>
        ) : (
          <Badge tone="neutral">Older format</Badge>
        )}
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <Button size="lg" onClick={onEmail}>
          <Mail aria-hidden="true" className="size-4" /> Email to a lender
        </Button>
        <Button asChild size="lg" variant="secondary">
          <a href={pdfHref(pkg.id, true)} target="_blank" rel="noreferrer">
            <Eye aria-hidden="true" className="size-4" /> View PDF
          </a>
        </Button>
        <Button asChild size="lg" variant="ghost">
          <a href={pdfHref(pkg.id)} download>
            <Download aria-hidden="true" className="size-4" /> Download
          </a>
        </Button>
      </div>
      <p className="text-sm text-slate-500">
        {sent ? (
          <>
            Last sent to <span className="text-slate-700">{sent.recipientEmail}</span> on{" "}
            {DATE_TIME.format(new Date(sent.createdAt))} · {emailStatus(sent.status).label}
          </>
        ) : (
          "Not sent to anyone yet."
        )}
      </p>
    </div>
  );
}

function EmailDrawer({
  pkg,
  merchantId,
  onClose,
  onSent,
}: {
  pkg: Package | null;
  merchantId: string | undefined;
  onClose: () => void;
  onSent: (message: string) => void | Promise<void>;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [done, setDone] = useState("");
  useEffect(() => {
    setError("");
    setDone("");
  }, [pkg?.id]);

  async function send(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!pkg || !merchantId) return;
    const form = event.currentTarget;
    const data = new FormData(form);
    const input = {
      recipientEmail: String(data.get("recipientEmail")).trim().toLowerCase(),
      institutionName: String(data.get("institutionName") || "").trim(),
      confirmed: data.get("confirmed") === "on",
    };
    setBusy(true);
    setError("");
    try {
      const key = operationIntent(merchantId, "email", { packageId: pkg.id, ...input });
      const result = await portalApi<{ status: string }>(
        `me/finance-packages/${pkg.id}/email`,
        {
          method: "POST",
          headers: { "Idempotency-Key": key },
          body: JSON.stringify(input),
        },
      );
      const text =
        result.status === "accepted_by_smtp"
          ? "Accepted by the mail server. Inbox delivery has not been confirmed."
          : `Email status: ${emailStatus(result.status).label}`;
      if (result.status === "accepted_by_smtp") {
        finishOperationIntent(merchantId, "email");
        form.reset();
        setDone(text);
      } else setError(text);
      await onSent(text);
    } catch (e) {
      setError(e instanceof Error ? e.message : "The email could not be sent");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Drawer direction="right" open={Boolean(pkg)} onOpenChange={(open) => (open ? null : onClose())}>
      <DrawerContent className="h-dvh w-full overflow-hidden rounded-none sm:max-w-lg">
        <DrawerHeader className="relative border-b border-slate-200 pr-16">
          <DrawerTitle>Email assessment PDF</DrawerTitle>
          <DrawerDescription>
            The recipient gets this PDF and its data file.
          </DrawerDescription>
          <DrawerClose asChild>
            <Button type="button" variant="ghost" size="icon" aria-label="Close" className="absolute right-3 top-3">
              <X />
            </Button>
          </DrawerClose>
        </DrawerHeader>
        {pkg ? (
          <form id="email-pdf-form" onSubmit={(e) => void send(e)} className="grid flex-1 content-start gap-5 overflow-y-auto p-6">
            <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-slate-200 bg-slate-50 px-4 py-3 text-sm">
              <div>
                <p className="font-medium text-slate-950">
                  PDF from {DATE_TIME.format(new Date(pkg.createdAt))}
                </p>
                <p className="text-slate-600">
                  {pkg.assessment ? stageLabel(pkg.assessment.stage) : "Older format"}
                </p>
              </div>
              <a
                href={pdfHref(pkg.id, true)}
                target="_blank"
                rel="noreferrer"
                className="inline-flex min-h-11 items-center text-sm font-semibold text-blue-700 underline-offset-4 hover:underline"
              >
                Open PDF
              </a>
            </div>
            {error ? <Alert className="border-amber-200 bg-amber-50 text-amber-900">{error}</Alert> : null}
            {done ? (
              <p role="status" className="rounded-lg border border-slate-200 px-4 py-3 text-sm text-slate-700">
                {done}
              </p>
            ) : null}
            <Field>
              <FieldLabel htmlFor="recipient">Recipient email</FieldLabel>
              <Input id="recipient" name="recipientEmail" type="email" required autoComplete="email" />
            </Field>
            <Field>
              <FieldLabel htmlFor="institution">Lender or institution (optional)</FieldLabel>
              <Input id="institution" name="institutionName" />
            </Field>
            <label className="flex items-start gap-2 text-sm text-slate-700">
              <input name="confirmed" type="checkbox" required className="mt-0.5 size-4" />
              <span>I confirm I am authorised to share this PDF with this recipient.</span>
            </label>
          </form>
        ) : null}
        <DrawerFooter className="flex-row justify-end gap-3 border-t border-slate-200">
          <DrawerClose asChild>
            <Button type="button" variant="secondary">{done ? "Done" : "Cancel"}</Button>
          </DrawerClose>
          <Button type="submit" form="email-pdf-form" disabled={busy || !merchantId}>
            {busy ? "Sending…" : done ? "Send another copy" : "Email PDF and data"}
          </Button>
        </DrawerFooter>
      </DrawerContent>
    </Drawer>
  );
}
