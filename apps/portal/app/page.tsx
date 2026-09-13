import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { ACCESS_COOKIE, REFRESH_COOKIE } from "@/lib/server/session";

export default async function Home() {
  const jar = await cookies();
  redirect(
    jar.has(ACCESS_COOKIE) || jar.has(REFRESH_COOKIE)
      ? "/api/auth/session?next=/overview"
      : "/sign-in",
  );
}
