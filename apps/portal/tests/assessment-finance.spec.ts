import { expect, test } from '@playwright/test';
const latest={id:'00000000-0000-4000-8000-000000000002',modelId:'george-financial-profile-v1',modelVersion:'george-html-2026.09.1',stage:'missing_model_inputs',score:null,evidenceWindow:{from:'2026-06-23T00:00:00Z',to:'2026-09-21T00:00:00Z',days:90},passedRequirements:['Saved profile'],missingRequirements:['George model input: estimated margin pct'],reliability:{},sourceCoverage:{},limitations:['Missing verified supplier spending.'],disclaimer:'George financial profile is not a lending decision.',businessProfile:{businessName:'Latest shop'},credit:{status:'ready' as const,modelVersion:'george-html-2026.09.1',financialProfile:null,profileConfidence:null,unavailableFields:['estimated_margin_pct'],missingReasons:{estimated_margin_pct:'Verified supplier spending is not connected.'},integritySummary:[],businessAgeMonths:24,indicators:{},provenance:{}},createdAt:'2026-09-21T00:00:00Z',actorUserId:'user'};
const inputsPreview={asOfDate:'2026-09-26',evidenceWindow:{from:'2026-06-28T00:00:00Z',to:'2026-09-26T00:00:00Z'},inputs:[{key:'finalized_payments',value:12,provenance:'mcbuse_live_payments',missingReason:null},{key:'estimated_margin_pct',value:null,provenance:'unavailable',missingReason:'Verified supplier spending is not connected.'}],integritySummary:['12 live verified payments.']};
const older={...latest,id:'00000000-0000-4000-8000-000000000001',createdAt:'2026-09-01T00:00:00Z',businessProfile:{businessName:'Older saved shop'}};
test.beforeEach(async({context,page})=>{
 await context.addCookies([{name:'mcbuse_portal_access',value:'test-only',url:'http://127.0.0.1:3101',httpOnly:true,sameSite:'Lax'},{name:'mcbuse_portal_csrf',value:'csrf-fixture',url:'http://127.0.0.1:3101'}]);
 await page.route('**/api/merchant/me/assessments',route=>route.request().method()==='GET'?route.fulfill({json:{assessments:[latest,older]}}):route.fallback());
 await page.route('**/api/merchant/me/consents',route=>route.fulfill({json:{active:true,purpose:'evidence',version:'1',recordedAt:null}}));
 await page.route('**/api/merchant/me/finance-packages',route=>route.request().method()==='GET'?route.fulfill({json:{items:[]}}):route.fallback());
 await page.route('**/api/merchant/me/finance-packages/email-attempts',route=>route.fulfill({json:{items:[]}}));
 await page.route('**/api/merchant/me/credit-profile',route=>route.fulfill({json:{}}));
 await page.route('**/api/merchant/me/credit-inputs',route=>route.fulfill({json:inputsPreview}));
});
test('assessment retries retain their intent after a lost response and page refresh',async({page})=>{
 const keys:string[]=[];
 await page.route('**/api/merchant/me/assessments',route=>{if(route.request().method()==='GET')return route.fallback();expect(route.request().postDataJSON().modelId).toBe('george-financial-profile-v1');const key=route.request().headers()['idempotency-key'];if(!key)throw new Error('Missing assessment idempotency key');keys.push(key);return keys.length===1?route.abort():route.fulfill({json:latest});});
 await page.goto('/credit-assessment');await page.getByRole('button',{name:'Run credit assessment',exact:true}).click();await page.getByRole('button',{name:'Run assessment',exact:true}).click();await expect(page.getByRole('button',{name:'Run assessment',exact:true})).toBeEnabled();
 await page.reload();await page.getByRole('button',{name:'Run credit assessment',exact:true}).click();await page.getByRole('button',{name:'Run assessment',exact:true}).click();await expect.poll(()=>keys.length).toBe(2);expect(keys[1]).toBe(keys[0]);
 await expect(page.getByText('More information needed', {exact:true}).first()).toBeVisible();await expect(page.getByText('george-financial-profile-v1', {exact:false})).toHaveCount(0);
});
test('Finance Match creates a missing PDF for an older assessment linked from Credit Assessment',async({page},testInfo)=>{
 let selected='';let periodDays=0;
 const pkg={id:'00000000-0000-4000-8000-000000000003',periodFrom:'2026-08-22T00:00:00Z',periodTo:'2026-09-21T00:00:00Z',createdAt:'2026-09-21T00:00:00Z',assessment:older,assessmentBinding:'verified'};
 await page.route('**/api/merchant/me/finance-packages',route=>{if(route.request().method()==='GET')return route.fallback();selected=route.request().postDataJSON().assessmentId;periodDays=route.request().postDataJSON().periodDays;return route.fulfill({json:pkg});});
 await page.goto(`/finance-match?assessmentId=${older.id}`);
 await expect(page.getByRole('heading',{name:'No PDF yet'})).toBeVisible();
 // No reporting-period selector or separate prepare/preview workflow.
 await expect(page.getByRole('button',{name:'7 days'})).toHaveCount(0);
 await expect(page.getByText("doesn't have a PDF yet",{exact:false})).toBeVisible();
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth)).toBe(true);
 await page.screenshot({path:`/tmp/mcbuse-demo-finance-${testInfo.project.name}.png`,fullPage:true});
 await page.getByRole('button',{name:'Create PDF'}).click();
 await expect(page.getByText('PDF created.',{exact:false})).toBeVisible();
 expect(selected).toBe(older.id);expect(periodDays).toBe(30);
});
test('one Run assessment saves changed information, runs the assessment and creates its PDF',async({page},testInfo)=>{
 const order:string[]=[];
 let creditProfile={loanAmountMinor:'250000',commencementDate:'2024-01-01'};
 let packages:Array<{id:string;createdAt:string;assessment:typeof latest;assessmentBinding:string}>=[];
 await page.route('**/api/merchant/me/credit-profile',async route=>{
   if(route.request().method()==='PATCH'){
     order.push('profile');
     creditProfile=route.request().postDataJSON().data;
     return route.fulfill({json:creditProfile});
   }
   return route.fulfill({json:creditProfile});
 });
 await page.route('**/api/merchant/me/assessments',route=>{if(route.request().method()==='GET')return route.fulfill({json:{assessments:[latest]}});order.push('assessment');return route.fulfill({json:latest});});
 await page.route('**/api/merchant/me/finance-packages',route=>{
   if(route.request().method()==='GET')return route.fulfill({json:{items:packages}});
   order.push('pdf');
   expect(route.request().postDataJSON()).toMatchObject({assessmentId:latest.id,periodDays:30});
   packages=[{id:'00000000-0000-4000-8000-000000000009',createdAt:'2026-09-21T00:00:00Z',assessment:latest,assessmentBinding:'verified'}];
   return route.fulfill({json:packages[0]});
 });
 await page.goto('/credit-assessment');
 await page.getByRole('button',{name:'Run credit assessment'}).click();
 const drawer=page.getByRole('dialog',{name:'Run credit assessment'});
 // Section one: what George's inputs look like from recorded activity, missing ones named.
 await expect(drawer.getByRole('heading',{name:/Check what your records show/})).toBeVisible();
 await expect(drawer.getByText('Recorded sales',{exact:true})).toBeVisible();
 await expect(drawer.getByText('1 of 2 available')).toBeVisible();
 await expect(drawer.getByText('Verified supplier spending is not connected.')).toBeVisible();
 // Section two: the merchant's Additional Information, prefilled.
 await expect(drawer.getByRole('heading',{name:/Add what's missing/})).toBeVisible();
 // Blank declarations are flagged so the merchant sees what to fill in.
 await expect(drawer.getByText('Missing',{exact:true}).first()).toBeVisible();
 await expect(page.getByLabel('Requested loan amount (EUR)')).toHaveValue('2500.00');
 await page.screenshot({path:`/tmp/mcbuse-demo-assessment-${testInfo.project.name}.png`,fullPage:true});
 await page.getByLabel('Requested loan amount (EUR)').fill('3000.00');
 await expect(page.getByRole('button',{name:'Save credit profile'})).toHaveCount(0);
 await drawer.getByRole('button',{name:'Run assessment',exact:true}).click();
 await expect(page.getByText('Assessment saved and its PDF created.')).toBeVisible();
 await expect(drawer).toHaveCount(0);
 expect(order).toEqual(['profile','assessment','pdf']);
 await expect(page.getByRole('link',{name:'Download',exact:true})).toHaveAttribute('href',/000000000009\/pdf$/);
 // Viewing opens the PDF inline in a new tab instead of forcing a download.
 await expect(page.getByRole('link',{name:'View PDF'})).toHaveAttribute('href',/000000000009\/pdf\?preview=true$/);
 expect(creditProfile.loanAmountMinor).toBe('300000');
});
test('Finance Match emails a selected saved PDF',async({page})=>{
 const pkg={id:'00000000-0000-4000-8000-000000000007',periodFrom:'2026-09-14T00:00:00Z',periodTo:'2026-09-21T00:00:00Z',createdAt:'2026-09-21T00:00:00Z',assessment:latest,assessmentBinding:'verified'};
 let sentTo='';
 await page.route('**/api/merchant/me/finance-packages',route=>route.fulfill({json:{items:[pkg]}}));
 await page.route(`**/api/merchant/me/finance-packages/${pkg.id}/preview`,route=>route.fulfill({json:pkg}));
 await page.route(`**/api/merchant/me/finance-packages/${pkg.id}/email`,route=>{
   sentTo=route.request().postDataJSON().recipientEmail;
   return route.fulfill({json:{status:'accepted_by_smtp'}});
 });
 await page.route('**/pdf?preview=true',route=>route.fulfill({body:'PDF fixture',contentType:'text/plain'}));
 await page.goto('/finance-match');
 await expect(page.getByRole('heading',{name:/Sept? 2026/})).toBeVisible();
 await page.getByRole('button',{name:'Email to a lender'}).click();
 const drawer=page.getByRole('dialog',{name:'Email assessment PDF'});
 await expect(drawer.getByRole('link',{name:'Open PDF'})).toHaveAttribute('href',/000000000007\/pdf\?preview=true$/);
 await page.getByLabel('Recipient email').fill('lender@example.test');
 await page.getByRole('checkbox',{name:/I confirm I am authorised/}).check();
 await page.getByRole('button',{name:'Email PDF and data'}).click();
 await expect(page.getByText('Accepted by the mail server. Inbox delivery has not been confirmed.')).toBeVisible();
 expect(sentTo).toBe('lender@example.test');
});
test('assessment consent is asked for in the form and recorded before the run',async({page})=>{
 const order:string[]=[];let active=false;
 await page.route('**/api/merchant/me/consents',route=>{if(route.request().method()==='POST'){order.push('consent');active=route.request().postDataJSON().active===true;}return route.fulfill({json:{active,purpose:'evidence',version:'1',recordedAt:null}});});
 await page.route('**/api/merchant/me/assessments',route=>{if(route.request().method()==='GET')return route.fulfill({json:{assessments:[latest]}});order.push('assessment');return route.fulfill({json:latest});});
 await page.route('**/api/merchant/me/finance-packages',route=>route.request().method()==='GET'?route.fulfill({json:{items:[]}}):route.fulfill({json:{id:'00000000-0000-4000-8000-000000000010',createdAt:'2026-09-21T00:00:00Z',assessment:latest,assessmentBinding:'verified'}}));
 await page.goto('/credit-assessment');
 // No separate consent card or tab on the page itself.
 await expect(page.getByRole('button',{name:'Give consent'})).toHaveCount(0);
 await page.getByRole('button',{name:'Run credit assessment',exact:true}).click();
 const run=page.getByRole('button',{name:'Run assessment',exact:true});
 await expect(run).toBeDisabled();
 await page.getByLabel('Use my saved business records for this assessment',{exact:false}).check();
 await expect(run).toBeEnabled();
 await run.click();
 await expect(page.getByText('Assessment saved and its PDF created.')).toBeVisible();
 expect(order).toEqual(['consent','assessment']);
});
test('the latest assessment says what to do next and opens the form from there',async({page})=>{
 const needsDetails={...latest,credit:{...latest.credit,unavailableFields:['loan_amount_eur','estimated_margin_pct','active_day_ratio'],missingReasons:{loan_amount_eur:'Not provided in the business credit profile.',estimated_margin_pct:'Verified supplier spending is not connected.',active_day_ratio:'Not enough recorded sales in the evidence period.'},provenance:{loan_amount_eur:'unavailable',estimated_margin_pct:'unavailable',active_day_ratio:'unavailable',finalized_payments:'merchant_recorded_cash'}}};
 await page.route('**/api/merchant/me/assessments',route=>route.fulfill({json:{assessments:[needsDetails]}}));
 await page.goto('/credit-assessment');
 const result=page.getByRole('region',{name:'Result'});
 await expect(result.getByText("Your score isn't ready yet")).toBeVisible();
 // Each gap is grouped by what the merchant can do about it.
 await expect(page.getByText('You can add these now')).toBeVisible();
 await expect(page.getByText('These build up as you record sales')).toBeVisible();
 await expect(page.getByText("MCBuse can't measure these yet",{exact:false})).toBeVisible();
 await expect(page.getByText('1 of 4 available')).toBeVisible();
 await result.getByRole('button',{name:'Add 1 missing detail'}).click();
 await expect(page.getByRole('dialog',{name:'Run credit assessment'})).toBeVisible();
});
test('a calculated score is shown large, with its confidence',async({page})=>{
 const scored={...latest,stage:'financial_profile_available',credit:{...latest.credit,financialProfile:{score:64.25,scale:'0-100',breakdown:{}},profileConfidence:{label:'Medium' as const,confidenceScore:0.7,coveragePct:80,dataReliabilityQualityPct:90,fieldsFilled:8,fieldsTotal:10},unavailableFields:[],missingReasons:{}}};
 await page.route('**/api/merchant/me/assessments',route=>route.fulfill({json:{assessments:[scored]}}));
 await page.goto('/credit-assessment');
 const result=page.getByRole('region',{name:'Result'});
 await expect(result.getByText('64.3')).toBeVisible();
 await expect(result.getByText('Medium',{exact:true})).toBeVisible();
 await expect(result.getByRole('button')).toHaveCount(0);
});
test('the credit score leads the result, with the financial profile beside it',async({page},testInfo)=>{
 const scored={...latest,stage:'financial_profile_available',credit:{...latest.credit,financialProfile:{score:64.25,scale:'0-100',breakdown:{}},creditScore:{score:712,grade:'Good',scale:'300-850' as const},profileConfidence:{label:'Medium' as const,confidenceScore:0.7,coveragePct:80,dataReliabilityQualityPct:90,fieldsFilled:8,fieldsTotal:10},unavailableFields:[],missingReasons:{}}};
 await page.route('**/api/merchant/me/assessments',route=>route.fulfill({json:{assessments:[scored]}}));
 await page.goto('/credit-assessment');
 const result=page.getByRole('region',{name:'Result'});
 await expect(result.getByText('Your credit score')).toBeVisible();
 await expect(result.getByText('712',{exact:true})).toBeVisible();
 await expect(result.getByRole('img',{name:/Credit score 712 .* grade Good/})).toBeVisible();
 await expect(result.getByText('Financial profile')).toBeVisible();
 await expect(result.getByText('64.3')).toBeVisible();
 await expect(page.getByText('experimental',{exact:false})).toHaveCount(0);
 await expect(page.getByRole('button',{name:/Credit score 712/})).toBeVisible();
 await page.screenshot({path:testInfo.outputPath('credit-score.png'),fullPage:true});
});
