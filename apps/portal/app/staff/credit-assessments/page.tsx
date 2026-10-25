import { notFound, redirect } from "next/navigation";
import { getStaffSession } from "@/lib/server/session";
import { StaffCreditWorkspace } from "./workspace";
export default async function Page() {
  const { permissions } = await getStaffSession();
  if (!permissions.includes("credit_analyst")) {
    // Sign-in sends staff here; operators without credit access go to their area.
    if (permissions.includes("change_intelligence_operator"))
      redirect("/staff/changes");
    notFound();
  }
  return <StaffCreditWorkspace />;
}
