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
  "/analytics/changes": "Changes",
  "/credit-assessment": "Credit Assessment",
  "/credit-assessment/business-profile": "Business profile",
  "/credit-assessment/reconciliation": "Payout reconciliation",
  "/finance-match": "Finance Match",
};

/** Parameterised routes: the parent route plus one id segment. */
const DYNAMIC: Record<string, string> = {
  "/analytics/changes": "Change details",
};

/** Routes that only redirect link straight to the page they open. */
const LANDING: Record<string, string> = {
  "/analytics": "/analytics/general",
};

export function breadcrumbsFor(pathname: string): Crumb[] {
  const trail: Crumb[] = [HOME];
  let route = "";
  for (const segment of pathname.split("/").filter(Boolean)) {
    const parent = route;
    route += `/${segment}`;
    const label = LABELS[route] ?? DYNAMIC[parent];
    if (label) trail.push({ label, href: LANDING[route] ?? route });
  }
  return trail;
}
