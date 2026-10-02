"use client";

import { useEffect, useState, type FormEvent } from "react";

type RequestStatus = "In review" | "Approved" | "Rejected";
type RequestRole = "issuer" | "admin";
type AuthMode = "signin" | "signup";
type ApiSubmissionStatus = "draft" | "in_review" | "approved" | "rejected";
type AuthTokens = { accessToken: string; refreshToken: string };

type StablecoinRequest = {
  id: string;
  name: string;
  ticker: string;
  issuer: string;
  owner: boolean;
  network: string;
  contract: string;
  reserve: string;
  attestation: string;
  submitted: string;
  status: RequestStatus;
  rejectionReason?: string;
};

type ApiSubmission = {
  id: string;
  name: string;
  ticker: string;
  issuer?: string;
  owner?: boolean;
  network: string;
  contract: string;
  reserve: string;
  attestation: string;
  submitted?: string;
  status: ApiSubmissionStatus;
  rejectionReason?: string;
};

type IssuerProfileResponse = {
  organizations: Array<{ id: string; slug: string; role: string; name: string; status: string; membershipStatus: string }>;
  submissions: ApiSubmission[];
};

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000/api/v1";
const ACCESS_TOKEN_KEY = "mcbuse.issuer.access-token";
const REFRESH_TOKEN_KEY = "mcbuse.issuer.refresh-token";
const ACCOUNT_EMAIL_KEY = "mcbuse.issuer.email";
const reviewChecks = [
  "Token contract matches the submitted details",
  "Reserve model and disclosures are clear",
  "Latest attestation is accessible and current",
];

class ApiError extends Error {
  constructor(message: string, readonly status: number) {
    super(message);
  }
}

async function fetchJson<T>(path: string, init?: RequestInit): Promise<T> {
  const headers = new Headers(init?.headers);
  headers.set("Content-Type", "application/json");
  const token = typeof window === "undefined"
    ? null
    : window.sessionStorage.getItem(ACCESS_TOKEN_KEY);
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

function normalizeStatus(status: ApiSubmissionStatus | string): RequestStatus {
  switch (status) {
    case "approved":
      return "Approved";
    case "rejected":
      return "Rejected";
    case "draft":
    case "in_review":
    default:
      return "In review";
  }
}

function normalizeRequest(item: ApiSubmission): StablecoinRequest {
  return {
    id: item.id,
    name: item.name,
    ticker: item.ticker,
    issuer: item.issuer ?? "Northstar Labs",
    owner: item.owner ?? true,
    network: item.network,
    contract: item.contract,
    reserve: item.reserve,
    attestation: item.attestation,
    submitted: item.submitted
      ? new Intl.DateTimeFormat("en", { dateStyle: "medium" }).format(new Date(item.submitted))
      : "—",
    status: normalizeStatus(item.status),
    rejectionReason: item.rejectionReason,
  };
}

export default function DashboardPage() {
  const [role, setRole] = useState<RequestRole>("issuer");
  const [canIssue, setCanIssue] = useState(false);
  const [canReview, setCanReview] = useState(false);
  const [accessToken, setAccessToken] = useState<string | null>(null);
  const [sessionReady, setSessionReady] = useState(false);
  const [accountEmail, setAccountEmail] = useState("");
  const [workspaceName, setWorkspaceName] = useState("");
  const [dashboardReady, setDashboardReady] = useState(false);
  const [loginPending, setLoginPending] = useState(false);
  const [loginError, setLoginError] = useState<string | null>(null);
  const [authMode, setAuthMode] = useState<AuthMode>("signin");
  const [issuerRequests, setIssuerRequests] = useState<StablecoinRequest[]>([]);
  const [adminRequests, setAdminRequests] = useState<StablecoinRequest[]>([]);
  const [activeNav, setActiveNav] = useState("primary");
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("All statuses");
  const [dialog, setDialog] = useState<"submit" | "review" | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [checkedItems, setCheckedItems] = useState<string[]>([]);
  const [rejectionMode, setRejectionMode] = useState(false);
  const [rejectionReason, setRejectionReason] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadDashboard = async (requestedRole?: RequestRole) => {
    setIsLoading(true);
    setError(null);

    try {
      const profile = await fetchJson<IssuerProfileResponse>("/issuer/me");
      const activeOrganizations = profile.organizations.filter(
        (organization) => organization.status === "active" && organization.membershipStatus === "active",
      );
      const issuerOrganizations = activeOrganizations.filter(
        (organization) => organization.role === "issuer_admin" || organization.role === "issuer_member",
      );
      const reviewerOrganizations = activeOrganizations.filter(
        (organization) => organization.role === "reviewer",
      );
      const hasIssuerAccess = issuerOrganizations.length > 0;
      const hasReviewerAccess = reviewerOrganizations.length > 0;
      const nextRole = requestedRole ?? (hasIssuerAccess ? "issuer" : "admin");
      if ((nextRole === "issuer" && !hasIssuerAccess) || (nextRole === "admin" && !hasReviewerAccess)) {
        throw new ApiError("This account is not authorized for that workspace.", 403);
      }

      setCanIssue(hasIssuerAccess);
      setCanReview(hasReviewerAccess);
      setRole(nextRole);
      setWorkspaceName(
        nextRole === "issuer"
          ? issuerOrganizations[0]?.name ?? "Issuer workspace"
          : reviewerOrganizations[0]?.name ?? "Review workspace",
      );
      setIssuerRequests((profile.submissions ?? []).map(normalizeRequest));
      const adminData = hasReviewerAccess
        ? await fetchJson<ApiSubmission[]>("/admin/issuer/submissions")
        : [];
      setAdminRequests(adminData.map(normalizeRequest));
      setActiveNav("primary");
    } catch (loadError) {
      if (loadError instanceof ApiError && loadError.status === 401) {
        window.sessionStorage.removeItem(ACCESS_TOKEN_KEY);
        window.sessionStorage.removeItem(REFRESH_TOKEN_KEY);
        setAccessToken(null);
        setLoginError("Your session expired. Sign in again.");
      }
      setError(
        loadError instanceof Error
          ? loadError.message
          : "Unable to load dashboard data from the API.",
      );
    } finally {
      setIsLoading(false);
      setDashboardReady(true);
    }
  };

  useEffect(() => {
    setAccessToken(window.sessionStorage.getItem(ACCESS_TOKEN_KEY));
    setAccountEmail(window.sessionStorage.getItem(ACCOUNT_EMAIL_KEY) ?? "");
    setSessionReady(true);
  }, []);

  useEffect(() => {
    if (!sessionReady) return;
    if (!accessToken) {
      setIsLoading(false);
      return;
    }
    void loadDashboard();
  }, [accessToken, sessionReady]);

  const relevantRequests = role === "issuer" ? issuerRequests : adminRequests;
  const navItems = role === "issuer"
    ? [{ key: "primary", label: "My stablecoins", symbol: "◉" }, { key: "history", label: "Submission history", symbol: "▤" }]
    : [{ key: "primary", label: "Review queue", symbol: "◫" }, { key: "history", label: "All submissions", symbol: "▤" }];
  const visibleRequests = relevantRequests.filter((request) => {
    const matchesNav = activeNav !== "primary"
      || role !== "admin"
      || request.status === "In review";
    const matchesHistory = activeNav !== "history"
      || role !== "issuer"
      || request.status !== "In review";
    const matchesSearch = `${request.name} ${request.ticker} ${request.issuer}`
      .toLowerCase()
      .includes(query.toLowerCase());
    const matchesStatus = statusFilter === "All statuses" || request.status === statusFilter;
    return matchesNav && matchesHistory && matchesSearch && matchesStatus;
  });
  const selectedRequest = relevantRequests.find((request) => request.id === selectedId);
  const inReviewCount = relevantRequests.filter((request) => request.status === "In review").length;
  const approvedCount = relevantRequests.filter((request) => request.status === "Approved").length;
  const rejectedCount = relevantRequests.filter((request) => request.status === "Rejected").length;
  const heading = role === "issuer" ? "My stablecoins" : "Review queue";

  function openReview(requestId: string) {
    setSelectedId(requestId);
    setCheckedItems([]);
    setRejectionMode(false);
    setRejectionReason("");
    setDialog("review");
  }

  async function submitRequest(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);

    try {
      const payload = {
        issuer: String(formData.get("issuer") ?? ""),
        name: String(formData.get("name") ?? ""),
        ticker: String(formData.get("ticker") ?? ""),
        network: String(formData.get("network") ?? ""),
        contract: String(formData.get("contract") ?? ""),
        reserve: String(formData.get("reserve") ?? ""),
        attestation: String(formData.get("attestation") ?? ""),
      };

      const created = await fetchJson<ApiSubmission>("/issuer/submissions", {
        method: "POST",
        body: JSON.stringify(payload),
      });

      await fetchJson(`/issuer/submissions/${created.id}/submit`, {
        method: "POST",
      });

      setQuery("");
      setStatusFilter("All statuses");
      setDialog(null);
      await loadDashboard("issuer");
    } catch (submitError) {
      setError(
        submitError instanceof Error
          ? submitError.message
          : "Unable to submit the stablecoin application.",
      );
    }
  }

  async function decideRequest(status: "Approved" | "Rejected") {
    if (!selectedRequest || (status === "Rejected" && !rejectionReason.trim())) return;

    try {
      await fetchJson(`/admin/issuer/submissions/${selectedRequest.id}/decision`, {
        method: "POST",
        body: JSON.stringify({
          decision: status.toLowerCase(),
          reason: status === "Rejected" ? rejectionReason.trim() : undefined,
          checklist: checkedItems,
        }),
      });

      setDialog(null);
      setRejectionMode(false);
      setRejectionReason("");
      await loadDashboard("admin");
    } catch (decisionError) {
      setError(
        decisionError instanceof Error
          ? decisionError.message
          : "Unable to record the review decision.",
      );
    }
  }

  async function signIn(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    const email = String(formData.get("email") ?? "").trim().toLowerCase();
    const password = String(formData.get("password") ?? "");
    setLoginPending(true);
    setLoginError(null);

    try {
      const tokens = await fetchJson<AuthTokens>("/auth/login", {
        method: "POST",
        body: JSON.stringify({ email, password }),
      });
      window.sessionStorage.setItem(ACCESS_TOKEN_KEY, tokens.accessToken);
      window.sessionStorage.setItem(REFRESH_TOKEN_KEY, tokens.refreshToken);
      window.sessionStorage.setItem(ACCOUNT_EMAIL_KEY, email);
      setAccountEmail(email);
      setDashboardReady(false);
      setAccessToken(tokens.accessToken);
    } catch (signInError) {
      setLoginError(
        signInError instanceof Error ? signInError.message : "Unable to sign in.",
      );
    } finally {
      setLoginPending(false);
    }
  }

  async function signUpIssuer(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    const password = String(formData.get("password") ?? "");
    const passwordConfirmation = String(formData.get("passwordConfirmation") ?? "");
    if (password !== passwordConfirmation) {
      setLoginError("Passwords do not match.");
      return;
    }

    const email = String(formData.get("email") ?? "").trim().toLowerCase();
    setLoginPending(true);
    setLoginError(null);

    try {
      const tokens = await fetchJson<AuthTokens>("/auth/issuer-signup", {
        method: "POST",
        body: JSON.stringify({
          organizationName: String(formData.get("organizationName") ?? "").trim(),
          firstName: String(formData.get("firstName") ?? "").trim(),
          lastName: String(formData.get("lastName") ?? "").trim(),
          username: String(formData.get("username") ?? "").trim(),
          email,
          password,
        }),
      });
      window.sessionStorage.setItem(ACCESS_TOKEN_KEY, tokens.accessToken);
      window.sessionStorage.setItem(REFRESH_TOKEN_KEY, tokens.refreshToken);
      window.sessionStorage.setItem(ACCOUNT_EMAIL_KEY, email);
      setAccountEmail(email);
      setDashboardReady(false);
      setAccessToken(tokens.accessToken);
    } catch (signUpError) {
      setLoginError(
        signUpError instanceof Error ? signUpError.message : "Unable to create your issuer account.",
      );
    } finally {
      setLoginPending(false);
    }
  }

  async function signOut() {
    const refreshToken = window.sessionStorage.getItem(REFRESH_TOKEN_KEY);
    if (refreshToken) {
      try {
        await fetchJson<void>("/auth/logout", {
          method: "POST",
          body: JSON.stringify({ refreshToken }),
        });
      } catch {
        // Clear this browser session even if the API cannot revoke the token.
      }
    }
    window.sessionStorage.removeItem(ACCESS_TOKEN_KEY);
    window.sessionStorage.removeItem(REFRESH_TOKEN_KEY);
    window.sessionStorage.removeItem(ACCOUNT_EMAIL_KEY);
    setAccessToken(null);
    setAccountEmail("");
    setIssuerRequests([]);
    setAdminRequests([]);
    setCanIssue(false);
    setCanReview(false);
    setDashboardReady(false);
    setLoginError(null);
  }

  function switchWorkspace(nextRole: RequestRole) {
    setActiveNav("primary");
    void loadDashboard(nextRole);
  }

  if (!sessionReady || (accessToken && !dashboardReady)) {
    return <main aria-live="polite" className="auth-loading">Connecting to MCBuse issuer services…</main>;
  }

  if (!accessToken) {
    const isSignUp = authMode === "signup";
    return (
      <main className="auth-screen">
        <section aria-labelledby="login-title" className="auth-panel">
          <a className="brand auth-brand" href="#login" aria-label="MCBuse issuer services">
            <span className="brand-mark">M</span><span>MCBuse</span>
          </a>
          <div className="auth-heading">
            <p className="eyebrow">ISSUER SERVICES</p>
            <h1 id="login-title">{isSignUp ? "Create issuer account" : "Sign in"}</h1>
            <p>{isSignUp ? "Set up access for your organization." : "Access your issuer or review workspace."}</p>
          </div>
          <form className="auth-form" onSubmit={isSignUp ? signUpIssuer : signIn}>
            {isSignUp && <>
              <label>Organization legal name<input autoComplete="organization" autoFocus maxLength={255} name="organizationName" required /></label>
              <div className="auth-name-fields">
                <label>First name<input autoComplete="given-name" maxLength={100} name="firstName" required /></label>
                <label>Last name<input autoComplete="family-name" maxLength={100} name="lastName" required /></label>
              </div>
              <label>Username<input autoComplete="username" minLength={3} maxLength={30} name="username" pattern="[A-Za-z0-9_]{3,30}" required /></label>
            </>}
            <label>Email address<input autoComplete={isSignUp ? "email" : "username"} autoFocus={!isSignUp} name="email" required type="email" /></label>
            <label>Password<input autoComplete={isSignUp ? "new-password" : "current-password"} minLength={isSignUp ? 8 : undefined} name="password" pattern={isSignUp ? "(?=.*[a-z])(?=.*[A-Z])(?=.*[0-9])(?=.*[^a-zA-Z0-9]).{8,}" : undefined} required type="password" /></label>
            {isSignUp && <>
              <p className="auth-password-hint">Use at least 8 characters with uppercase, lowercase, a number, and a symbol.</p>
              <label>Confirm password<input autoComplete="new-password" minLength={8} name="passwordConfirmation" required type="password" /></label>
            </>}
            {loginError && <p className="auth-error" role="alert">{loginError}</p>}
            <button className="primary-button" disabled={loginPending} type="submit">
              {loginPending ? (isSignUp ? "Creating account…" : "Signing in…") : (isSignUp ? "Create issuer account" : "Sign in")}
            </button>
          </form>
          <p className="auth-switch">
            {isSignUp ? "Already have an account?" : "Register your organization?"}{" "}
            <button onClick={() => { setAuthMode(isSignUp ? "signin" : "signup"); setLoginError(null); }} type="button">
              {isSignUp ? "Sign in" : "Create an account"}
            </button>
          </p>
          {isSignUp && <p className="auth-footnote">New organizations start with pending verification.</p>}
        </section>
      </main>
    );
  }

  return (
    <main className="app-shell">
      <aside className="sidebar">
        <a className="brand" href="#dashboard" aria-label="MCBuse issuer dashboard home">
          <span className="brand-mark">M</span>
          <span>MCBuse</span>
        </a>

        <div className="workspace-switcher">
          <span className="workspace-icon">{role === "issuer" ? "I" : "R"}</span>
          <span className="workspace-label">
            <strong>{workspaceName}</strong>
            <small>{role === "issuer" ? "Issuer account" : "Admin workspace"}</small>
          </span>
          <span className="chevron">⌄</span>
        </div>

        <p className="nav-label">WORKSPACE</p>
        <nav className="primary-nav" aria-label="Main navigation">
          {navItems.map((item) => (
            <button
              aria-current={activeNav === item.key ? "page" : undefined}
              className={`nav-item${activeNav === item.key ? " active" : ""}`}
              key={item.key}
              onClick={() => setActiveNav(item.key)}
              type="button"
            >
              <span className="nav-symbol" aria-hidden="true">{item.symbol}</span>
              {item.label}
              {role === "admin" && item.key === "primary" && inReviewCount > 0 && <span className="nav-count">{inReviewCount}</span>}
            </button>
          ))}
        </nav>

        <div className="sidebar-bottom">
          <div className="plan-note">
            <span className="plan-kicker">SUBMISSION PROCESS</span>
            <strong>Review usually takes 2–3 days</strong>
            <span className="sync-indicator"><i /> Status updates appear here</span>
          </div>
          <div className="profile-button">
            <span className="avatar">{role === "issuer" ? "IS" : "RV"}</span>
            <span className="profile-label"><strong>{accountEmail}</strong><small>{role === "issuer" ? "Issuer" : "Reviewer"}</small></span>
          </div>
        </div>
      </aside>

      <section className="main-panel" id="dashboard">
        <header className="topbar">
          <div className="breadcrumbs"><span>{role === "issuer" ? "Issuer portal" : "Administration"}</span><b>/</b><strong>{heading}</strong></div>
          <div className="topbar-actions">
            {canIssue && canReview && <div className="role-toggle" aria-label="Choose workspace" role="group">
              <button aria-pressed={role === "issuer"} className={role === "issuer" ? "selected" : ""} onClick={() => switchWorkspace("issuer")} type="button">Issuer</button>
              <button aria-pressed={role === "admin"} className={role === "admin" ? "selected" : ""} onClick={() => switchWorkspace("admin")} type="button">Reviewer</button>
            </div>}
            <button className="signout-button" onClick={() => void signOut()} type="button">Sign out</button>
          </div>
        </header>

        <div className="content-wrap">
          <div className="page-heading">
            <div>
              <p className="eyebrow">{role === "issuer" ? "ISSUER PORTAL" : "MCBUSE OPERATIONS"} <span>·</span> STABLECOIN REGISTRY</p>
              <h1>{heading}</h1>
              <p className="heading-copy">{role === "issuer" ? "Submit a stablecoin and track its review from one place." : "Review issuer submissions and record a clear decision."}</p>
            </div>
            {role === "issuer" && <button className="export-button" onClick={() => setDialog("submit")} type="button"><span>＋</span> Submit stablecoin</button>}
          </div>

          <section className="metrics-grid" aria-label="Submission summary">
            <article className="metric-card featured-metric">
              <div className="metric-topline"><span>{role === "issuer" ? "Submitted stablecoins" : "Total submissions"}</span><span className="metric-icon">◉</span></div>
              <strong className="metric-value">{relevantRequests.length.toString().padStart(2, "0")}</strong>
              <div className="metric-footer"><span className="neutral-change">{role === "issuer" ? "Across your account" : "Across all issuers"}</span></div>
            </article>
            <article className="metric-card">
              <div className="metric-topline"><span>In review</span><span className="metric-icon icon-yellow">◷</span></div>
              <strong className="metric-value">{inReviewCount.toString().padStart(2, "0")}</strong>
              <div className="metric-footer"><span className="attention-change">{role === "admin" ? "Awaiting a decision" : "Being checked by MCBuse"}</span></div>
            </article>
            <article className="metric-card">
              <div className="metric-topline"><span>Approved</span><span className="metric-icon icon-coral">✓</span></div>
              <strong className="metric-value">{approvedCount.toString().padStart(2, "0")}</strong>
              <div className="metric-footer"><span className="positive-change">Validated submissions</span></div>
            </article>
            <article className="metric-card attention-metric">
              <div className="metric-topline"><span>Rejected</span><span className="metric-icon icon-orange">!</span></div>
              <strong className="metric-value">{rejectedCount.toString().padStart(2, "0")}</strong>
              <div className="metric-footer"><span className="neutral-change">{role === "issuer" ? "Review the decision notes" : "Decision recorded"}</span></div>
            </article>
          </section>

          <section className="issuer-section workflow-section" aria-labelledby="requests-title">
            <div className="section-heading">
              <div>
                <div className="title-with-count"><h2 id="requests-title">{role === "admin" && activeNav === "primary" ? "Waiting for review" : role === "issuer" ? (activeNav === "history" ? "Previous submissions" : "Your submissions") : "All submissions"}</h2><span className="result-count">{visibleRequests.length}</span></div>
                <p>{role === "issuer" ? "Check the status and details of every stablecoin request." : "Open a request to verify its details and record your decision."}</p>
              </div>
              <div className="table-actions">
                <label className="search-field">
                  <span aria-hidden="true">⌕</span>
                  <input aria-label="Search submissions" onChange={(event) => setQuery(event.target.value)} placeholder="Search submissions" type="search" value={query} />
                </label>
                <select aria-label="Filter by status" className="status-filter" onChange={(event) => setStatusFilter(event.target.value)} value={statusFilter}>
                  <option>All statuses</option>
                  <option>In review</option>
                  <option>Approved</option>
                  <option>Rejected</option>
                </select>
              </div>
            </div>

            <div className="table-scroll">
              <table>
                <thead>
                  <tr>
                    <th>STABLECOIN</th>
                    {role === "admin" && <th>ISSUER</th>}
                    <th>NETWORK</th>
                    <th>SUBMITTED</th>
                    <th>STATUS</th>
                    <th aria-label="Actions" />
                  </tr>
                </thead>
                <tbody>
                  {isLoading && <tr><td className="empty-state" colSpan={role === "admin" ? 6 : 5}>Loading submissions…</td></tr>}
                  {!isLoading && error && <tr><td className="empty-state" colSpan={role === "admin" ? 6 : 5}>{error}</td></tr>}
                  {!isLoading && !error && visibleRequests.map((request) => (
                    <tr key={request.id}>
                      <td>
                        <div className="issuer-cell">
                          <span className="coin-mark">{request.ticker.slice(0, 1)}</span>
                          <span className="issuer-name"><strong>{request.name}</strong><small>{request.ticker} · {request.id}</small></span>
                        </div>
                      </td>
                      {role === "admin" && <td><span className="attestation-date">{request.issuer}</span></td>}
                      <td><span className="network-tag">{request.network}</span></td>
                      <td><span className="attestation-date">{request.submitted}</span></td>
                      <td><span className={`status-pill ${request.status === "Approved" ? "current" : request.status === "Rejected" ? "rejected" : "review"}`}><i />{request.status}</span></td>
                      <td><button aria-label={`${role === "admin" && request.status === "In review" ? "Review" : "View"} ${request.name}`} className="row-action" onClick={() => openReview(request.id)} type="button">{role === "admin" && request.status === "In review" ? "Review →" : "View →"}</button></td>
                    </tr>
                  ))}
                  {!isLoading && !error && visibleRequests.length === 0 && <tr><td className="empty-state" colSpan={role === "admin" ? 6 : 5}>No submissions match these filters.</td></tr>}
                </tbody>
              </table>
            </div>
            <footer className="table-footer"><span>Showing <strong>{visibleRequests.length}</strong> {role === "issuer" ? "of your submissions" : "submissions"}</span><span>{role === "admin" ? "Decisions are recorded in the request history." : "Need to update a request? Contact issuer support."}</span></footer>
          </section>

          <footer className="page-footer"><span>Submitting a stablecoin does not guarantee approval or listing.</span><span>MCBuse <b>·</b> Issuer services</span></footer>
        </div>
      </section>

      {dialog === "submit" && (
        <div className="modal-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) setDialog(null); }}>
          <section aria-labelledby="submit-title" aria-modal="true" className="modal-card submission-modal" role="dialog">
            <header className="modal-heading">
              <div><p className="eyebrow">NEW APPLICATION</p><h2 id="submit-title">Submit a stablecoin</h2><p>Share the token and reserve details for MCBuse review.</p></div>
              <button aria-label="Close submission form" className="modal-close" onClick={() => setDialog(null)} type="button">×</button>
            </header>
            <form className="submission-form" onSubmit={submitRequest}>
              <div className="form-grid">
                <label>Issuer legal name<input autoComplete="organization" name="issuer" placeholder="e.g. Northstar Labs" required /></label>
                <label>Stablecoin name<input name="name" placeholder="e.g. Northstar Dollar" required /></label>
                <label>Ticker symbol<input autoCapitalize="characters" maxLength={10} name="ticker" placeholder="e.g. NSD" required /></label>
                <label>Network<select defaultValue="" name="network" required><option disabled value="">Select network</option><option>Ethereum</option><option>Solana</option><option>Base</option><option>Polygon</option><option>Other</option></select></label>
                <label className="form-span">Token contract address<input autoCapitalize="none" name="contract" placeholder="Contract address or mint address" required /></label>
                <label className="form-span">Reserve composition<input name="reserve" placeholder="Describe the assets backing this stablecoin" required /></label>
                <label className="form-span">Latest reserve attestation URL<input name="attestation" placeholder="https://" type="url" required /></label>
              </div>
              <p className="form-note">By submitting, you confirm these details are accurate and authorize MCBuse to review the provided disclosures.</p>
              <div className="modal-actions"><button className="secondary-button" onClick={() => setDialog(null)} type="button">Cancel</button><button className="primary-button" type="submit">Submit for review</button></div>
            </form>
          </section>
        </div>
      )}

      {dialog === "review" && selectedRequest && (
        <div className="modal-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) setDialog(null); }}>
          <section aria-labelledby="review-title" aria-modal="true" className="modal-card review-modal" role="dialog">
            <header className="modal-heading">
              <div><p className="eyebrow">{role === "admin" ? "SUBMISSION REVIEW" : "SUBMISSION DETAILS"}</p><h2 id="review-title">{selectedRequest.name} <span>{selectedRequest.ticker}</span></h2><p>{selectedRequest.issuer} · submitted {selectedRequest.submitted}</p></div>
              <button aria-label="Close request details" className="modal-close" onClick={() => setDialog(null)} type="button">×</button>
            </header>
            <div className="request-details">
              <div><span>Network</span><strong>{selectedRequest.network}</strong></div>
              <div><span>Reserve composition</span><strong>{selectedRequest.reserve}</strong></div>
              <div><span>Token contract / mint</span><strong className="contract-value">{selectedRequest.contract}</strong></div>
              <div><span>Latest attestation</span><a href={selectedRequest.attestation} rel="noreferrer" target="_blank">Open issuer disclosure ↗</a></div>
              <div><span>Current status</span><strong><span className={`status-pill ${selectedRequest.status === "Approved" ? "current" : selectedRequest.status === "Rejected" ? "rejected" : "review"}`}><i />{selectedRequest.status}</span></strong></div>
              {selectedRequest.rejectionReason && <div className="decision-note"><span>Decision note</span><strong>{selectedRequest.rejectionReason}</strong></div>}
            </div>
            {role === "admin" && selectedRequest.status === "In review" && (
              <div className="review-controls">
                <h3>Verification checklist</h3>
                <p>Complete each check before validating this submission.</p>
                <div className="checklist">
                  {reviewChecks.map((check) => <label key={check}><input checked={checkedItems.includes(check)} onChange={(event) => setCheckedItems((current) => event.target.checked ? [...current, check] : current.filter((item) => item !== check))} type="checkbox" />{check}</label>)}
                </div>
                {rejectionMode && <label className="rejection-field">Reason for rejection<textarea onChange={(event) => setRejectionReason(event.target.value)} placeholder="Explain what needs to change for the issuer." required value={rejectionReason} /></label>}
                <div className="modal-actions decision-actions">
                  <button className="reject-button" onClick={() => rejectionMode ? decideRequest("Rejected") : setRejectionMode(true)} type="button">{rejectionMode ? "Confirm rejection" : "Reject"}</button>
                  <button className="primary-button" disabled={checkedItems.length !== reviewChecks.length || rejectionMode} onClick={() => decideRequest("Approved")} type="button">Validate submission</button>
                </div>
                {rejectionMode && !rejectionReason.trim() && <p className="validation-hint">Add a reason to confirm rejection.</p>}
              </div>
            )}
            {role === "issuer" && selectedRequest.status === "Rejected" && <p className="issuer-next-step">Review the decision note and update your disclosures before submitting again.</p>}
          </section>
        </div>
      )}
    </main>
  );
}
