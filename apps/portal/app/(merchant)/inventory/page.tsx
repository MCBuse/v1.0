import { redirectMerchantBookmark } from "@/lib/server/merchant-route-redirect";

export default async function InventoryPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  redirectMerchantBookmark("/analytics/inventory", await searchParams);
}
