# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: general-analytics.spec.ts >> an old #combined-analytics link opens the combined tab
- Location: tests/general-analytics.spec.ts:354:1

# Error details

```
Error: expect(page).toHaveURL(expected) failed

Expected pattern: /[?&]tab=combined(&|$)/
Received string:  "http://127.0.0.1:3101/analytics/general?tab=combined#combined-analytics"
Timeout: 5000ms

Call log:
  - Expect "toHaveURL" with timeout 5000ms
    14 × locator resolved to <html lang="en">…</html>
       - unexpected value "http://127.0.0.1:3101/analytics/general?tab=combined#combined-analytics"

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
  - text: Records unavailable
  - button "Create request"
- main:
  - paragraph: Analytics
  - heading "General analytics" [level=1]
  - paragraph: Transactions, inventory and what the two say together.
  - navigation "Analytics views":
    - button "General analytics"
    - link "Deep analytics":
      - /url: /analytics/deep
  - group "Analytics filters":
    - radiogroup "Period":
      - radio "Today"
      - radio "7d"
      - radio "30d" [checked]
      - radio "90d"
      - radio "180d"
      - radio "365d"
    - combobox: Group by Daily
    - button "Source"
  - tablist "General analytics":
    - tab "Transaction analytics"
    - tab "Inventory analytics"
    - tab "Combined analytics" [selected]
  - tabpanel "Combined analytics":
    - status: Stock figures cover all stock, not a filtered subset. Sales figures follow the filters you have applied.
    - heading "Sales against stock" [level=2]
    - paragraph: Recorded sales came to 415.00 across 10 transactions, covering 24 units. Stock rose over the same period, opening at 24 and closing at 42, with 30 units restocked, a net change of 18.
    - term: Recorded sales
    - definition: €415.00
    - term: Units sold
    - definition: "24"
    - heading "Trading concentration" [level=2]
    - paragraph: The busiest three hours were 11:00 to 14:00, taking 320.00 across 10 transactions.
    - term: Window start
    - definition: "11"
    - heading "Volume against value" [level=2]
    - paragraph: Transactions rose 25% and revenue rose 38.33%. Both the number of sales and the size of each sale grew.
    - term: Revenue change
    - definition: 38.33%
    - heading "Selling speed against availability" [level=2]
    - paragraph: Product 00 sold 20 units, about 0.645 a day. There are 5 on hand against a reorder level of 3.
    - term: Days of cover
    - definition: "3.1"
    - paragraph: These readings are produced by fixed rules from the transaction and inventory figures, not by a model.
- alert
```

# Test source

```ts
  263 | 
  264 |   await inventory.click();
  265 |   await expect(page).toHaveURL(/[?&]tab=inventory(&|$)/);
  266 |   await expect(inventory).toHaveAttribute("aria-selected", "true");
  267 |   await expect(transactions).toHaveAttribute("aria-selected", "false");
  268 |   await expect(page.getByRole("tabpanel")).toHaveCount(1);
  269 |   const panel = page.getByRole("tabpanel", { name: "Inventory analytics" });
  270 |   await expect(
  271 |     panel.getByRole("table", { name: "Product performance" }),
  272 |   ).toHaveCount(1);
  273 |   // The transaction content is gone, not merely scrolled past.
  274 |   await expect(
  275 |     page.getByRole("img", { name: "Recorded sales by day" }),
  276 |   ).toHaveCount(0);
  277 | 
  278 |   await combined.click();
  279 |   await expect(page).toHaveURL(/[?&]tab=combined(&|$)/);
  280 |   await expect(
  281 |     page.getByRole("tabpanel", { name: "Combined analytics" }),
  282 |   ).toBeVisible();
  283 | 
  284 |   // The default tab keeps a clean address.
  285 |   await transactions.click();
  286 |   await expect(transactions).toHaveAttribute("aria-selected", "true");
  287 |   await expect(page).not.toHaveURL(/tab=/);
  288 | });
  289 | 
  290 | test("the arrow, Home and End keys move between tabs", async ({
  291 |   page,
  292 | }, testInfo) => {
  293 |   test.skip(testInfo.project.name !== "desktop", "one proof is enough");
  294 | 
  295 |   await page.goto("/analytics/general");
  296 |   const transactions = page.getByRole("tab", { name: "Transaction analytics" });
  297 |   const inventory = page.getByRole("tab", { name: "Inventory analytics" });
  298 |   const combined = page.getByRole("tab", { name: "Combined analytics" });
  299 |   // Roving tabindex: only the selected tab is in the Tab order.
  300 |   await expect(transactions).toHaveAttribute("tabindex", "0");
  301 |   await expect(inventory).toHaveAttribute("tabindex", "-1");
  302 | 
  303 |   await transactions.focus();
  304 |   await page.keyboard.press("ArrowRight");
  305 |   await expect(inventory).toBeFocused();
  306 |   await expect(inventory).toHaveAttribute("aria-selected", "true");
  307 |   await expect(page).toHaveURL(/[?&]tab=inventory(&|$)/);
  308 | 
  309 |   await page.keyboard.press("End");
  310 |   await expect(combined).toBeFocused();
  311 |   await expect(combined).toHaveAttribute("aria-selected", "true");
  312 | 
  313 |   // Wraps from the last tab to the first.
  314 |   await page.keyboard.press("ArrowRight");
  315 |   await expect(transactions).toBeFocused();
  316 |   await expect(transactions).toHaveAttribute("aria-selected", "true");
  317 | 
  318 |   await page.keyboard.press("ArrowLeft");
  319 |   await expect(combined).toBeFocused();
  320 | 
  321 |   await page.keyboard.press("Home");
  322 |   await expect(transactions).toBeFocused();
  323 |   await expect(transactions).toHaveAttribute("aria-selected", "true");
  324 | });
  325 | 
  326 | test("?tab=inventory opens the inventory tab directly", async ({
  327 |   page,
  328 | }, testInfo) => {
  329 |   test.skip(testInfo.project.name !== "desktop", "one proof is enough");
  330 | 
  331 |   await page.goto("/analytics/general?tab=inventory");
  332 |   await expect(
  333 |     page.getByRole("tab", { name: "Inventory analytics" }),
  334 |   ).toHaveAttribute("aria-selected", "true");
  335 |   await expect(
  336 |     page
  337 |       .getByRole("tabpanel", { name: "Inventory analytics" })
  338 |       .getByRole("table", { name: "Product performance" }),
  339 |   ).toHaveCount(1);
  340 | });
  341 | 
  342 | test("an unknown tab falls back to transactions", async ({ page }, testInfo) => {
  343 |   test.skip(testInfo.project.name !== "desktop", "one proof is enough");
  344 | 
  345 |   await page.goto("/analytics/general?tab=nonsense");
  346 |   await expect(
  347 |     page.getByRole("tab", { name: "Transaction analytics" }),
  348 |   ).toHaveAttribute("aria-selected", "true");
  349 |   await expect(
  350 |     page.getByRole("tabpanel", { name: "Transaction analytics" }),
  351 |   ).toBeVisible();
  352 | });
  353 | 
  354 | test("an old #combined-analytics link opens the combined tab", async ({
  355 |   page,
  356 | }, testInfo) => {
  357 |   test.skip(testInfo.project.name !== "desktop", "one proof is enough");
  358 | 
  359 |   await page.goto("/analytics/general#combined-analytics");
  360 |   await expect(
  361 |     page.getByRole("tab", { name: "Combined analytics" }),
  362 |   ).toHaveAttribute("aria-selected", "true");
> 363 |   await expect(page).toHaveURL(/[?&]tab=combined(&|$)/);
      |                      ^ Error: expect(page).toHaveURL(expected) failed
  364 |   await expect(page).not.toHaveURL(/#combined-analytics/);
  365 |   await expect(
  366 |     page.getByRole("heading", { name: "Sales against stock" }),
  367 |   ).toBeVisible();
  368 | });
  369 | 
  370 | test("the chosen period is kept when switching tabs", async ({
  371 |   page,
  372 | }, testInfo) => {
  373 |   test.skip(testInfo.project.name !== "desktop", "one proof is enough");
  374 | 
  375 |   const requested: string[] = [];
  376 |   await page.route("**/api/merchant/me/analytics/general**", (route) => {
  377 |     requested.push(new URL(route.request().url()).search);
  378 |     return route.fallback();
  379 |   });
  380 | 
  381 |   await page.goto("/analytics/general");
  382 |   await expect.poll(() => requested.length).toBeGreaterThan(0);
  383 |   const today = page.getByRole("radio", { name: "Today", exact: true });
  384 |   await today.click();
  385 |   await expect
  386 |     .poll(() => requested.some((search) => search.includes("period=today")))
  387 |     .toBe(true);
  388 |   const beforeSwitch = requested.length;
  389 | 
  390 |   await page.getByRole("tab", { name: "Inventory analytics" }).click();
  391 |   await expect(page).toHaveURL(/[?&]tab=inventory(&|$)/);
  392 |   await expect(
  393 |     page.getByRole("table", { name: "Product performance" }),
  394 |   ).toHaveCount(1);
  395 |   await expect(today).toHaveAttribute("aria-checked", "true");
  396 |   // Anything read after the switch is still for today, never the default 30d.
  397 |   expect(
  398 |     requested.slice(beforeSwitch).every((search) => search.includes("period=today")),
  399 |   ).toBe(true);
  400 | });
  401 | 
  402 | test("the source facet narrows the request, shows its value, and Reset clears every filter", async ({
  403 |   page,
  404 | }, testInfo) => {
  405 |   test.skip(testInfo.project.name !== "desktop", "one proof is enough");
  406 |   const requested: string[] = [];
  407 |   await page.route("**/api/merchant/me/analytics/general**", (route) => {
  408 |     requested.push(new URL(route.request().url()).search);
  409 |     return route.fallback();
  410 |   });
  411 | 
  412 |   await page.goto("/analytics/general");
  413 |   const filters = page.getByRole("group", { name: "Analytics filters" });
  414 |   // Every record is always included: there is no records/environment filter.
  415 |   await expect(filters.getByText("Records", { exact: true })).toHaveCount(0);
  416 |   await expect(filters.getByRole("radio", { name: "Live" })).toHaveCount(0);
  417 |   await expect(filters.getByRole("button", { name: "Reset" })).toHaveCount(0);
  418 | 
  419 |   await filters.getByRole("button", { name: "Source" }).click();
  420 |   await page.getByRole("menuitemradio", { name: "Cash" }).click();
  421 |   await expect
  422 |     .poll(() => requested.some((search) => search.includes("source=merchant_cash")))
  423 |     .toBe(true);
  424 |   await expect(filters.getByRole("button", { name: /Source.*Cash/ })).toBeVisible();
  425 | 
  426 |   await filters.getByRole("radio", { name: "90d" }).click();
  427 |   await filters.getByRole("button", { name: "Reset" }).click();
  428 |   await expect(filters.getByRole("radio", { name: "30d" })).toHaveAttribute("aria-checked", "true");
  429 |   await expect(filters.getByRole("button", { name: "Source", exact: true })).toBeVisible();
  430 |   await expect(filters.getByRole("button", { name: "Reset" })).toHaveCount(0);
  431 |   expect(requested.every((search) => !search.includes("environment="))).toBe(true);
  432 | });
  433 | 
  434 | test("a year of daily bars never pushes the page sideways", async ({ page }) => {
  435 |   // 365 daily bars once needed ~2,200px of fixed gaps and widened the page.
  436 |   await page.route("**/api/merchant/me/analytics/general**", async (route) => {
  437 |     const response = await route.fetch();
  438 |     const body = await response.json();
  439 |     const start = Date.UTC(2025, 8, 27);
  440 |     body.transactions.series = Array.from({ length: 365 }, (_, day) => {
  441 |       const at = new Date(start + day * 86_400_000).toISOString();
  442 |       return {
  443 |         periodStart: at,
  444 |         periodEnd: at,
  445 |         label: at.slice(0, 10),
  446 |         amountMinor: String(500 + (day % 17) * 90),
  447 |         count: 1 + (day % 5),
  448 |         averageMinor: "500",
  449 |         partial: false,
  450 |       };
  451 |     });
  452 |     await route.fulfill({ response, json: body });
  453 |   });
  454 | 
  455 |   await page.goto("/analytics/general");
  456 |   await expect(
  457 |     page.getByRole("img", { name: /Recorded sales by/ }),
  458 |   ).toBeVisible();
  459 |   const overflow = await page.evaluate(
  460 |     () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  461 |   );
  462 |   expect(overflow).toBeLessThanOrEqual(0);
  463 | });
```