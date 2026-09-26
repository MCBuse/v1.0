import { redirectMerchantBookmark } from "@/lib/server/merchant-route-redirect";

/** Former home of Transactions; kept so bookmarks and old links still work. */
export default async function AnalyticsTransactionsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  redirectMerchantBookmark("/payment/transactions", await searchParams);
}
