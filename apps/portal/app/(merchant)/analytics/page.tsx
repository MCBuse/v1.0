import { redirectMerchantBookmark } from "@/lib/server/merchant-route-redirect";

/** The Analytics menu opens General Analytics; Deep analytics lives at /analytics/deep. */
export default async function AnalyticsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  redirectMerchantBookmark("/analytics/general", await searchParams);
}
