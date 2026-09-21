import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { Logo } from "@/components/logo";
import { ACCESS_COOKIE, REFRESH_COOKIE, WORKSPACE_COOKIE } from "@/lib/server/session";
import { SignInForm } from "./sign-in-form";

export const metadata = { title: "Sign in" };

export default async function SignInPage() {
  const jar = await cookies();
  if (jar.has(ACCESS_COOKIE) || jar.has(REFRESH_COOKIE))
    redirect((jar.get(WORKSPACE_COOKIE)?.value === "staff" ? "/api/auth/session?next=/staff/credit-assessments" : "/api/auth/session?next=/overview"));
  const image = process.env.NEXT_PUBLIC_AUTH_BACKGROUND_URL?.trim();
  return (
    <main className="min-h-dvh bg-white lg:grid lg:grid-cols-[minmax(28rem,1fr)_minmax(32rem,42rem)]">
      <section
        className="auth-art relative hidden min-h-dvh overflow-hidden p-12 lg:flex"
        style={
          {
            "--auth-image": image
              ? `url(${JSON.stringify(image).slice(1, -1)})`
              : "none",
          } as React.CSSProperties
        }
      >
        <div className="relative z-10 flex w-full flex-col justify-between">
          <Logo inverse />
          <div className="max-w-xl pb-4 text-white">
            <p className="text-sm font-medium uppercase tracking-[.14em] text-white/70">
              Merchant payments
            </p>
            <h1 className="mt-4 text-4xl font-semibold leading-tight">
              Know what came in. Keep your business moving.
            </h1>
            <p className="mt-4 max-w-md text-base leading-7 text-white/75">
              Create a payment request, let your customer scan, and see the sale
              arrive automatically.
            </p>
          </div>
        </div>
      </section>
      <section className="flex min-h-dvh items-center justify-center px-6 py-12 sm:px-10">
        <div className="w-full max-w-md">
          <div className="mb-12 lg:hidden">
            <Logo />
            <p className="mt-6 text-sm leading-6 text-slate-500">
              Receive and track business payments in one calm workspace.
            </p>
          </div>
          <p className="text-sm font-semibold text-blue-700">Merchant portal</p>
          <h2 className="mt-2 text-3xl font-semibold tracking-tight text-slate-950">
            Welcome back
          </h2>
          <p className="mt-3 text-sm leading-6 text-slate-500">
            Sign in with your provisioned MCBuse account.
          </p>
          <SignInForm />
        </div>
      </section>
    </main>
  );
}
