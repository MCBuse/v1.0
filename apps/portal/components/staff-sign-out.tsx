"use client";
import { useState } from "react";
import { getCsrfToken } from "@/lib/client/csrf";
export function StaffSignOut() {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function signOut() {
    setBusy(true);
    setError("");
    try {
      if (!getCsrfToken()) await fetch("/api/staff/me", { cache: "no-store" });
      const response = await fetch("/api/auth/logout", {
        method: "POST",
        headers: { "X-CSRF-Token": getCsrfToken() ?? "" },
      });
      if (!response.ok) throw new Error("Sign out failed. Please retry.");
      window.location.assign("/sign-in");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Sign out failed.");
      setBusy(false);
    }
  }
  return (
    <span>
      <button
        className="text-sm"
        disabled={busy}
        onClick={() => void signOut()}
      >
        {busy ? "Signing out…" : "Sign out"}
      </button>
      {error ? (
        <span role="alert" className="ml-2 text-xs text-red-700">
          {error}
        </span>
      ) : null}
    </span>
  );
}
