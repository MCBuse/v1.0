# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: assessment-finance.spec.ts >> Finance Match emails a selected saved PDF
- Location: tests/assessment-finance.spec.ts:81:1

# Error details

```
Error: expect(locator).toBeVisible() failed

Locator: getByText('Accepted by the mail server. Inbox delivery has not been confirmed.')
Expected: visible
Error: strict mode violation: getByText('Accepted by the mail server. Inbox delivery has not been confirmed.') resolved to 2 elements:
    1) <p role="status" class="text-sm font-medium text-emerald-700">Accepted by the mail server. Inbox delivery has n…</p> aka locator('main').getByText('Accepted by the mail server.')
    2) <p role="status" class="rounded-lg border border-slate-200 px-4 py-3 text-sm text-slate-700">Accepted by the mail server. Inbox delivery has n…</p> aka getByRole('status')

Call log:
  - Expect "toBeVisible" getByText('Accepted by the mail server. Inbox delivery has not been confirmed.') with timeout 5000ms
  - waiting for getByText('Accepted by the mail server. Inbox delivery has not been confirmed.')

```

# Page snapshot

```yaml
- generic [active]:
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
            - paragraph: Finance Match
            - heading [level=1]: Share your assessment
            - paragraph: Send your credit assessment PDF to a lender, or download it to share yourself.
          - status: Accepted by the mail server. Inbox delivery has not been confirmed.
          - generic:
            - generic:
              - generic:
                - generic:
                  - generic:
                    - paragraph: Latest assessment PDF
                    - heading [level=2]: 21 Sept 2026
                    - paragraph: Latest shop · Covers 14 Sept 2026 – 21 Sept 2026
                  - generic: More information needed
                - generic:
                  - button: Email to a lender
                  - link:
                    - /url: /api/merchant/me/finance-packages/00000000-0000-4000-8000-000000000007/pdf?preview=true
                    - text: View PDF
                  - link:
                    - /url: /api/merchant/me/finance-packages/00000000-0000-4000-8000-000000000007/pdf
                    - text: Download
                - paragraph: Not sent to anyone yet.
          - generic:
            - tablist:
              - tab [selected]:
                - text: Earlier PDFs
                - generic: "0"
              - tab:
                - text: Sent emails
                - generic: "0"
            - tabpanel:
              - paragraph: No earlier PDFs. Each new credit assessment adds one here.
  - alert
  - dialog [ref=e2]:
    - generic [ref=e3]:
      - heading "Email assessment PDF" [level=2] [ref=e4]
      - paragraph [ref=e5]: The recipient gets this PDF and its data file.
      - button "Close" [ref=e6]
    - generic [ref=e10]:
      - generic [ref=e11]:
        - generic [ref=e12]:
          - paragraph [ref=e13]: PDF from 21 Sept 2026, 00:00
          - paragraph [ref=e14]: More information needed
        - link "Open PDF" [ref=e15] [cursor=pointer]:
          - /url: /api/merchant/me/finance-packages/00000000-0000-4000-8000-000000000007/pdf?preview=true
      - status [ref=e16]: Accepted by the mail server. Inbox delivery has not been confirmed.
      - generic [ref=e17]:
        - generic [ref=e18]: Recipient email
        - textbox "Recipient email" [ref=e19]
      - generic [ref=e20]:
        - generic [ref=e21]: Lender or institution (optional)
        - textbox "Lender or institution (optional)" [ref=e22]
      - generic [ref=e23]:
        - checkbox "I confirm I am authorised to share this PDF with this recipient." [ref=e24]
        - generic [ref=e25]: I confirm I am authorised to share this PDF with this recipient.
    - generic [ref=e26]:
      - button "Done" [ref=e27]
      - button "Send another copy" [ref=e28]
```

# Test source

```ts
  1   | import { expect, test } from '@playwright/test';
  2   | const latest={id:'00000000-0000-4000-8000-000000000002',modelId:'george-financial-profile-v1',modelVersion:'george-html-2026.09.1',stage:'missing_model_inputs',score:null,evidenceWindow:{from:'2026-06-23T00:00:00Z',to:'2026-09-21T00:00:00Z',days:90},passedRequirements:['Saved profile'],missingRequirements:['George model input: estimated margin pct'],reliability:{},sourceCoverage:{},limitations:['Missing verified supplier spending.'],disclaimer:'George financial profile is not a lending decision.',businessProfile:{businessName:'Latest shop'},credit:{status:'ready' as const,modelVersion:'george-html-2026.09.1',financialProfile:null,profileConfidence:null,unavailableFields:['estimated_margin_pct'],missingReasons:{estimated_margin_pct:'Verified supplier spending is not connected.'},integritySummary:[],businessAgeMonths:24,indicators:{},provenance:{}},createdAt:'2026-09-21T00:00:00Z',actorUserId:'user'};
  3   | const inputsPreview={asOfDate:'2026-09-26',evidenceWindow:{from:'2026-06-28T00:00:00Z',to:'2026-09-26T00:00:00Z'},inputs:[{key:'finalized_payments',value:12,provenance:'mcbuse_live_payments',missingReason:null},{key:'estimated_margin_pct',value:null,provenance:'unavailable',missingReason:'Verified supplier spending is not connected.'}],integritySummary:['12 live verified payments.']};
  4   | const older={...latest,id:'00000000-0000-4000-8000-000000000001',createdAt:'2026-09-01T00:00:00Z',businessProfile:{businessName:'Older saved shop'}};
  5   | test.beforeEach(async({context,page})=>{
  6   |  await context.addCookies([{name:'mcbuse_portal_access',value:'test-only',url:'http://127.0.0.1:3101',httpOnly:true,sameSite:'Lax'},{name:'mcbuse_portal_csrf',value:'csrf-fixture',url:'http://127.0.0.1:3101'}]);
  7   |  await page.route('**/api/merchant/me/assessments',route=>route.request().method()==='GET'?route.fulfill({json:{assessments:[latest,older]}}):route.fallback());
  8   |  await page.route('**/api/merchant/me/consents',route=>route.fulfill({json:{active:true,purpose:'evidence',version:'1',recordedAt:null}}));
  9   |  await page.route('**/api/merchant/me/finance-packages',route=>route.request().method()==='GET'?route.fulfill({json:{items:[]}}):route.fallback());
  10  |  await page.route('**/api/merchant/me/finance-packages/email-attempts',route=>route.fulfill({json:{items:[]}}));
  11  |  await page.route('**/api/merchant/me/credit-profile',route=>route.fulfill({json:{}}));
  12  |  await page.route('**/api/merchant/me/credit-inputs',route=>route.fulfill({json:inputsPreview}));
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
> 99  |  await expect(page.getByText('Accepted by the mail server. Inbox delivery has not been confirmed.')).toBeVisible();
      |                                                                                                      ^ Error: expect(locator).toBeVisible() failed
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
  113 |  await page.getByLabel('Use my saved business records for this assessment',{exact:false}).check();
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