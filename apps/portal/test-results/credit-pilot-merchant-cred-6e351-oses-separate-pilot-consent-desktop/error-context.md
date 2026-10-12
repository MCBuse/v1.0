# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: credit-pilot.spec.ts >> merchant credit profile preserves cents and exposes separate pilot consent
- Location: tests/credit-pilot.spec.ts:181:1

# Error details

```
Test timeout of 30000ms exceeded.
```

```
Error: page.waitForRequest: Test timeout of 30000ms exceeded.
```

# Page snapshot

```yaml
- generic:
  - generic [aria-hidden]:
    - complementary:
      - navigation:
        - link:
          - /url: /overview
          - text: Overview
        - link:
          - /url: /inventory
          - text: Inventory
        - link:
          - /url: /payment
          - text: Payment
        - link:
          - /url: /analytics
          - text: Analytics
        - link:
          - /url: /credit-assessment
          - text: Credit Assessment
        - link:
          - /url: /finance-match
          - text: Finance Match
      - generic:
        - button: Sign out
    - generic:
      - banner:
        - generic:
          - paragraph: Merchant workspace
        - generic:
          - generic: Records unavailable
          - button: Create request
      - main:
        - generic:
          - generic:
            - paragraph: Credit Assessment
            - heading [level=1]: Business assessment
            - paragraph: Check your business details, add anything that's missing, and get a dated credit assessment report as a PDF.
          - generic:
            - button [expanded]: Run credit assessment
          - generic:
            - generic:
              - heading [level=2]: Latest assessment
            - generic:
              - paragraph: No assessment yet. Select Run credit assessment to get started.
          - generic:
            - generic:
              - generic:
                - heading [level=2]: Recent credit assessments
                - paragraph: Your past assessments and their PDF reports.
            - generic:
              - paragraph: No saved assessments yet.
  - alert
  - dialog [active] [ref=e2]:
    - generic [ref=e3]:
      - heading "Run credit assessment" [level=2] [ref=e4]
      - paragraph [ref=e5]: Review what your records show, add anything missing, then run the assessment. The result and its PDF are saved together.
      - button "Close assessment form" [ref=e6]
    - generic [ref=e10]:
      - region [ref=e11]:
        - generic [ref=e12]:
          - generic [aria-hidden] [ref=e13]: "1"
          - 'heading "Step 1: Check what your records show" [level=3] [ref=e15]':
            - generic [ref=e16]: "Step 1:"
            - text: Check what your records show
        - paragraph [ref=e17]: "Your activity figures could not be loaded: Not found"
      - region [ref=e18]:
        - generic [ref=e19]:
          - generic [aria-hidden] [ref=e20]: "2"
          - generic [ref=e21]:
            - 'heading "Step 2: Add what''s missing" [level=3] [ref=e22]':
              - generic [ref=e23]: "Step 2:"
              - text: Add what's missing
            - paragraph [ref=e24]: Collateral, finance and owner details. Anything marked Missing is a quick way to strengthen your result. Leave a field blank if it doesn't apply.
        - generic [ref=e25]:
          - generic [ref=e26]:
            - generic [ref=e27]:
              - paragraph [ref=e28]: 1 of 13 added
              - paragraph [ref=e29]: Your details
            - img "1 available, 12 you can add" [ref=e30]
            - list [ref=e33]:
              - listitem [ref=e34]:
                - generic [ref=e38]: Available
                - generic [ref=e39]: "1"
              - listitem [ref=e40]:
                - generic [ref=e44]: You can add
                - generic [ref=e45]: "12"
          - generic [ref=e46]:
            - generic [ref=e47]:
              - generic [ref=e48]:
                - generic [ref=e49]: Business commencement date
                - generic [ref=e50]: Missing
              - textbox "Business commencement date" [ref=e54]
            - generic [ref=e55]:
              - generic [ref=e56]:
                - generic [ref=e57]: Merchant category
                - generic [ref=e58]: Missing
              - combobox "Merchant category" [ref=e62]:
                - option "Not provided / category not covered" [selected]
                - option "Cafe or bakery"
                - option "Grocer"
                - option "Kiosk"
                - option "Takeaway"
            - generic [ref=e63]:
              - generic [ref=e64]:
                - generic [ref=e65]: Existing debt used for debt-to-sales (EUR)
                - generic [ref=e66]: Missing
              - textbox "Existing debt used for debt-to-sales (EUR)" [ref=e70]:
                - /placeholder: Not provided
            - generic [ref=e71]:
              - generic [ref=e72]:
                - generic [ref=e73]: Requested loan amount (EUR)
                - generic [ref=e74]: Added
              - textbox "Requested loan amount (EUR)" [ref=e78]:
                - /placeholder: Not provided
                - text: "0.10"
            - generic [ref=e79]:
              - generic [ref=e80]:
                - generic [ref=e81]: Declared inventory value (EUR)
                - generic [ref=e82]: Missing
              - textbox "Declared inventory value (EUR)" [ref=e86]:
                - /placeholder: Not provided
            - generic [ref=e87]:
              - generic [ref=e88]:
                - generic [ref=e89]: Declared collateral value (EUR)
                - generic [ref=e90]: Missing
              - textbox "Declared collateral value (EUR)" [ref=e94]:
                - /placeholder: Not provided
            - generic [ref=e95]:
              - generic [ref=e96]:
                - generic [ref=e97]: Business debts for lender review (EUR)
                - generic [ref=e98]: Missing
              - textbox "Business debts for lender review (EUR)" [ref=e102]:
                - /placeholder: Not provided
            - generic [ref=e103]:
              - generic [ref=e104]:
                - generic [ref=e105]: Business assets (EUR)
                - generic [ref=e106]: Missing
              - textbox "Business assets (EUR)" [ref=e110]:
                - /placeholder: Not provided
            - generic [ref=e111]:
              - generic [ref=e112]:
                - generic [ref=e113]: Owner personal assets (EUR)
                - generic [ref=e114]: Missing
              - textbox "Owner personal assets (EUR)" [ref=e118]:
                - /placeholder: Not provided
            - generic [ref=e119]:
              - generic [ref=e120]:
                - generic [ref=e121]: Owner personal debts (EUR)
                - generic [ref=e122]: Missing
              - textbox "Owner personal debts (EUR)" [ref=e126]:
                - /placeholder: Not provided
            - generic [ref=e127]:
              - generic [ref=e128]:
                - generic [ref=e129]: Requested loan term (months)
                - generic [ref=e130]: Missing
              - spinbutton "Requested loan term (months)" [ref=e134]
            - generic [ref=e135]:
              - generic [ref=e136]:
                - generic [ref=e137]: External bureau score (original scale)
                - generic [ref=e138]: Missing
              - spinbutton "External bureau score (original scale)" [ref=e142]
            - generic [ref=e143]:
              - generic [ref=e144]:
                - generic [ref=e145]: Bureau name, score scale, and report notes
                - generic [ref=e146]: Missing
              - textbox "Bureau name, score scale, and report notes" [ref=e150]
    - generic [ref=e151]:
      - paragraph [ref=e152]:
        - generic [aria-hidden] [ref=e153]: "3"
        - text: Run your assessment
      - status [ref=e154]: Failed to fetch
      - generic [ref=e155]:
        - checkbox "Use my saved business records for this assessment. I can withdraw this at any time." [checked] [ref=e156]
        - text: Use my saved business records for this assessment. I can withdraw this at any time.
      - generic [ref=e157]:
        - button "Run assessment" [ref=e158]
        - button "Cancel" [ref=e159]
```

# Test source

```ts
  143 |             disclaimer: "Evidence readiness",
  144 |             credit: {
  145 |               status: "ready",
  146 |               modelVersion: "george-html-2026.09.1",
  147 |               financialProfile: null,
  148 |               profileConfidence: {
  149 |                 label: "Low",
  150 |                 confidenceScore: 10,
  151 |                 coveragePct: 20,
  152 |                 dataReliabilityQualityPct: 0,
  153 |                 fieldsFilled: 5,
  154 |                 fieldsTotal: 26,
  155 |               },
  156 |               missingReasons: {
  157 |                 estimated_margin_pct:
  158 |                   "Verified supplier spending is not connected.",
  159 |               },
  160 |               integritySummary: [],
  161 |             },
  162 |           },
  163 |         ],
  164 |       },
  165 |     }),
  166 |   );
  167 |   await page.goto("/credit-assessment");
  168 |   await expect(
  169 |     page.getByText("Verified supplier spending is not connected.", {
  170 |       exact: false,
  171 |     }),
  172 |   ).toBeVisible();
  173 |   await expect(
  174 |     page.getByText("Experimental credit risk", { exact: true }),
  175 |   ).toHaveCount(0);
  176 |   await expect(
  177 |     page.getByText("Default probability", { exact: true }),
  178 |   ).toHaveCount(0);
  179 | });
  180 | 
  181 | test("merchant credit profile preserves cents and exposes separate pilot consent", async ({
  182 |   page,
  183 |   context,
  184 | }) => {
  185 |   await context.addCookies([
  186 |     {
  187 |       name: "mcbuse_portal_access",
  188 |       value: "test-only",
  189 |       url: "http://127.0.0.1:3101",
  190 |       httpOnly: true,
  191 |     },
  192 |     {
  193 |       name: "mcbuse_portal_csrf",
  194 |       value: "credit-profile-csrf",
  195 |       url: "http://127.0.0.1:3101",
  196 |     },
  197 |   ]);
  198 |   await page.route("**/api/merchant/me/evidence-readiness", (r) =>
  199 |     r.fulfill({
  200 |       json: {
  201 |         stage: "insufficient_evidence",
  202 |         measured: {
  203 |           observedDays: 0,
  204 |           activeDays: 0,
  205 |           finalizedPayments: 0,
  206 |           captureQualityPercent: 0,
  207 |           finalityPercent: 0,
  208 |         },
  209 |         passedRequirements: [],
  210 |         missingRequirements: ["More history"],
  211 |         disclaimer: "Evidence readiness only.",
  212 |       },
  213 |     }),
  214 |   );
  215 |   await page.route("**/api/merchant/me/consents", (r) =>
  216 |     r.fulfill({ json: { active: false, recordedAt: null } }),
  217 |   );
  218 |   await page.route("**/api/merchant/me/imports", (r) =>
  219 |     r.fulfill({ json: { items: [] } }),
  220 |   );
  221 |   await page.route("**/api/merchant/me/assessments", (r) =>
  222 |     r.fulfill({ json: { assessments: [] } }),
  223 |   );
  224 |   await page.route("**/api/merchant/me/finance-packages", (r) =>
  225 |     r.fulfill({ json: { items: [] } }),
  226 |   );
  227 |   // The credit profile lives in the Run credit assessment drawer as
  228 |   // "Additional information" and is saved by the single Run assessment action.
  229 |   await page.goto("/credit-assessment");
  230 |   await page
  231 |     .getByRole("button", { name: "Run credit assessment", exact: true })
  232 |     .click();
  233 |   await expect(
  234 |     page.getByRole("heading", { name: /Add what's missing/ }),
  235 |   ).toBeVisible();
  236 |   await page
  237 |     .getByLabel("Requested loan amount (EUR)", { exact: true })
  238 |     .fill("0.10");
  239 |   // Only the declaration save matters here; stop before the run itself.
  240 |   await page.route("**/api/merchant/me/assessments", (r) =>
  241 |     r.request().method() === "POST" ? r.abort() : r.fallback(),
  242 |   );
> 243 |   const savedRequest = page.waitForRequest(
      |                             ^ Error: page.waitForRequest: Test timeout of 30000ms exceeded.
  244 |     (r) =>
  245 |       r.url().endsWith("/api/merchant/me/credit-profile") &&
  246 |       r.method() === "PATCH",
  247 |   );
  248 |   await page
  249 |     .getByLabel("Use my saved business records for this assessment", {
  250 |       exact: false,
  251 |     })
  252 |     .check();
  253 |   await page
  254 |     .getByRole("button", { name: "Run assessment", exact: true })
  255 |     .click();
  256 |   expect((await savedRequest).postDataJSON().data.loanAmountMinor).toBe("10");
  257 |   await expect(
  258 |     page.getByText("Internal pilot consent (optional)"),
  259 |   ).toHaveCount(0);
  260 |   await expect(
  261 |     page.getByText("Default probability", { exact: true }),
  262 |   ).toHaveCount(0);
  263 |   expect(
  264 |     await page.evaluate(
  265 |       () => document.documentElement.scrollWidth <= window.innerWidth,
  266 |     ),
  267 |   ).toBe(true);
  268 | });
  269 | 
```