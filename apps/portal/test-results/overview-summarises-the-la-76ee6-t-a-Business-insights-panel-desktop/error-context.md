# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: overview.spec.ts >> summarises the latest assessment and email without a Business insights panel
- Location: tests/overview.spec.ts:238:1

# Error details

```
Error: expect(locator).toBeVisible() failed

Locator: locator('#overview-credit').getByText('64.3 / 100')
Expected: visible
Timeout: 5000ms
Error: element(s) not found

Call log:
  - Expect "toBeVisible" locator('#overview-credit').getByText('64.3 / 100') with timeout 5000ms
  - waiting for locator('#overview-credit').getByText('64.3 / 100')

```

```yaml
- complementary:
  - img "MCBuse"
  - navigation "Primary":
    - link "Overview":
      - /url: /overview
    - link "Inventory":
      - /url: /inventory
    - link "Payment":
      - /url: /payment
    - link "Analytics":
      - /url: /analytics
    - link "Credit Assessment":
      - /url: /credit-assessment
    - link "Finance Match":
      - /url: /finance-match
  - button "Sign out"
- banner:
  - paragraph: Merchant workspace
  - text: Records updated 21:52
  - button "Create request"
- main:
  - paragraph: Overview
  - heading "Your business, at a glance" [level=1]
  - paragraph: Recorded sales include finalized MCBuse payments and merchant-recorded cash.
  - paragraph: Updated 21:52:08
  - region "Payment":
    - heading "Payment" [level=2]
    - link "Open Payment":
      - /url: /payment
    - heading "Payments needing attention" [level=3]
    - status:
      - strong: Payment could not be completed
      - text: Create a new payment request and ask the customer to try again. Reported 26 Sept 2026, 21:52
    - paragraph: Unresolved payments are never included in received totals.
    - paragraph: Estimated available balance
    - text: €4,215.50 Current estimate
    - paragraph: Recorded sales today
    - text: €184.20 1 transactions today
    - paragraph: Average transaction today
    - text: €184.20
    - paragraph: Payment capture quality
    - text: 50.00% Needs attention
    - heading "Recent recorded activity" [level=3]
    - paragraph: 1 open payment request is waiting or finalizing.
    - table:
      - rowgroup:
        - row "Receipt Description Time Amount":
          - columnheader "Receipt"
          - columnheader "Description"
          - columnheader "Time"
          - columnheader "Amount"
      - rowgroup:
        - row "MCB-TEST123 Lunch service 26 Sept 2026, 21:52 €92.10":
          - cell "MCB-TEST123"
          - cell "Lunch service"
          - cell "26 Sept 2026, 21:52"
          - cell "€92.10"
  - region "Analytics":
    - heading "Analytics" [level=2]
    - link "Open Analytics":
      - /url: /analytics/general
    - paragraph: Recorded sales · 30 days
    - text: €184.20 1 recorded sales
    - paragraph: Top product today
    - text: No product-linked sales
    - paragraph: Busiest hour today
    - text: 12:00
    - paragraph: Low-stock products
    - text: "2"
    - link "View Inventory":
      - /url: /inventory
    - heading "Daily trend" [level=3]
    - paragraph: Your total sales each day over the last 30 days, digital and cash combined. Hover a bar to see the amount.
    - img "Daily recorded sales amount for the last 30 days"
    - text: 5 Sept 5 Sept
    - table "Daily recorded sales amount for the last 30 days":
      - caption: Daily recorded sales amount for the last 30 days
      - rowgroup:
        - row "Period Amount Payments":
          - columnheader "Period"
          - columnheader "Amount"
          - columnheader "Payments"
      - rowgroup:
        - row "2026-09-05 €184.20 1":
          - cell "2026-09-05"
          - cell "€184.20"
          - cell "1"
    - heading "Sales rhythm" [level=3]
    - paragraph: "When in the day you sell: sales in each hour, added up over the last 30 days. Taller bars are your busiest hours."
    - img "Hourly sales rhythm for the last 30 days"
    - text: 00:00 12:00 23:00
    - table "Hourly sales rhythm":
      - caption: Hourly sales rhythm
      - rowgroup:
        - row "Hour Amount Payments":
          - columnheader "Hour"
          - columnheader "Amount"
          - columnheader "Payments"
      - rowgroup:
        - row "00:00 €0.00 0":
          - cell "00:00"
          - cell "€0.00"
          - cell "0"
        - row "01:00 €0.00 0":
          - cell "01:00"
          - cell "€0.00"
          - cell "0"
        - row "02:00 €0.00 0":
          - cell "02:00"
          - cell "€0.00"
          - cell "0"
        - row "03:00 €0.00 0":
          - cell "03:00"
          - cell "€0.00"
          - cell "0"
        - row "04:00 €0.00 0":
          - cell "04:00"
          - cell "€0.00"
          - cell "0"
        - row "05:00 €0.00 0":
          - cell "05:00"
          - cell "€0.00"
          - cell "0"
        - row "06:00 €0.00 0":
          - cell "06:00"
          - cell "€0.00"
          - cell "0"
        - row "07:00 €0.00 0":
          - cell "07:00"
          - cell "€0.00"
          - cell "0"
        - row "08:00 €0.00 0":
          - cell "08:00"
          - cell "€0.00"
          - cell "0"
        - row "09:00 €0.00 0":
          - cell "09:00"
          - cell "€0.00"
          - cell "0"
        - row "10:00 €0.00 0":
          - cell "10:00"
          - cell "€0.00"
          - cell "0"
        - row "11:00 €0.00 0":
          - cell "11:00"
          - cell "€0.00"
          - cell "0"
        - row "12:00 €184.20 1":
          - cell "12:00"
          - cell "€184.20"
          - cell "1"
        - row "13:00 €0.00 0":
          - cell "13:00"
          - cell "€0.00"
          - cell "0"
        - row "14:00 €0.00 0":
          - cell "14:00"
          - cell "€0.00"
          - cell "0"
        - row "15:00 €0.00 0":
          - cell "15:00"
          - cell "€0.00"
          - cell "0"
        - row "16:00 €0.00 0":
          - cell "16:00"
          - cell "€0.00"
          - cell "0"
        - row "17:00 €0.00 0":
          - cell "17:00"
          - cell "€0.00"
          - cell "0"
        - row "18:00 €0.00 0":
          - cell "18:00"
          - cell "€0.00"
          - cell "0"
        - row "19:00 €0.00 0":
          - cell "19:00"
          - cell "€0.00"
          - cell "0"
        - row "20:00 €0.00 0":
          - cell "20:00"
          - cell "€0.00"
          - cell "0"
        - row "21:00 €0.00 0":
          - cell "21:00"
          - cell "€0.00"
          - cell "0"
        - row "22:00 €0.00 0":
          - cell "22:00"
          - cell "€0.00"
          - cell "0"
        - row "23:00 €0.00 0":
          - cell "23:00"
          - cell "€0.00"
          - cell "0"
  - region "Credit Assessment":
    - heading "Credit Assessment" [level=2]
    - link "Open Credit Assessment":
      - /url: /credit-assessment
    - paragraph: Latest financial profile
    - text: 64.3 / 100 Saved 25 Sept 2026, 09:00
    - paragraph: Profile confidence
    - text: Medium Coverage 80.0%
    - paragraph: Evidence readiness
    - text: building history Not a credit decision
    - paragraph: Saved assessments
    - text: 1 Latest 25 Sept 2026, 09:00
  - region "Finance Match":
    - heading "Finance Match" [level=2]
    - link "Open Finance Match":
      - /url: /finance-match
    - paragraph: Saved PDFs
    - text: "0"
    - paragraph: Latest email
    - text: Accepted by mail server loans@bank.example · 25 Sept 2026, 09:30
- alert
```

# Test source

```ts
  161 |             source: "mcbuse_payment",
  162 |             verification: "internally_confirmed",
  163 |             environment: "test",
  164 |             status: "recorded",
  165 |             occurredAt: new Date().toISOString(),
  166 |           },
  167 |         ],
  168 |         page: 1,
  169 |         pageSize: 5,
  170 |         totalItems: 1,
  171 |         totalPages: 1,
  172 |       }),
  173 |     }),
  174 |   );
  175 |   await page.route("**/api/merchant/me/assessments", (route) =>
  176 |     route.fulfill({ json: { assessments: [] } }),
  177 |   );
  178 |   await page.route("**/api/merchant/me/finance-packages", (route) =>
  179 |     route.fulfill({ json: { items: [] } }),
  180 |   );
  181 |   await page.route("**/api/merchant/me/finance-packages/email-attempts", (route) =>
  182 |     route.fulfill({ json: { items: [] } }),
  183 |   );
  184 | });
  185 | 
  186 | test("overview renders money records and responsive navigation", async ({
  187 |   page,
  188 | }, testInfo) => {
  189 |   const browserErrors: string[] = [];
  190 |   page.on("pageerror", (error) => browserErrors.push(error.message));
  191 |   page.on("console", (message) => {
  192 |     if (message.type() === "error") browserErrors.push(message.text());
  193 |   });
  194 |   await page.goto("/overview");
  195 |   await page.waitForTimeout(500);
  196 |   if (browserErrors.length) throw new Error(browserErrors.join("\n"));
  197 |   await expect(
  198 |     page.getByRole("heading", { name: "Your business, at a glance" }),
  199 |   ).toBeVisible();
  200 |   await expect(page.getByText("€4,215.50")).toBeVisible();
  201 |   await expect(page.getByText("Lunch service")).toBeVisible();
  202 |   await expect(page.getByText("Payment could not be completed")).toBeVisible();
  203 |   await expect(page.getByText("50.00%")).toBeVisible();
  204 |   await expect(
  205 |     page.getByRole("img", {
  206 |       name: "Daily recorded sales amount for the last 30 days",
  207 |     }),
  208 |   ).toBeVisible();
  209 |   await expect(
  210 |     page.getByRole("img", {
  211 |       name: "Hourly sales rhythm for the last 30 days",
  212 |     }),
  213 |   ).toBeVisible();
  214 |   await expect(
  215 |     page.getByRole("table", {
  216 |       name: "Daily recorded sales amount for the last 30 days",
  217 |     }),
  218 |   ).toHaveCount(1);
  219 |   await expect(
  220 |     page.getByRole("table", { name: "Hourly sales rhythm" }),
  221 |   ).toHaveCount(1);
  222 |   if (testInfo.project.name === "desktop") {
  223 |     await expect(
  224 |       page.getByRole("navigation", { name: "Primary" }),
  225 |     ).toBeVisible();
  226 |   } else {
  227 |     await expect(
  228 |       page.getByRole("navigation", { name: "Mobile" }),
  229 |     ).toBeVisible();
  230 |     await expect(page.getByRole("button", { name: "Receive" })).toHaveCount(0);
  231 |   }
  232 |   await expect(
  233 |     page.getByRole("button", { name: "Create request" }),
  234 |   ).toBeVisible();
  235 |   await expect(page.getByRole("dialog")).toHaveCount(0);
  236 | });
  237 | 
  238 | test("summarises the latest assessment and email without a Business insights panel", async ({ page }, testInfo) => {
  239 |   test.skip(testInfo.project.name !== "desktop", "one rendered summary proof is enough");
  240 |   let insightsRequested = false;
  241 |   await page.route("**/api/merchant/me/insights**", (route) => {
  242 |     insightsRequested = true;
  243 |     return route.fulfill({ status: 500, json: { message: "Overview must not request insights" } });
  244 |   });
  245 |   await page.unroute("**/api/merchant/me/assessments");
  246 |   await page.route("**/api/merchant/me/assessments", (route) =>
  247 |     route.fulfill({ json: { assessments: [assessment({ score: 64.25 })] } }),
  248 |   );
  249 |   await page.unroute("**/api/merchant/me/finance-packages/email-attempts");
  250 |   await page.route("**/api/merchant/me/finance-packages/email-attempts", (route) =>
  251 |     route.fulfill({
  252 |       json: {
  253 |         items: [
  254 |           { id: "e1", packageId: "p1", recipientEmail: "loans@bank.example", status: "accepted_by_smtp", createdAt: "2026-09-25T09:30:00.000Z" },
  255 |         ],
  256 |       },
  257 |     }),
  258 |   );
  259 |   await page.goto("/overview");
  260 |   const credit = page.locator("#overview-credit");
> 261 |   await expect(credit.getByText("64.3 / 100")).toBeVisible();
      |                                                ^ Error: expect(locator).toBeVisible() failed
  262 |   await expect(credit.getByText("Medium")).toBeVisible();
  263 |   await expect(credit.getByText("Coverage 80.0%")).toBeVisible();
  264 |   const finance = page.locator("#overview-finance");
  265 |   await expect(finance.getByText("Accepted by mail server")).toBeVisible();
  266 |   await expect(finance.getByText("loans@bank.example", { exact: false })).toBeVisible();
  267 |   await expect(page.getByText("Delivered", { exact: false })).toHaveCount(0);
  268 |   await expect(page.getByRole("heading", { name: "Business insights" })).toHaveCount(0);
  269 |   expect(insightsRequested).toBe(false);
  270 | });
  271 | 
  272 | test("names missing inputs instead of showing a profile score", async ({ page }, testInfo) => {
  273 |   test.skip(testInfo.project.name !== "desktop", "one rendered summary proof is enough");
  274 |   await page.unroute("**/api/merchant/me/assessments");
  275 |   await page.route("**/api/merchant/me/assessments", (route) =>
  276 |     route.fulfill({ json: { assessments: [assessment({ score: null, unavailableFields: ["loanAmountMinor", "commencementDate"] })] } }),
  277 |   );
  278 |   await page.goto("/overview");
  279 |   const credit = page.locator("#overview-credit");
  280 |   await expect(credit.getByText("Not available")).toBeVisible();
  281 |   await expect(credit.getByText("2 required inputs missing")).toBeVisible();
  282 |   await expect(credit.getByText("Profile confidence")).toHaveCount(0);
  283 |   await expect(credit.getByText("/ 100")).toHaveCount(0);
  284 | });
  285 | 
  286 | function assessment({ score, unavailableFields = [] }: { score: number | null; unavailableFields?: string[] }) {
  287 |   return {
  288 |     id: "a1",
  289 |     modelId: "george-financial-profile-v1",
  290 |     modelVersion: "2026.09.1",
  291 |     stage: "building_history",
  292 |     score: null,
  293 |     evidenceWindow: { from: "2026-08-26T00:00:00.000Z", to: "2026-09-25T00:00:00.000Z", days: 30 },
  294 |     passedRequirements: [],
  295 |     missingRequirements: [],
  296 |     reliability: {},
  297 |     sourceCoverage: {},
  298 |     limitations: [],
  299 |     disclaimer: "Not a lending decision.",
  300 |     businessProfile: {},
  301 |     createdAt: "2026-09-25T09:00:00.000Z",
  302 |     actorUserId: "u1",
  303 |     credit: {
  304 |       status: "ready",
  305 |       modelVersion: "2026.09.1",
  306 |       businessAgeMonths: 18,
  307 |       unavailableFields,
  308 |       financialProfile: score === null ? null : { score, scale: "0-100", breakdown: {} },
  309 |       profileConfidence: score === null ? null : { label: "Medium", confidenceScore: 0.7, coveragePct: 80, dataReliabilityQualityPct: 90, fieldsFilled: 8, fieldsTotal: 10 },
  310 |       missingReasons: {},
  311 |       indicators: {},
  312 |       provenance: {},
  313 |       integritySummary: [],
  314 |     },
  315 |   };
  316 | }
  317 | 
  318 | test("validates the receive drawer and restores trigger focus", async ({
  319 |   page,
  320 | }) => {
  321 |   await page.goto("/overview");
  322 |   const trigger = page.getByRole("button", { name: "Create request" });
  323 |   await trigger.click();
  324 |   const dialog = page.getByRole("dialog");
  325 |   await expect(dialog).toBeVisible();
  326 |   await dialog
  327 |     .getByRole("textbox", { name: "Amount", exact: true })
  328 |     .fill("1.234");
  329 |   await dialog.getByRole("button", { name: "Create payment request" }).click();
  330 |   await expect(
  331 |     page.getByText("Enter a valid euro amount with up to two decimal places."),
  332 |   ).toBeVisible();
  333 |   await page.keyboard.press("Escape");
  334 |   await expect(dialog).toBeHidden();
  335 |   await expect(trigger).toBeFocused();
  336 | });
  337 | 
  338 | test("shows one Create request action on every merchant page", async ({
  339 |   page,
  340 | }, testInfo) => {
  341 |   test.skip(
  342 |     testInfo.project.name !== "desktop",
  343 |     "the shell is shared across widths",
  344 |   );
  345 | 
  346 |   for (const path of [
  347 |     "/overview",
  348 |     "/transactions",
  349 |     "/inventory",
  350 |     "/invoices",
  351 |     "/business-profile",
  352 |   ]) {
  353 |     await page.goto(path);
  354 |     await expect(
  355 |       page.getByRole("button", { name: "Create request" }),
  356 |     ).toHaveCount(1);
  357 |     await expect(
  358 |       page.getByRole("button", { name: "Create request" }),
  359 |     ).toBeVisible();
  360 |   }
  361 | });
```