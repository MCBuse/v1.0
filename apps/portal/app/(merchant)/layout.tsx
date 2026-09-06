import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { PortalShell } from "@/components/portal-shell";
import { ACCESS_COOKIE, REFRESH_COOKIE } from "@/lib/server/session";

export default async function MerchantLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const jar = await cookies();
  if (!jar.has(ACCESS_COOKIE) && !jar.has(REFRESH_COOKIE)) redirect("/sign-in");
  return <PortalShell>{children}</PortalShell>;
}
