import { redirectMerchantBookmark } from "@/lib/server/merchant-route-redirect";

export default async function InvoicesPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  redirectMerchantBookmark("/payment/invoices", await searchParams);
}
