import { redirectMerchantBookmark } from "@/lib/server/merchant-route-redirect";

export default async function BusinessProfilePage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  redirectMerchantBookmark("/credit-assessment/business-profile", await searchParams);
}
