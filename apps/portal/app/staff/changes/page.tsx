import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getStaffSession } from "@/lib/server/session";
import { UpdateNowWorkspace } from "./workspace";

export const metadata: Metadata = {
  title: "Changes: update now · MCBuse staff",
};

export default async function Page() {
  const { permissions } = await getStaffSession();
  if (!permissions.includes("change_intelligence_operator")) notFound();
  return <UpdateNowWorkspace />;
}
