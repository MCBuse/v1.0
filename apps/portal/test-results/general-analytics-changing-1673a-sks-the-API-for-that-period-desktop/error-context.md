# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: general-analytics.spec.ts >> changing the period asks the API for that period
- Location: tests/general-analytics.spec.ts:215:1

# Error details

```
Test timeout of 30000ms exceeded.
```

```
Error: locator.click: Test timeout of 30000ms exceeded.
Call log:
  - waiting for getByRole('combobox', { name: /Group by/ })

```

# Page snapshot

```yaml
- generic [ref=e1]:
  - generic [ref=e2]:
    - complementary [ref=e3]:
      - img "MCBuse" [ref=e6]
      - navigation "Primary" [ref=e7]:
        - link "Overview" [ref=e8] [cursor=pointer]:
          - /url: /overview
        - link "Inventory" [ref=e14] [cursor=pointer]:
          - /url: /inventory
        - link "Payment" [ref=e19] [cursor=pointer]:
          - /url: /payment
        - link "Analytics" [ref=e23] [cursor=pointer]:
          - /url: /analytics
        - link "Credit Assessment" [ref=e26] [cursor=pointer]:
          - /url: /credit-assessment
        - link "Finance Match" [ref=e31] [cursor=pointer]:
          - /url: /finance-match
      - button "Sign out" [ref=e35]
    - generic [ref=e39]:
      - banner [ref=e40]:
        - paragraph [ref=e42]: Merchant workspace
        - generic [ref=e43]:
          - generic "Records unavailable" [ref=e44]
          - button "Create request" [ref=e47]
      - main [ref=e51]:
        - generic [ref=e52]:
          - generic [ref=e53]:
            - paragraph [ref=e54]: Analytics
            - heading "General analytics" [level=1] [ref=e55]
            - paragraph [ref=e56]: Transactions, inventory and what the two say together.
          - navigation "Analytics views" [ref=e57]:
            - button "General analytics" [ref=e58]
            - link "Deep analytics" [ref=e59] [cursor=pointer]:
              - /url: /analytics/deep
          - group "Analytics filters" [ref=e60]:
            - radiogroup "Period" [ref=e61]:
              - radio "Today" [checked] [active] [ref=e62]
              - radio "7d" [ref=e63]
              - radio "30d" [ref=e64]
              - radio "90d" [ref=e65]
              - radio "180d" [ref=e66]
              - radio "365d" [ref=e67]
            - combobox [ref=e68]:
              - generic [ref=e69]: Group by
              - generic: Daily
            - button "Source" [ref=e72]
            - button "Reset" [ref=e75]
          - tablist "General analytics" [ref=e79]:
            - tab "Transaction analytics" [selected] [ref=e80]
            - tab "Inventory analytics" [ref=e81]
            - tab "Combined analytics" [ref=e82]
          - tabpanel "Transaction analytics" [ref=e83]:
            - generic [ref=e84]:
              - status [ref=e85]: The most recent period is still in progress, so its figures will continue to change.
              - generic [ref=e86]:
                - generic [ref=e89]:
                  - paragraph [ref=e90]: Recorded sales
                  - paragraph [ref=e91]: €415.00
                  - paragraph [ref=e92]: 10 transactions
                - generic [ref=e95]:
                  - paragraph [ref=e96]: Average transaction
                  - paragraph [ref=e97]: €41.50
                - generic [ref=e100]:
                  - paragraph [ref=e101]: Sales trend
                  - paragraph [ref=e102]: +38.33%
                  - paragraph [ref=e103]: against €300.00 before
              - generic [ref=e104]:
                - generic [ref=e107]:
                  - paragraph [ref=e108]: Digital sales
                  - paragraph [ref=e109]: €320.00
                  - paragraph [ref=e110]: 7 sales · 77.11% of value · 70% of count
                - generic [ref=e113]:
                  - paragraph [ref=e114]: Cash sales
                  - paragraph [ref=e115]: €95.00
                  - paragraph [ref=e116]: 3 sales · 22.89% of value · 30% of count
              - generic [ref=e117]:
                - generic [ref=e118]:
                  - heading "Sales by day" [level=2] [ref=e119]
                  - generic [ref=e120]: Partial reporting periods
                - generic [ref=e122]:
                  - img "Recorded sales by day" [ref=e123]:
                    - 'generic "2026-09-19: €150.00" [ref=e125]'
                    - 'generic "2026-09-20: €180.00" [ref=e127]'
                    - 'generic "2026-09-21: €85.00" [ref=e129]'
                  - generic [ref=e130]:
                    - generic [ref=e131]: 2026-09-19
                    - generic [ref=e132]: 2026-09-21
                  - button "Show the numbers" [ref=e133]
                  - table [ref=e134]:
                    - caption [ref=e135]: Recorded sales by day
                    - rowgroup [ref=e136]:
                      - row [ref=e137]:
                        - columnheader "Period" [ref=e138]
                        - columnheader "Amount" [ref=e139]
                        - columnheader "Transactions" [ref=e140]
                        - columnheader "Average" [ref=e141]
                        - columnheader "Complete" [ref=e142]
                    - rowgroup [ref=e143]:
                      - row [ref=e144]:
                        - cell "2026-09-19" [ref=e145]
                        - cell "€150.00" [ref=e146]
                        - cell "4" [ref=e147]
                        - cell "€37.50" [ref=e148]
                        - cell "Complete" [ref=e149]
                      - row [ref=e150]:
                        - cell "2026-09-20" [ref=e151]
                        - cell "€180.00" [ref=e152]
                        - cell "5" [ref=e153]
                        - cell "€36.00" [ref=e154]
                        - cell "Complete" [ref=e155]
                      - row [ref=e156]:
                        - cell "2026-09-21" [ref=e157]
                        - cell "€85.00" [ref=e158]
                        - cell "1" [ref=e159]
                        - cell "€85.00" [ref=e160]
                        - cell "Still running" [ref=e161]
              - generic [ref=e162]:
                - heading "When the day trades" [level=2] [ref=e164]
                - generic [ref=e165]:
                  - generic [ref=e166]:
                    - img "Sales by hour of day" [ref=e167]:
                      - 'generic "00:00: €0.00" [ref=e169]'
                      - 'generic "01:00: €0.00" [ref=e171]'
                      - 'generic "02:00: €0.00" [ref=e173]'
                      - 'generic "03:00: €0.00" [ref=e175]'
                      - 'generic "04:00: €0.00" [ref=e177]'
                      - 'generic "05:00: €0.00" [ref=e179]'
                      - 'generic "06:00: €0.00" [ref=e181]'
                      - 'generic "07:00: €0.00" [ref=e183]'
                      - 'generic "08:00: €0.00" [ref=e185]'
                      - 'generic "09:00: €0.00" [ref=e187]'
                      - 'generic "10:00: €0.00" [ref=e189]'
                      - 'generic "11:00: €0.00" [ref=e191]'
                      - 'generic "12:00: €200.00" [ref=e193]'
                      - 'generic "13:00: €120.00" [ref=e195]'
                      - 'generic "14:00: €0.00" [ref=e197]'
                      - 'generic "15:00: €0.00" [ref=e199]'
                      - 'generic "16:00: €0.00" [ref=e201]'
                      - 'generic "17:00: €0.00" [ref=e203]'
                      - 'generic "18:00: €0.00" [ref=e205]'
                      - 'generic "19:00: €0.00" [ref=e207]'
                      - 'generic "20:00: €0.00" [ref=e209]'
                      - 'generic "21:00: €0.00" [ref=e211]'
                      - 'generic "22:00: €0.00" [ref=e213]'
                      - 'generic "23:00: €0.00" [ref=e215]'
                    - generic [ref=e216]:
                      - generic [ref=e217]: 00:00
                      - generic [ref=e218]: 23:00
                    - button "Show the numbers" [ref=e219]
                    - table [ref=e220]:
                      - caption [ref=e221]: Sales by hour of day
                      - rowgroup [ref=e222]:
                        - row [ref=e223]:
                          - columnheader "Period" [ref=e224]
                          - columnheader "Amount" [ref=e225]
                          - columnheader "Transactions" [ref=e226]
                      - rowgroup [ref=e227]:
                        - row [ref=e228]:
                          - cell "00:00" [ref=e229]
                          - cell "€0.00" [ref=e230]
                          - cell "0" [ref=e231]
                        - row [ref=e232]:
                          - cell "01:00" [ref=e233]
                          - cell "€0.00" [ref=e234]
                          - cell "0" [ref=e235]
                        - row [ref=e236]:
                          - cell "02:00" [ref=e237]
                          - cell "€0.00" [ref=e238]
                          - cell "0" [ref=e239]
                        - row [ref=e240]:
                          - cell "03:00" [ref=e241]
                          - cell "€0.00" [ref=e242]
                          - cell "0" [ref=e243]
                        - row [ref=e244]:
                          - cell "04:00" [ref=e245]
                          - cell "€0.00" [ref=e246]
                          - cell "0" [ref=e247]
                        - row [ref=e248]:
                          - cell "05:00" [ref=e249]
                          - cell "€0.00" [ref=e250]
                          - cell "0" [ref=e251]
                        - row [ref=e252]:
                          - cell "06:00" [ref=e253]
                          - cell "€0.00" [ref=e254]
                          - cell "0" [ref=e255]
                        - row [ref=e256]:
                          - cell "07:00" [ref=e257]
                          - cell "€0.00" [ref=e258]
                          - cell "0" [ref=e259]
                        - row [ref=e260]:
                          - cell "08:00" [ref=e261]
                          - cell "€0.00" [ref=e262]
                          - cell "0" [ref=e263]
                        - row [ref=e264]:
                          - cell "09:00" [ref=e265]
                          - cell "€0.00" [ref=e266]
                          - cell "0" [ref=e267]
                        - row [ref=e268]:
                          - cell "10:00" [ref=e269]
                          - cell "€0.00" [ref=e270]
                          - cell "0" [ref=e271]
                        - row [ref=e272]:
                          - cell "11:00" [ref=e273]
                          - cell "€0.00" [ref=e274]
                          - cell "0" [ref=e275]
                        - row [ref=e276]:
                          - cell "12:00" [ref=e277]
                          - cell "€200.00" [ref=e278]
                          - cell "6" [ref=e279]
                        - row [ref=e280]:
                          - cell "13:00" [ref=e281]
                          - cell "€120.00" [ref=e282]
                          - cell "4" [ref=e283]
                        - row [ref=e284]:
                          - cell "14:00" [ref=e285]
                          - cell "€0.00" [ref=e286]
                          - cell "0" [ref=e287]
                        - row [ref=e288]:
                          - cell "15:00" [ref=e289]
                          - cell "€0.00" [ref=e290]
                          - cell "0" [ref=e291]
                        - row [ref=e292]:
                          - cell "16:00" [ref=e293]
                          - cell "€0.00" [ref=e294]
                          - cell "0" [ref=e295]
                        - row [ref=e296]:
                          - cell "17:00" [ref=e297]
                          - cell "€0.00" [ref=e298]
                          - cell "0" [ref=e299]
                        - row [ref=e300]:
                          - cell "18:00" [ref=e301]
                          - cell "€0.00" [ref=e302]
                          - cell "0" [ref=e303]
                        - row [ref=e304]:
                          - cell "19:00" [ref=e305]
                          - cell "€0.00" [ref=e306]
                          - cell "0" [ref=e307]
                        - row [ref=e308]:
                          - cell "20:00" [ref=e309]
                          - cell "€0.00" [ref=e310]
                          - cell "0" [ref=e311]
                        - row [ref=e312]:
                          - cell "21:00" [ref=e313]
                          - cell "€0.00" [ref=e314]
                          - cell "0" [ref=e315]
                        - row [ref=e316]:
                          - cell "22:00" [ref=e317]
                          - cell "€0.00" [ref=e318]
                          - cell "0" [ref=e319]
                        - row [ref=e320]:
                          - cell "23:00" [ref=e321]
                          - cell "€0.00" [ref=e322]
                          - cell "0" [ref=e323]
                  - generic [ref=e324]:
                    - generic [ref=e325]:
                      - paragraph [ref=e326]: Peak hour
                      - paragraph [ref=e327]: 12:00
                      - paragraph [ref=e328]: €200.00 · 6 sales
                    - generic [ref=e329]:
                      - paragraph [ref=e330]: Busiest three hours
                      - paragraph [ref=e331]: 11:00–14:00
                      - paragraph [ref=e332]: 77.11% of revenue
                    - generic [ref=e333]:
                      - paragraph [ref=e334]: Trading window
                      - paragraph [ref=e335]: 12:00–13:00
              - generic [ref=e336]:
                - heading "Payment methods" [level=2] [ref=e338]
                - generic [ref=e340]:
                  - table "Sales by payment method" [ref=e342]:
                    - rowgroup [ref=e343]:
                      - row [ref=e344]:
                        - columnheader [ref=e345]:
                          - button "Method" [ref=e346]
                        - columnheader [ref=e350]:
                          - button "Amount" [ref=e351]
                        - columnheader [ref=e354]:
                          - button "Sales" [ref=e355]
                        - columnheader [ref=e359]:
                          - button "Share" [ref=e360]
                    - rowgroup [ref=e364]:
                      - row [ref=e365]:
                        - cell "mcbuse wallet" [ref=e366]
                        - cell "€320.00" [ref=e367]
                        - cell "7" [ref=e368]
                        - cell "77.11%" [ref=e369]
                      - row [ref=e370]:
                        - cell "cash" [ref=e371]
                        - cell "€95.00" [ref=e372]
                        - cell "3" [ref=e373]
                        - cell "22.89%" [ref=e374]
                  - generic [ref=e375]:
                    - generic [ref=e376]: Showing 1–2 of 2
                    - generic [ref=e377]:
                      - button "Previous" [disabled]
                      - generic [ref=e378]: Page 1 of 1
                      - button "Next" [disabled]
  - alert [ref=e379]
```

# Test source

```ts
  132 |   await expect(table.getByText("recorded at sale")).toBeVisible();
  133 |   await expect(table.getByText("current product")).toBeVisible();
  134 | });
  135 | 
  136 | test("V.7 — the stock-out history distinguishes intervals from unknowns", async ({
  137 |   page,
  138 | }, testInfo) => {
  139 |   test.skip(testInfo.project.name !== "desktop", "one proof is enough");
  140 | 
  141 |   await page.goto("/analytics/general?tab=inventory");
  142 |   await expect(page.getByText("2026-09-18 – 2026-09-21")).toBeVisible();
  143 |   await expect(page.getByText("ongoing", { exact: false }).first()).toBeVisible();
  144 |   await expect(
  145 |     page.getByText("Opening stock for this period cannot be established", {
  146 |       exact: false,
  147 |     }).first(),
  148 |   ).toBeVisible();
  149 | });
  150 | 
  151 | test("V.8 — turnover says why it is unavailable rather than showing a blank", async ({
  152 |   page,
  153 | }, testInfo) => {
  154 |   test.skip(testInfo.project.name !== "desktop", "one proof is enough");
  155 | 
  156 |   await page.goto("/analytics/general?tab=inventory");
  157 |   const table = page.getByRole("table", { name: "Inventory turnover" });
  158 |   await expect(table.getByText("Not available")).toBeVisible();
  159 |   await expect(table.getByText("2.3529")).toBeVisible();
  160 | });
  161 | 
  162 | test("V.2 — stock value is never presented as cost or profit", async ({
  163 |   page,
  164 | }, testInfo) => {
  165 |   test.skip(testInfo.project.name !== "desktop", "one proof is enough");
  166 | 
  167 |   await page.goto("/analytics/general?tab=inventory");
  168 |   await expect(
  169 |     page.getByText("This is not purchase cost", { exact: false }),
  170 |   ).toBeVisible();
  171 | });
  172 | 
  173 | test("C.1–C.8 — all four combined readings appear with their scope note", async ({
  174 |   page,
  175 | }, testInfo) => {
  176 |   test.skip(testInfo.project.name !== "desktop", "one proof is enough");
  177 | 
  178 |   await page.goto("/analytics/general?tab=combined");
  179 |   for (const title of [
  180 |     "Sales against stock",
  181 |     "Trading concentration",
  182 |     "Volume against value",
  183 |     "Selling speed against availability",
  184 |   ]) {
  185 |     await expect(page.getByRole("heading", { name: title })).toBeVisible();
  186 |   }
  187 |   await expect(
  188 |     page.getByText("Stock figures cover all stock", { exact: false }),
  189 |   ).toBeVisible();
  190 |   await expect(
  191 |     page.getByText("not by a model", { exact: false }),
  192 |   ).toBeVisible();
  193 | });
  194 | 
  195 | test("a failed analytics read says so rather than rendering empty charts", async ({
  196 |   page,
  197 | }, testInfo) => {
  198 |   test.skip(testInfo.project.name !== "desktop", "one proof is enough");
  199 | 
  200 |   await page.route("**/api/merchant/me/analytics/general**", (route) =>
  201 |     route.fulfill({
  202 |       status: 503,
  203 |       contentType: "application/json",
  204 |       body: JSON.stringify({ message: "General Analytics is temporarily unavailable" }),
  205 |     }),
  206 |   );
  207 | 
  208 |   await page.goto("/analytics/general");
  209 |   await expect(page.getByText("Analytics could not be loaded.")).toBeVisible();
  210 |   await expect(
  211 |     page.getByText("General Analytics is temporarily unavailable"),
  212 |   ).toBeVisible();
  213 | });
  214 | 
  215 | test("changing the period asks the API for that period", async ({
  216 |   page,
  217 | }, testInfo) => {
  218 |   test.skip(testInfo.project.name !== "desktop", "one proof is enough");
  219 | 
  220 |   const requested: string[] = [];
  221 |   await page.route("**/api/merchant/me/analytics/general**", (route) => {
  222 |     requested.push(new URL(route.request().url()).search);
  223 |     return route.fallback();
  224 |   });
  225 | 
  226 |   await page.goto("/analytics/general");
  227 |   await expect.poll(() => requested.length).toBeGreaterThan(0);
  228 |   await page.getByRole("radio", { name: "Today", exact: true }).click();
  229 |   await expect
  230 |     .poll(() => requested.some((search) => search.includes("period=today")))
  231 |     .toBe(true);
> 232 |   await page.getByRole("combobox", { name: /Group by/ }).click();
      |                                                          ^ Error: locator.click: Test timeout of 30000ms exceeded.
  233 |   await page.getByRole("option", { name: "Weekly" }).click();
  234 |   await expect
  235 |     .poll(() => requested.some((search) => search.includes("grouping=week")))
  236 |     .toBe(true);
  237 | });
  238 | 
  239 | test("the three sections are real tabs and only the selected one is shown", async ({
  240 |   page,
  241 | }) => {
  242 |   await page.goto("/analytics/general");
  243 |   const tablist = page.getByRole("tablist", { name: "General analytics" });
  244 |   const tabs = tablist.getByRole("tab");
  245 |   await expect(tabs).toHaveText([
  246 |     "Transaction analytics",
  247 |     "Inventory analytics",
  248 |     "Combined analytics",
  249 |   ]);
  250 |   const transactions = tablist.getByRole("tab", { name: "Transaction analytics" });
  251 |   const inventory = tablist.getByRole("tab", { name: "Inventory analytics" });
  252 |   const combined = tablist.getByRole("tab", { name: "Combined analytics" });
  253 |   await expect(transactions).toHaveAttribute("aria-selected", "true");
  254 |   await expect(inventory).toHaveAttribute("aria-selected", "false");
  255 |   await expect(combined).toHaveAttribute("aria-selected", "false");
  256 |   await expect(page.getByRole("tabpanel")).toHaveCount(1);
  257 |   await expect(
  258 |     page.getByRole("tabpanel", { name: "Transaction analytics" }),
  259 |   ).toBeVisible();
  260 |   await expect(
  261 |     page.getByRole("img", { name: "Recorded sales by day" }),
  262 |   ).toBeVisible();
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
```