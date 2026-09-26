import { redirectMerchantBookmark } from "@/lib/server/merchant-route-redirect";

export default async function TransactionsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  redirectMerchantBookmark("/payment/transactions", await searchParams);
}
