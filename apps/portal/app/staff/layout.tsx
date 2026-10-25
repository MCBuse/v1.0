import { StaffSignOut } from "@/components/staff-sign-out";
import Link from "next/link";
import { redirect } from "next/navigation";
import { getStaffSession } from "@/lib/server/session";
export default async function StaffLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { state: session, permissions } = await getStaffSession();
  if (session === "anonymous") redirect("/sign-in");
  if (session === "refresh")
    redirect("/api/auth/session?next=/staff/credit-assessments");
  if (session === "rejected")
    return (
      <main className="mx-auto max-w-xl p-8">
        <h1 className="text-2xl font-semibold">Staff access required</h1>
        <p className="my-4">
          This workspace is available to provisioned MCBuse staff.
        </p>
        <Link href="/sign-in">Sign in with a staff account</Link>
      </main>
    );
  if (session === "unavailable")
    return (
      <main className="p-8">
        Staff access could not be verified. Please reload to try again.
      </main>
    );
  // Each area is shown only with its permission; the API enforces it as well.
  const areas = [
    permissions.includes("credit_analyst") && {
      href: "/staff/credit-assessments",
      label: "Credit pilot",
    },
    permissions.includes("change_intelligence_operator") && {
      href: "/staff/changes",
      label: "Changes: update now",
    },
  ].filter((area): area is { href: string; label: string } => Boolean(area));
  return (
    <div className="min-h-screen bg-slate-50 text-slate-950">
      <header className="border-b bg-white px-6 py-5">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-4">
          <Link href={areas[0]?.href ?? "/staff"} className="font-semibold">
            MCBuse{" "}
            <span className="ml-2 text-sm font-normal text-slate-500">
              Staff workspace
            </span>
          </Link>
          <nav
            aria-label="Staff areas"
            className="flex flex-wrap gap-5 text-sm"
          >
            {areas.map((area) => (
              <Link key={area.href} href={area.href}>
                {area.label}
              </Link>
            ))}
            <StaffSignOut />
          </nav>
        </div>
      </header>
      <main className="mx-auto max-w-6xl p-4 sm:p-8">{children}</main>
    </div>
  );
}
