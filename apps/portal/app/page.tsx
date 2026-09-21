import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { ACCESS_COOKIE, REFRESH_COOKIE, WORKSPACE_COOKIE } from "@/lib/server/session";

export default async function Home() {
  const jar = await cookies();
  redirect(
    jar.has(ACCESS_COOKIE) || jar.has(REFRESH_COOKIE)
      ? (jar.get(WORKSPACE_COOKIE)?.value === "staff" ? "/api/auth/session?next=/staff/credit-assessments" : "/api/auth/session?next=/overview")
      : "/sign-in",
  );
}
