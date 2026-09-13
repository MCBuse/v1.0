import { redirect } from "next/navigation";
import { PortalShell } from "@/components/portal-shell";
import { getMerchantSessionState } from "@/lib/server/session";

export default async function MerchantLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await getMerchantSessionState();
  if (session === "anonymous") redirect("/sign-in");
  if (session === "refresh" || session === "rejected")
    redirect("/api/auth/session?next=/overview");
  return <PortalShell>{children}</PortalShell>;
}
