import { redirectMerchantBookmark } from "@/lib/server/merchant-route-redirect";

export default async function AnalyticsInventoryPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  redirectMerchantBookmark("/inventory", await searchParams);
}
