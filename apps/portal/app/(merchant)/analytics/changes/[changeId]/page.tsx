import { ChangeDetailView } from "@/components/changes/change-detail-view";

export const metadata = { title: "Change details" };
export default async function ChangeDetailPage({
  params,
}: {
  params: Promise<{ changeId: string }>;
}) {
  const { changeId } = await params;
  return <ChangeDetailView changeId={changeId} />;
}
