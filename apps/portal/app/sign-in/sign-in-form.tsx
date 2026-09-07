"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Alert } from "@repo/ui/alert";
import { Button } from "@repo/ui/button";
import { Field, FieldLabel, Input } from "@repo/ui/field";

export function SignInForm() {
  const router = useRouter();
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);
  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setPending(true);
    const form = new FormData(event.currentTarget);
    try {
      const response = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: form.get("email"),
          password: form.get("password"),
        }),
      });
      const result = (await response.json()) as { message?: string };
      if (!response.ok) throw new Error(result.message ?? "Sign-in failed");
      router.replace("/overview");
      router.refresh();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Sign-in failed");
    } finally {
      setPending(false);
    }
  }
  return (
    <form className="mt-8 grid gap-5" method="post" onSubmit={submit}>
      {error ? (
        <Alert className="border-red-200 bg-red-50 text-red-800">{error}</Alert>
      ) : null}
      <Field>
        <FieldLabel htmlFor="email">Email address</FieldLabel>
        <Input
          id="email"
          name="email"
          type="email"
          autoComplete="username"
          required
          maxLength={255}
        />
      </Field>
      <Field>
        <FieldLabel htmlFor="password">Password</FieldLabel>
        <Input
          id="password"
          name="password"
          type="password"
          autoComplete="current-password"
          required
          maxLength={200}
        />
      </Field>
      <Button type="submit" size="lg" disabled={pending}>
        {pending ? "Signing in…" : "Sign in"}
      </Button>
      <p className="text-center text-xs leading-5 text-slate-400">
        Access is limited to merchant accounts provisioned for this pilot.
      </p>
    </form>
  );
}
