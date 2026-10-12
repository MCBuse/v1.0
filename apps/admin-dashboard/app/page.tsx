"use client";

import { useEffect, useState, type FormEvent } from "react";

type ApiStatus = "draft" | "in_review" | "needs_changes" | "approved" | "rejected" | "withdrawn";
type StatusLabel = "Draft" | "In review" | "Needs changes" | "Approved" | "Rejected" | "Withdrawn";
type Submission = {
  id: string;
  issuer: string;
  name: string;
  ticker: string;
  network: string;
  contract: string;
  reserve: string;
  attestation: string;
  status: ApiStatus;
  submitted: string;
  submittedAt: string | null;
  reviewReason?: string;
  rejectionReason?: string;
};
type Profile = {
  organizations: Array<{
    id: string;
    name: string;
    role: string;
    status: string;
    membershipStatus: string;
  }>;
};
type TokenResponse = { accessToken: string; refreshToken: string };

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000/api/v1";
const ACCESS_TOKEN_KEY = "mcbuse.issuer.access-token";
const REFRESH_TOKEN_KEY = "mcbuse.issuer.refresh-token";
const ACCOUNT_EMAIL_KEY = "mcbuse.issuer.email";
const REVIEW_CHECKS = [
  "Token contract matches the submitted details",
  "Reserve model and disclosures are clear",
  "Latest attestation is accessible and current",
];

class ApiError extends Error {
  constructor(message: string, readonly status: number) {
    super(message);
  }
}

async function request<T>(path: string, token?: string, init: RequestInit = {}): Promise<T> {
  const headers = new Headers(init.headers);
  headers.set("Content-Type", "application/json");
  if (token) headers.set("Authorization", `Bearer ${token}`);
  const response = await fetch(`${API_BASE_URL}${path}`, {
    ...init,
    cache: "no-store",
    headers,
  });
  if (!response.ok) {
    const text = await response.text();
    let message = text || `Request failed with status ${response.status}`;
    try {
      const body = JSON.parse(text) as { message?: string | string[] };
      if (body.message) message = Array.isArray(body.message) ? body.message.join(", ") : body.message;
    } catch {
      // Keep the response text when the API does not return JSON.
    }
    throw new ApiError(message, response.status);
  }
  if (response.status === 204) return undefined as T;
  return response.json() as Promise<T>;
}

function statusLabel(status: ApiStatus): StatusLabel {
  switch (status) {
    case "draft": return "Draft";
    case "in_review": return "In review";
    case "needs_changes": return "Needs changes";
    case "approved": return "Approved";
    case "rejected": return "Rejected";
    case "withdrawn": return "Withdrawn";
  }
}

function formatAge(submittedAt: string | null, now = Date.now()): string {
  if (!submittedAt) return "Date unavailable";
  const time = Date.parse(submittedAt);
  if (Number.isNaN(time)) return "Date unavailable";
  const hours = Math.floor(Math.max(0, now - time) / 3_600_000);
  if (hours < 1) return "Under 1 hour";
  if (hours < 24) return `${hours}h`;
  const days = Math.floor(hours / 24);
  return hours % 24 ? `${days}d ${hours % 24}h` : `${days}d`;
}

function statusClass(status: ApiStatus): string {
  if (status === "in_review") return "review";
  if (status === "needs_changes") return "needs-changes";
  return status;
}

function formatSubmitted(submission: Submission): string {
  if (!submission.submittedAt) return submission.submitted || "—";
  const time = Date.parse(submission.submittedAt);
  return Number.isNaN(time)
    ? submission.submitted || "—"
    : new Intl.DateTimeFormat("en", { dateStyle: "medium" }).format(time);
}

export default function AdminDashboardPage() {
  const [token, setToken] = useState<string | null>(null);
  const [refreshToken, setRefreshToken] = useState<string | null>(null);
  const [email, setEmail] = useState("");
  const [sessionReady, setSessionReady] = useState(false);
  const [reviewerReady, setReviewerReady] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loginPending, setLoginPending] = useState(false);
  const [loginError, setLoginError] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [submissions, setSubmissions] = useState<Submission[]>([]);
  const [activeView, setActiveView] = useState<"queue" | "all">("queue");
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("All statuses");
  const [selected, setSelected] = useState<Submission | null>(null);
  const [checked, setChecked] = useState<string[]>([]);
  const [reasonDecision, setReasonDecision] = useState<"rejected" | "changes_requested" | null>(null);
  const [rejectionReason, setRejectionReason] = useState("");
  const [decisionPending, setDecisionPending] = useState(false);
  const [clock, setClock] = useState(() => Date.now());

  async function loadDashboard(accessToken: string) {
    setLoading(true);
    setError("");
    try {
      const profile = await request<Profile>("/issuer/me", accessToken);
      const reviewerMembership = profile.organizations.find(
        (organization) => organization.role === "reviewer"
          && organization.status === "active"
          && organization.membershipStatus === "active",
      );
      if (!reviewerMembership) {
        throw new ApiError("This account does not have an active MCBuse reviewer role.", 403);
      }
      const queue = await request<Submission[]>("/admin/issuer/submissions", accessToken);
      setSubmissions(queue);
      setReviewerReady(true);
    } catch (loadError) {
      if (loadError instanceof ApiError && loadError.status === 401) {
        window.sessionStorage.removeItem(ACCESS_TOKEN_KEY);
        window.sessionStorage.removeItem(REFRESH_TOKEN_KEY);
        setToken(null);
        setRefreshToken(null);
      }
      setError(loadError instanceof Error ? loadError.message : "Unable to load reviewer submissions.");
    } finally {
      setLoading(false);
      setSessionReady(true);
    }
  }

  useEffect(() => {
    const accessToken = window.sessionStorage.getItem(ACCESS_TOKEN_KEY);
    const storedRefreshToken = window.sessionStorage.getItem(REFRESH_TOKEN_KEY);
    setEmail(window.sessionStorage.getItem(ACCOUNT_EMAIL_KEY) ?? "");
    setToken(accessToken);
    setRefreshToken(storedRefreshToken);
    setSessionReady(true);
    if (accessToken) void loadDashboard(accessToken);
    else setLoading(false);
  }, []);

  useEffect(() => {
    const timer = window.setInterval(() => setClock(Date.now()), 60_000);
    return () => window.clearInterval(timer);
  }, []);

  const inReview = submissions.filter((submission) => submission.status === "in_review");
  const approved = submissions.filter((submission) => submission.status === "approved").length;
  const rejected = submissions.filter((submission) => submission.status === "rejected").length;
  const oldestWaiting = inReview
    .filter((submission) => submission.submittedAt)
    .sort((left, right) => Date.parse(left.submittedAt!) - Date.parse(right.submittedAt!))[0];
  const visible = submissions
    .filter((submission) => activeView === "all" || submission.status === "in_review")
    .filter((submission) => statusFilter === "All statuses" || statusLabel(submission.status) === statusFilter)
    .filter((submission) => (
      `${submission.issuer} ${submission.name} ${submission.ticker} ${submission.network} ${submission.contract}`
        .toLowerCase()
        .includes(search.toLowerCase())
    ))
    .sort((left, right) => {
      if (activeView !== "queue") return 0;
      const leftTime = left.submittedAt ? Date.parse(left.submittedAt) : Number.NaN;
      const rightTime = right.submittedAt ? Date.parse(right.submittedAt) : Number.NaN;
      if (Number.isNaN(leftTime)) return Number.isNaN(rightTime) ? 0 : 1;
      if (Number.isNaN(rightTime)) return -1;
      return leftTime - rightTime;
    });

  async function signIn(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const submittedEmail = String(form.get("email") ?? "").trim().toLowerCase();
    setLoginPending(true);
    setLoginError("");
    try {
      const tokens = await request<TokenResponse>("/auth/login", undefined, {
        method: "POST",
        body: JSON.stringify({ email: submittedEmail, password: String(form.get("password") ?? "") }),
      });
      window.sessionStorage.setItem(ACCESS_TOKEN_KEY, tokens.accessToken);
      window.sessionStorage.setItem(REFRESH_TOKEN_KEY, tokens.refreshToken);
      window.sessionStorage.setItem(ACCOUNT_EMAIL_KEY, submittedEmail);
      setEmail(submittedEmail);
      setToken(tokens.accessToken);
      setRefreshToken(tokens.refreshToken);
      setReviewerReady(false);
      await loadDashboard(tokens.accessToken);
    } catch (signInError) {
      setLoginError(signInError instanceof Error ? signInError.message : "Unable to sign in.");
    } finally {
      setLoginPending(false);
    }
  }

  async function signOut() {
    if (refreshToken) {
      try {
        await request<void>("/auth/logout", token ?? undefined, {
          method: "POST",
          body: JSON.stringify({ refreshToken }),
        });
      } catch {
        // Clear this browser session even when the API cannot revoke the token.
      }
    }
    window.sessionStorage.removeItem(ACCESS_TOKEN_KEY);
    window.sessionStorage.removeItem(REFRESH_TOKEN_KEY);
    window.sessionStorage.removeItem(ACCOUNT_EMAIL_KEY);
    setToken(null);
    setRefreshToken(null);
    setEmail("");
    setReviewerReady(false);
    setSubmissions([]);
  }

  function openSubmission(submission: Submission) {
    setSelected(submission);
    setChecked([]);
    setReasonDecision(null);
    setRejectionReason("");
    setError("");
  }

  async function decide(decision: "approved" | "rejected" | "changes_requested") {
    if (!selected || !token || (decision !== "approved" && !rejectionReason.trim())) return;
    setDecisionPending(true);
    setError("");
    try {
      await request(`/admin/issuer/submissions/${selected.id}/decision`, token, {
        method: "POST",
        body: JSON.stringify({
          decision,
          reason: decision === "approved" ? undefined : rejectionReason.trim(),
          checklist: checked,
        }),
      });
      setSelected(null);
      setNotice(decision === "changes_requested"
        ? `Changes requested for ${selected.name}.`
        : `${selected.name} marked ${decision}.`);
      await loadDashboard(token);
    } catch (decisionError) {
      setError(decisionError instanceof Error ? decisionError.message : "Unable to record this decision.");
    } finally {
      setDecisionPending(false);
    }
  }

  if (!sessionReady || (token && loading && !reviewerReady)) {
    return <main className="sign-in-screen"><p className="login-loading">Connecting to MCBuse review services…</p></main>;
  }

  if (!token || !reviewerReady) {
    return (
      <main className="sign-in-screen">
        <section className="sign-in-panel" aria-labelledby="admin-sign-in-title">
          <a className="brand" href="#admin-sign-in-title"><span className="brand-mark">M</span><span>MCBuse</span></a>
          <div className="sign-in-copy">
            <p className="eyebrow">INTERNAL REVIEW</p>
            <h1 id="admin-sign-in-title">Reviewer sign in</h1>
            <p>Use your MCBuse team account to review stablecoin issuer submissions.</p>
          </div>
          <form className="sign-in-form" onSubmit={(event) => void signIn(event)}>
            <label>Email address<input autoComplete="username" name="email" required type="email" /></label>
            <label>Password<input autoComplete="current-password" name="password" required type="password" /></label>
            {(loginError || error) && <p className="alert" role="alert">{loginError || error}</p>}
            <button className="primary-button" disabled={loginPending} type="submit">
              {loginPending ? "Signing in…" : "Sign in"}
            </button>
          </form>
        </section>
      </main>
    );
  }

  return (
    <main className="admin-shell">
      <aside className="admin-nav">
        <a className="brand" href="#review-dashboard" aria-label="MCBuse admin home"><span className="brand-mark">M</span><span>MCBuse</span></a>
        <p className="team-label">INTERNAL WORKSPACE</p>
        <p className="team-name">Due diligence</p>
        <p className="team-description">Stablecoin issuer review</p>
        <nav className="admin-links" aria-label="Admin workspace">
          <button aria-current={activeView === "queue" ? "page" : undefined} className={`nav-link${activeView === "queue" ? " active" : ""}`} onClick={() => { setActiveView("queue"); setStatusFilter("All statuses"); }} type="button">
            <span className="nav-mark" aria-hidden="true">◷</span> Review queue
            {inReview.length > 0 && <span className="nav-badge">{inReview.length}</span>}
          </button>
          <button aria-current={activeView === "all" ? "page" : undefined} className={`nav-link${activeView === "all" ? " active" : ""}`} onClick={() => { setActiveView("all"); setStatusFilter("All statuses"); }} type="button">
            <span className="nav-mark" aria-hidden="true">▤</span> All submissions
          </button>
        </nav>
        <div className="nav-footer">
          <span className="reviewer-email" title={email}>{email}</span>
          <button className="logout-button" onClick={() => void signOut()} type="button">Sign out</button>
        </div>
      </aside>

      <section className="admin-main" id="review-dashboard">
        <header className="topbar">
          <div className="breadcrumb">MCBuse team <span> / </span><strong>{activeView === "queue" ? "Review queue" : "All submissions"}</strong></div>
          <span className="session-label">Internal reviewer</span>
        </header>
        <div className="content">
          <div className="heading-row">
            <div>
              <p className="eyebrow">ISSUER DUE DILIGENCE</p>
              <h1>{activeView === "queue" ? "Review queue" : "All submissions"}</h1>
              <p className="heading-copy">Monitor issuer applications and record attributable review decisions.</p>
            </div>
            <button className="refresh-button" disabled={loading} onClick={() => token && void loadDashboard(token)} type="button">
              {loading ? "Refreshing…" : "↻ Refresh"}
            </button>
          </div>

          {error && <p className="alert" role="alert">{error}</p>}
          {notice && <p className="notice" role="status">{notice}</p>}

          <section className="metric-grid" aria-label="Submission monitoring summary">
            <article className="metric attention"><div className="metric-label">Awaiting review <span>●</span></div><strong className="metric-value">{String(inReview.length).padStart(2, "0")}</strong><span className="metric-note">Open in the reviewer queue</span></article>
            <article className="metric attention"><div className="metric-label">Oldest waiting <span>◷</span></div><strong className="metric-value">{oldestWaiting ? formatAge(oldestWaiting.submittedAt, clock) : "None"}</strong><span className="metric-note">{oldestWaiting ? `Submitted ${formatSubmitted(oldestWaiting)}` : "No submissions waiting"}</span></article>
            <article className="metric"><div className="metric-label">Approved <span>✓</span></div><strong className="metric-value">{String(approved).padStart(2, "0")}</strong><span className="metric-note">Decision recorded</span></article>
            <article className="metric"><div className="metric-label">Rejected <span>!</span></div><strong className="metric-value">{String(rejected).padStart(2, "0")}</strong><span className="metric-note">Decision recorded</span></article>
          </section>

          <section className="queue-panel" id={activeView === "queue" ? "review-queue" : "all-submissions"} aria-labelledby="queue-title">
            <div className="queue-head">
              <div>
                <div className="queue-title"><h2 id="queue-title">{activeView === "queue" ? "Waiting for review" : "Submission history"}</h2><span className="count">{visible.length}</span></div>
                <p className="queue-description">{activeView === "queue" ? "Oldest submissions are listed first." : "Search and filter every issuer submission."}</p>
              </div>
              <div className="queue-tools">
                <input className="search-input" aria-label="Search submissions" onChange={(event) => setSearch(event.target.value)} placeholder="Search issuer, token, address" value={search} />
                {activeView === "all" && (
                  <select className="status-select" aria-label="Filter by status" onChange={(event) => setStatusFilter(event.target.value)} value={statusFilter}>
                    <option>All statuses</option><option>Draft</option><option>In review</option><option>Needs changes</option><option>Approved</option><option>Rejected</option><option>Withdrawn</option>
                  </select>
                )}
              </div>
            </div>
            <div className="table-scroll">
              <table>
                <thead><tr><th>STABLECOIN</th><th>ISSUER</th><th>NETWORK</th><th>SUBMITTED</th><th>WAITING</th><th>STATUS</th><th><span className="sr-only">Actions</span></th></tr></thead>
                <tbody>
                  {loading && <tr><td className="empty-row" colSpan={7}>Loading submissions…</td></tr>}
                  {!loading && !error && visible.map((submission) => (
                    <tr key={submission.id}>
                      <td><div className="token-cell"><span className="token-mark">{submission.ticker.slice(0, 1)}</span><span className="token-name"><strong>{submission.name}</strong><small>{submission.ticker} · {submission.id}</small></span></div></td>
                      <td>{submission.issuer}</td>
                      <td>{submission.network}</td>
                      <td>{formatSubmitted(submission)}</td>
                      <td><span className="age">{submission.status === "in_review" ? formatAge(submission.submittedAt, clock) : "—"}</span></td>
                      <td><span className={`status ${statusClass(submission.status)}`}>{statusLabel(submission.status)}</span></td>
                      <td><button className="open-button" onClick={() => openSubmission(submission)} type="button">{submission.status === "in_review" ? "Review" : "View"} →</button></td>
                    </tr>
                  ))}
                  {!loading && !error && visible.length === 0 && <tr><td className="empty-row" colSpan={7}>{activeView === "queue" ? (search ? "No submissions match this search." : "No submissions waiting for review.") : (submissions.length ? "No submissions match these filters." : "No stablecoin submissions yet.")}</td></tr>}
                </tbody>
              </table>
            </div>
            <footer className="queue-footer"><span>Showing <strong>{visible.length}</strong> of <strong>{submissions.length}</strong> submissions</span><span>Review decisions are recorded in submission history.</span></footer>
          </section>
        </div>
      </section>

      {selected && (
        <div className="dialog-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) setSelected(null); }}>
          <section className="detail-panel" aria-labelledby="detail-title" aria-modal="true" role="dialog">
            <header className="detail-header">
              <div><p className="eyebrow">{selected.status === "in_review" ? "SUBMISSION DUE DILIGENCE" : "SUBMISSION DETAILS"}</p><h2 id="detail-title">{selected.name} <span>{selected.ticker}</span></h2><p>{selected.issuer} · submitted {formatSubmitted(selected)}</p></div>
              <button className="close-button" aria-label="Close submission details" onClick={() => setSelected(null)} type="button">×</button>
            </header>
            <div className="detail-body">
              <div className="detail-grid">
                <div className="detail-item"><span>Network</span><strong>{selected.network}</strong></div>
                <div className="detail-item"><span>Status</span><strong><span className={`status ${statusClass(selected.status)}`}>{statusLabel(selected.status)}</span></strong></div>
                <div className="detail-item wide"><span>Token contract / mint</span><strong className="contract">{selected.contract}</strong></div>
                <div className="detail-item wide"><span>Reserve composition</span><strong>{selected.reserve}</strong></div>
                <div className="detail-item wide"><span>Latest reserve attestation</span><a href={selected.attestation} rel="noreferrer" target="_blank">Open issuer disclosure ↗</a></div>
                {(selected.reviewReason || selected.rejectionReason) && <div className="detail-item wide"><span>Reviewer note</span><strong>{selected.reviewReason || selected.rejectionReason}</strong></div>}
              </div>
              {selected.status === "in_review" && (
                <section className="checklist-panel" aria-labelledby="checklist-title">
                  <h3 id="checklist-title">Due diligence checklist</h3>
                  <p>Complete each check before approving this submission.</p>
                  <div className="checklist">
                    {REVIEW_CHECKS.map((check) => <label key={check}><input checked={checked.includes(check)} onChange={(event) => setChecked((current) => event.target.checked ? [...current, check] : current.filter((item) => item !== check))} type="checkbox" />{check}</label>)}
                  </div>
                  {reasonDecision && <label className="rejection-field">{reasonDecision === "changes_requested" ? "Changes requested" : "Reason for rejection"}<textarea onChange={(event) => setRejectionReason(event.target.value)} placeholder="Explain what needs to change for the issuer." value={rejectionReason} /></label>}
                  {error && <p className="decision-error" role="alert">{error}</p>}
                  <div className="decision-actions">
                    <div>
                      <button className="danger-button" disabled={decisionPending || (reasonDecision === "rejected" && !rejectionReason.trim())} onClick={() => reasonDecision === "rejected" ? void decide("rejected") : setReasonDecision("rejected")} type="button">{reasonDecision === "rejected" ? "Confirm rejection" : "Reject"}</button>
                      <button className="secondary-button" disabled={decisionPending || (reasonDecision === "changes_requested" && !rejectionReason.trim())} onClick={() => reasonDecision === "changes_requested" ? void decide("changes_requested") : setReasonDecision("changes_requested")} type="button">{reasonDecision === "changes_requested" ? "Send request" : "Request changes"}</button>
                    </div>
                    <div>
                      {reasonDecision && <button className="secondary-button" disabled={decisionPending} onClick={() => { setReasonDecision(null); setRejectionReason(""); }} type="button">Cancel</button>}
                      <button className="primary-button" disabled={decisionPending || reasonDecision !== null || checked.length !== REVIEW_CHECKS.length} onClick={() => void decide("approved")} type="button">{decisionPending ? "Recording…" : "Approve submission"}</button>
                    </div>
                  </div>
                </section>
              )}
            </div>
          </section>
        </div>
      )}
    </main>
  );
}