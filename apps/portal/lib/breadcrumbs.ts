export type Crumb = { label: string; href: string };

const HOME: Crumb = { label: "Overview", href: "/overview" };

/**
 * Merchant page labels by route. The trail follows the URL, so
 * /payment/transactions reads Overview › Payment › Transactions.
 * Add new merchant routes here; unknown segments are left out of the trail.
 */
const LABELS: Record<string, string> = {
  "/inventory": "Inventory",
  "/payment": "Payment",
  "/payment/transactions": "Transactions",
  "/payment/invoices": "Invoices",
  "/analytics": "Analytics",
  "/analytics/general": "General analytics",
  "/analytics/deep": "Deep analytics",
  "/credit-assessment": "Credit Assessment",
  "/credit-assessment/business-profile": "Business profile",
  "/credit-assessment/reconciliation": "Payout reconciliation",
  "/finance-match": "Finance Match",
};

/** Routes that only redirect link straight to the page they open. */
const LANDING: Record<string, string> = {
  "/analytics": "/analytics/general",
};

export function breadcrumbsFor(pathname: string): Crumb[] {
  const trail: Crumb[] = [HOME];
  let route = "";
  for (const segment of pathname.split("/").filter(Boolean)) {
    route += `/${segment}`;
    const label = LABELS[route];
    if (label) trail.push({ label, href: LANDING[route] ?? route });
  }
  return trail;
}
