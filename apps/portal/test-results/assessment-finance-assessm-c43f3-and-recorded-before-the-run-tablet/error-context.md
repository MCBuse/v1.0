# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: assessment-finance.spec.ts >> assessment consent is asked for in the form and recorded before the run
- Location: tests/assessment-finance.spec.ts:102:1

# Error details

```
Test timeout of 30000ms exceeded.
```

```
Error: locator.check: Test timeout of 30000ms exceeded.
Call log:
  - waiting for getByLabel('Use my saved business records for this assessment')
    - locator resolved to <input type="checkbox" class="mt-0.5 size-5 accent-blue-600"/>
  - attempting click action
    2 × waiting for element to be visible, enabled and stable
      - element is not stable
    - retrying click action
    - waiting 20ms
    2 × waiting for element to be visible, enabled and stable
      - element is not stable
    - retrying click action
      - waiting 100ms
    52 × waiting for element to be visible, enabled and stable
       - element is visible, enabled and stable
       - scrolling into view if needed
       - done scrolling
       - element is outside of the viewport
     - retrying click action
       - waiting 500ms

```

# Page snapshot

```yaml
- generic:
  - generic:
    - generic:
      - banner [aria-hidden]:
        - generic:
          - generic: Records unavailable
          - button: Create request
      - main:
        - generic:
          - generic [aria-hidden]:
            - paragraph: Credit Assessment
            - heading [level=1]: Business assessment
            - paragraph: Check your business details, add anything that's missing, and get a dated credit assessment report as a PDF.
          - generic [aria-hidden]:
            - button [expanded] [active]: Run credit assessment
          - generic:
            - generic:
              - generic:
                - generic [aria-hidden]:
                  - generic:
                    - heading [level=2]: Latest assessment
                    - paragraph: Latest shop · 23 Jun 2026 – 21 Sept 2026 (90 days)
                    - paragraph: Saved 21 Sept 2026, 00:00
                  - generic: More information needed
                - region "Result":
                  - generic:
                    - generic:
                      - paragraph: Your score isn't ready yet
                      - paragraph: Keep recording sales. The missing items fill in as your activity builds up, then run a new assessment.
                - region [aria-hidden]:
                  - heading [level=4]: Information behind your score
                  - generic:
                    - generic:
                      - paragraph: 0 of 1 available
                      - paragraph: Items the score is calculated from
                    - list:
                      - listitem:
                        - generic: Not measured yet
                        - generic: "1"
                  - generic:
                    - generic:
                      - generic:
                        - generic:
                          - generic:
                            - paragraph:
                              - text: Not measured yet
                              - generic: (1)
                            - paragraph: MCBuse can't measure these yet. You don't need to do anything.
                      - list:
                        - listitem:
                          - text: Estimated margin (%)
                          - generic: Verified supplier spending is not connected.
                - region [aria-hidden]:
                  - generic:
                    - heading [level=4]: Payment history checklist
                    - paragraph: 1 of 1 met
                  - list:
                    - listitem:
                      - generic:
                        - paragraph: Saved profile
                        - paragraph: Met
                - paragraph [aria-hidden]: Information you declare is not independently verified. This assessment is not a lending decision.
                - group [aria-hidden]:
                  - generic: How this assessment was made
          - generic [aria-hidden]:
            - generic:
              - generic:
                - heading [level=2]: Recent credit assessments
                - paragraph: Your past assessments and their PDF reports.
            - generic:
              - list:
                - listitem:
                  - button: 9/21/2026, 12:00:00 AM · More information needed
                  - link:
                    - /url: /finance-match?assessmentId=00000000-0000-4000-8000-000000000002
                    - text: Prepare PDF
    - navigation [aria-hidden]:
      - link:
        - /url: /overview
        - generic: Overview
      - link:
        - /url: /inventory
        - generic: Inventory
      - link:
        - /url: /payment
        - generic: Payment
      - link:
        - /url: /analytics
        - generic: Analytics
      - link:
        - /url: /credit-assessment
        - generic: Assessment
      - link:
        - /url: /finance-match
        - generic: Finance
  - alert
  - dialog [ref=e2]:
    - generic [ref=e3]:
      - heading "Run credit assessment" [level=2] [ref=e4]
      - paragraph [ref=e5]: Review what your records show, add anything missing, then run the assessment. The result and its PDF are saved together.
      - button "Close assessment form" [ref=e6]
    - generic [ref=e10]:
      - region [ref=e11]:
        - generic [ref=e12]:
          - generic [aria-hidden] [ref=e13]: "1"
          - generic [ref=e14]:
            - 'heading "Step 1: Check what your records show" [level=3] [ref=e15]':
              - generic [ref=e16]: "Step 1:"
              - text: Check what your records show
            - paragraph [ref=e17]: "Calculated from your MCBuse payments and recorded cash sales, 28 Jun 2026 – 26 Sept 2026. Nothing to do here: these fill in automatically and are never estimated."
        - generic [ref=e18]:
          - generic [ref=e19]:
            - paragraph [ref=e20]: 1 of 2 available
            - paragraph [ref=e21]: From your activity
          - img "1 available, 1 not measured yet" [ref=e22]
          - list [ref=e25]:
            - listitem [ref=e26]:
              - generic [ref=e30]: Available
              - generic [ref=e31]: "1"
            - listitem [ref=e32]:
              - generic [ref=e42]: Not measured yet
              - generic [ref=e43]: "1"
        - list [ref=e44]:
          - listitem [ref=e45]:
            - generic [ref=e49]:
              - paragraph [ref=e50]: Recorded sales
              - paragraph [ref=e51]: "12"
          - listitem [ref=e52]:
            - generic [ref=e62]:
              - paragraph [ref=e63]: Estimated margin (%)
              - paragraph [ref=e64]: Not measured yet
              - paragraph [ref=e65]: Verified supplier spending is not connected.
        - group [ref=e66]:
          - generic "Which records were used" [ref=e67] [cursor=pointer]
      - region [ref=e68]:
        - generic [ref=e69]:
          - generic [aria-hidden] [ref=e70]: "2"
          - generic [ref=e71]:
            - 'heading "Step 2: Add what''s missing" [level=3] [ref=e72]':
              - generic [ref=e73]: "Step 2:"
              - text: Add what's missing
            - paragraph [ref=e74]: Collateral, finance and owner details. Anything marked Missing is a quick way to strengthen your result. Leave a field blank if it doesn't apply.
        - generic [ref=e75]:
          - generic [ref=e76]:
            - generic [ref=e77]:
              - paragraph [ref=e78]: 0 of 13 added
              - paragraph [ref=e79]: Your details
            - img "13 you can add" [ref=e80]
            - list [ref=e82]:
              - listitem [ref=e83]:
                - generic [ref=e87]: You can add
                - generic [ref=e88]: "13"
          - generic [ref=e89]:
            - generic [ref=e90]:
              - generic [ref=e91]:
                - generic [ref=e92]: Business commencement date
                - generic [ref=e93]: Missing
              - textbox "Business commencement date" [ref=e97]
            - generic [ref=e98]:
              - generic [ref=e99]:
                - generic [ref=e100]: Merchant category
                - generic [ref=e101]: Missing
              - combobox "Merchant category" [ref=e105]:
                - option "Not provided / category not covered" [selected]
                - option "Cafe or bakery"
                - option "Grocer"
                - option "Kiosk"
                - option "Takeaway"
            - generic [ref=e106]:
              - generic [ref=e107]:
                - generic [ref=e108]: Existing debt used for debt-to-sales (EUR)
                - generic [ref=e109]: Missing
              - textbox "Existing debt used for debt-to-sales (EUR)" [ref=e113]:
                - /placeholder: Not provided
            - generic [ref=e114]:
              - generic [ref=e115]:
                - generic [ref=e116]: Requested loan amount (EUR)
                - generic [ref=e117]: Missing
              - textbox "Requested loan amount (EUR)" [ref=e121]:
                - /placeholder: Not provided
            - generic [ref=e122]:
              - generic [ref=e123]:
                - generic [ref=e124]: Declared inventory value (EUR)
                - generic [ref=e125]: Missing
              - textbox "Declared inventory value (EUR)" [ref=e129]:
                - /placeholder: Not provided
            - generic [ref=e130]:
              - generic [ref=e131]:
                - generic [ref=e132]: Declared collateral value (EUR)
                - generic [ref=e133]: Missing
              - textbox "Declared collateral value (EUR)" [ref=e137]:
                - /placeholder: Not provided
            - generic [ref=e138]:
              - generic [ref=e139]:
                - generic [ref=e140]: Business debts for lender review (EUR)
                - generic [ref=e141]: Missing
              - textbox "Business debts for lender review (EUR)" [ref=e145]:
                - /placeholder: Not provided
            - generic [ref=e146]:
              - generic [ref=e147]:
                - generic [ref=e148]: Business assets (EUR)
                - generic [ref=e149]: Missing
              - textbox "Business assets (EUR)" [ref=e153]:
                - /placeholder: Not provided
            - generic [ref=e154]:
              - generic [ref=e155]:
                - generic [ref=e156]: Owner personal assets (EUR)
                - generic [ref=e157]: Missing
              - textbox "Owner personal assets (EUR)" [ref=e161]:
                - /placeholder: Not provided
            - generic [ref=e162]:
              - generic [ref=e163]:
                - generic [ref=e164]: Owner personal debts (EUR)
                - generic [ref=e165]: Missing
              - textbox "Owner personal debts (EUR)" [ref=e169]:
                - /placeholder: Not provided
            - generic [ref=e170]:
              - generic [ref=e171]:
                - generic [ref=e172]: Requested loan term (months)
                - generic [ref=e173]: Missing
              - spinbutton "Requested loan term (months)" [ref=e177]
            - generic [ref=e178]:
              - generic [ref=e179]:
                - generic [ref=e180]: External bureau score (original scale)
                - generic [ref=e181]: Missing
              - spinbutton "External bureau score (original scale)" [ref=e185]
            - generic [ref=e186]:
              - generic [ref=e187]:
                - generic [ref=e188]: Bureau name, score scale, and report notes
                - generic [ref=e189]: Missing
              - textbox "Bureau name, score scale, and report notes" [ref=e193]
    - generic [ref=e194]:
      - paragraph [ref=e195]:
        - generic [aria-hidden] [ref=e196]: "3"
        - text: Run your assessment
      - generic [ref=e197]:
        - checkbox "Use my saved business records for this assessment. I can withdraw this at any time." [ref=e198]
        - text: Use my saved business records for this assessment. I can withdraw this at any time.
      - generic [ref=e199]:
        - button "Run assessment" [disabled]
        - button "Cancel" [ref=e200]
```

# Test source

```ts
  13  | });
  14  | test('assessment retries retain their intent after a lost response and page refresh',async({page})=>{
  15  |  const keys:string[]=[];
  16  |  await page.route('**/api/merchant/me/assessments',route=>{if(route.request().method()==='GET')return route.fallback();expect(route.request().postDataJSON().modelId).toBe('george-financial-profile-v1');const key=route.request().headers()['idempotency-key'];if(!key)throw new Error('Missing assessment idempotency key');keys.push(key);return keys.length===1?route.abort():route.fulfill({json:latest});});
  17  |  await page.goto('/credit-assessment');await page.getByRole('button',{name:'Run credit assessment',exact:true}).click();await page.getByRole('button',{name:'Run assessment',exact:true}).click();await expect(page.getByRole('button',{name:'Run assessment',exact:true})).toBeEnabled();
  18  |  await page.reload();await page.getByRole('button',{name:'Run credit assessment',exact:true}).click();await page.getByRole('button',{name:'Run assessment',exact:true}).click();await expect.poll(()=>keys.length).toBe(2);expect(keys[1]).toBe(keys[0]);
  19  |  await expect(page.getByText('More information needed', {exact:true}).first()).toBeVisible();await expect(page.getByText('george-financial-profile-v1', {exact:false})).toHaveCount(0);
  20  | });
  21  | test('Finance Match creates a missing PDF for an older assessment linked from Credit Assessment',async({page},testInfo)=>{
  22  |  let selected='';let periodDays=0;
  23  |  const pkg={id:'00000000-0000-4000-8000-000000000003',periodFrom:'2026-08-22T00:00:00Z',periodTo:'2026-09-21T00:00:00Z',createdAt:'2026-09-21T00:00:00Z',assessment:older,assessmentBinding:'verified'};
  24  |  await page.route('**/api/merchant/me/finance-packages',route=>{if(route.request().method()==='GET')return route.fallback();selected=route.request().postDataJSON().assessmentId;periodDays=route.request().postDataJSON().periodDays;return route.fulfill({json:pkg});});
  25  |  await page.goto(`/finance-match?assessmentId=${older.id}`);
  26  |  await expect(page.getByRole('heading',{name:'No PDF yet'})).toBeVisible();
  27  |  // No reporting-period selector or separate prepare/preview workflow.
  28  |  await expect(page.getByRole('button',{name:'7 days'})).toHaveCount(0);
  29  |  await expect(page.getByText("doesn't have a PDF yet",{exact:false})).toBeVisible();
  30  |  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth)).toBe(true);
  31  |  await page.screenshot({path:`/tmp/mcbuse-demo-finance-${testInfo.project.name}.png`,fullPage:true});
  32  |  await page.getByRole('button',{name:'Create PDF'}).click();
  33  |  await expect(page.getByText('PDF created.',{exact:false})).toBeVisible();
  34  |  expect(selected).toBe(older.id);expect(periodDays).toBe(30);
  35  | });
  36  | test('one Run assessment saves changed information, runs the assessment and creates its PDF',async({page},testInfo)=>{
  37  |  const order:string[]=[];
  38  |  let creditProfile={loanAmountMinor:'250000',commencementDate:'2024-01-01'};
  39  |  let packages:Array<{id:string;createdAt:string;assessment:typeof latest;assessmentBinding:string}>=[];
  40  |  await page.route('**/api/merchant/me/credit-profile',async route=>{
  41  |    if(route.request().method()==='PATCH'){
  42  |      order.push('profile');
  43  |      creditProfile=route.request().postDataJSON().data;
  44  |      return route.fulfill({json:creditProfile});
  45  |    }
  46  |    return route.fulfill({json:creditProfile});
  47  |  });
  48  |  await page.route('**/api/merchant/me/assessments',route=>{if(route.request().method()==='GET')return route.fulfill({json:{assessments:[latest]}});order.push('assessment');return route.fulfill({json:latest});});
  49  |  await page.route('**/api/merchant/me/finance-packages',route=>{
  50  |    if(route.request().method()==='GET')return route.fulfill({json:{items:packages}});
  51  |    order.push('pdf');
  52  |    expect(route.request().postDataJSON()).toMatchObject({assessmentId:latest.id,periodDays:30});
  53  |    packages=[{id:'00000000-0000-4000-8000-000000000009',createdAt:'2026-09-21T00:00:00Z',assessment:latest,assessmentBinding:'verified'}];
  54  |    return route.fulfill({json:packages[0]});
  55  |  });
  56  |  await page.goto('/credit-assessment');
  57  |  await page.getByRole('button',{name:'Run credit assessment'}).click();
  58  |  const drawer=page.getByRole('dialog',{name:'Run credit assessment'});
  59  |  // Section one: what George's inputs look like from recorded activity, missing ones named.
  60  |  await expect(drawer.getByRole('heading',{name:/Check what your records show/})).toBeVisible();
  61  |  await expect(drawer.getByText('Recorded sales',{exact:true})).toBeVisible();
  62  |  await expect(drawer.getByText('1 of 2 available')).toBeVisible();
  63  |  await expect(drawer.getByText('Verified supplier spending is not connected.')).toBeVisible();
  64  |  // Section two: the merchant's Additional Information, prefilled.
  65  |  await expect(drawer.getByRole('heading',{name:/Add what's missing/})).toBeVisible();
  66  |  // Blank declarations are flagged so the merchant sees what to fill in.
  67  |  await expect(drawer.getByText('Missing',{exact:true}).first()).toBeVisible();
  68  |  await expect(page.getByLabel('Requested loan amount (EUR)')).toHaveValue('2500.00');
  69  |  await page.screenshot({path:`/tmp/mcbuse-demo-assessment-${testInfo.project.name}.png`,fullPage:true});
  70  |  await page.getByLabel('Requested loan amount (EUR)').fill('3000.00');
  71  |  await expect(page.getByRole('button',{name:'Save credit profile'})).toHaveCount(0);
  72  |  await drawer.getByRole('button',{name:'Run assessment',exact:true}).click();
  73  |  await expect(page.getByText('Assessment saved and its PDF created.')).toBeVisible();
  74  |  await expect(drawer).toHaveCount(0);
  75  |  expect(order).toEqual(['profile','assessment','pdf']);
  76  |  await expect(page.getByRole('link',{name:'Download',exact:true})).toHaveAttribute('href',/000000000009\/pdf$/);
  77  |  // Viewing opens the PDF inline in a new tab instead of forcing a download.
  78  |  await expect(page.getByRole('link',{name:'View PDF'})).toHaveAttribute('href',/000000000009\/pdf\?preview=true$/);
  79  |  expect(creditProfile.loanAmountMinor).toBe('300000');
  80  | });
  81  | test('Finance Match emails a selected saved PDF',async({page})=>{
  82  |  const pkg={id:'00000000-0000-4000-8000-000000000007',periodFrom:'2026-09-14T00:00:00Z',periodTo:'2026-09-21T00:00:00Z',createdAt:'2026-09-21T00:00:00Z',assessment:latest,assessmentBinding:'verified'};
  83  |  let sentTo='';
  84  |  await page.route('**/api/merchant/me/finance-packages',route=>route.fulfill({json:{items:[pkg]}}));
  85  |  await page.route(`**/api/merchant/me/finance-packages/${pkg.id}/preview`,route=>route.fulfill({json:pkg}));
  86  |  await page.route(`**/api/merchant/me/finance-packages/${pkg.id}/email`,route=>{
  87  |    sentTo=route.request().postDataJSON().recipientEmail;
  88  |    return route.fulfill({json:{status:'accepted_by_smtp'}});
  89  |  });
  90  |  await page.route('**/pdf?preview=true',route=>route.fulfill({body:'PDF fixture',contentType:'text/plain'}));
  91  |  await page.goto('/finance-match');
  92  |  await expect(page.getByRole('heading',{name:/Sept? 2026/})).toBeVisible();
  93  |  await page.getByRole('button',{name:'Email to a lender'}).click();
  94  |  const drawer=page.getByRole('dialog',{name:'Email assessment PDF'});
  95  |  await expect(drawer.getByRole('link',{name:'Open PDF'})).toHaveAttribute('href',/000000000007\/pdf\?preview=true$/);
  96  |  await page.getByLabel('Recipient email').fill('lender@example.test');
  97  |  await page.getByRole('checkbox',{name:/I confirm I am authorised/}).check();
  98  |  await page.getByRole('button',{name:'Email PDF and data'}).click();
  99  |  await expect(page.getByText('Accepted by the mail server. Inbox delivery has not been confirmed.')).toBeVisible();
  100 |  expect(sentTo).toBe('lender@example.test');
  101 | });
  102 | test('assessment consent is asked for in the form and recorded before the run',async({page})=>{
  103 |  const order:string[]=[];let active=false;
  104 |  await page.route('**/api/merchant/me/consents',route=>{if(route.request().method()==='POST'){order.push('consent');active=route.request().postDataJSON().active===true;}return route.fulfill({json:{active,purpose:'evidence',version:'1',recordedAt:null}});});
  105 |  await page.route('**/api/merchant/me/assessments',route=>{if(route.request().method()==='GET')return route.fulfill({json:{assessments:[latest]}});order.push('assessment');return route.fulfill({json:latest});});
  106 |  await page.route('**/api/merchant/me/finance-packages',route=>route.request().method()==='GET'?route.fulfill({json:{items:[]}}):route.fulfill({json:{id:'00000000-0000-4000-8000-000000000010',createdAt:'2026-09-21T00:00:00Z',assessment:latest,assessmentBinding:'verified'}}));
  107 |  await page.goto('/credit-assessment');
  108 |  // No separate consent card or tab on the page itself.
  109 |  await expect(page.getByRole('button',{name:'Give consent'})).toHaveCount(0);
  110 |  await page.getByRole('button',{name:'Run credit assessment',exact:true}).click();
  111 |  const run=page.getByRole('button',{name:'Run assessment',exact:true});
  112 |  await expect(run).toBeDisabled();
> 113 |  await page.getByLabel('Use my saved business records for this assessment',{exact:false}).check();
      |                                                                                           ^ Error: locator.check: Test timeout of 30000ms exceeded.
  114 |  await expect(run).toBeEnabled();
  115 |  await run.click();
  116 |  await expect(page.getByText('Assessment saved and its PDF created.')).toBeVisible();
  117 |  expect(order).toEqual(['consent','assessment']);
  118 | });
  119 | test('the latest assessment says what to do next and opens the form from there',async({page})=>{
  120 |  const needsDetails={...latest,credit:{...latest.credit,unavailableFields:['loan_amount_eur','estimated_margin_pct','active_day_ratio'],missingReasons:{loan_amount_eur:'Not provided in the business credit profile.',estimated_margin_pct:'Verified supplier spending is not connected.',active_day_ratio:'Not enough recorded sales in the evidence period.'},provenance:{loan_amount_eur:'unavailable',estimated_margin_pct:'unavailable',active_day_ratio:'unavailable',finalized_payments:'merchant_recorded_cash'}}};
  121 |  await page.route('**/api/merchant/me/assessments',route=>route.fulfill({json:{assessments:[needsDetails]}}));
  122 |  await page.goto('/credit-assessment');
  123 |  const result=page.getByRole('region',{name:'Result'});
  124 |  await expect(result.getByText("Your score isn't ready yet")).toBeVisible();
  125 |  // Each gap is grouped by what the merchant can do about it.
  126 |  await expect(page.getByText('You can add these now')).toBeVisible();
  127 |  await expect(page.getByText('These build up as you record sales')).toBeVisible();
  128 |  await expect(page.getByText("MCBuse can't measure these yet",{exact:false})).toBeVisible();
  129 |  await expect(page.getByText('1 of 4 available')).toBeVisible();
  130 |  await result.getByRole('button',{name:'Add 1 missing detail'}).click();
  131 |  await expect(page.getByRole('dialog',{name:'Run credit assessment'})).toBeVisible();
  132 | });
  133 | test('a calculated score is shown large, with its confidence',async({page})=>{
  134 |  const scored={...latest,stage:'financial_profile_available',credit:{...latest.credit,financialProfile:{score:64.25,scale:'0-100',breakdown:{}},profileConfidence:{label:'Medium' as const,confidenceScore:0.7,coveragePct:80,dataReliabilityQualityPct:90,fieldsFilled:8,fieldsTotal:10},unavailableFields:[],missingReasons:{}}};
  135 |  await page.route('**/api/merchant/me/assessments',route=>route.fulfill({json:{assessments:[scored]}}));
  136 |  await page.goto('/credit-assessment');
  137 |  const result=page.getByRole('region',{name:'Result'});
  138 |  await expect(result.getByText('64.3')).toBeVisible();
  139 |  await expect(result.getByText('Medium',{exact:true})).toBeVisible();
  140 |  await expect(result.getByRole('button')).toHaveCount(0);
  141 | });
  142 | 
```