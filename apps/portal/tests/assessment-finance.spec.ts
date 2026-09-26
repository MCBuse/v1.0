import { expect, test } from '@playwright/test';
const latest={id:'00000000-0000-4000-8000-000000000002',modelId:'george-financial-profile-v1',modelVersion:'george-html-2026.09.1',stage:'missing_model_inputs',score:null,evidenceWindow:{from:'2026-06-23T00:00:00Z',to:'2026-09-21T00:00:00Z',days:90},passedRequirements:['Saved profile'],missingRequirements:['George model input: estimated margin pct'],reliability:{},sourceCoverage:{},limitations:['Missing verified supplier spending.'],disclaimer:'George financial profile is not a lending decision.',businessProfile:{businessName:'Latest shop'},credit:{status:'ready' as const,modelVersion:'george-html-2026.09.1',financialProfile:null,profileConfidence:null,unavailableFields:['estimated_margin_pct'],missingReasons:{estimated_margin_pct:'Verified supplier spending is not connected.'},integritySummary:[],businessAgeMonths:24,indicators:{},provenance:{}},createdAt:'2026-09-21T00:00:00Z',actorUserId:'user'};
const older={...latest,id:'00000000-0000-4000-8000-000000000001',createdAt:'2026-09-01T00:00:00Z',businessProfile:{businessName:'Older saved shop'}};
test.beforeEach(async({context,page})=>{
 await context.addCookies([{name:'mcbuse_portal_access',value:'test-only',url:'http://127.0.0.1:3101',httpOnly:true,sameSite:'Lax'},{name:'mcbuse_portal_csrf',value:'csrf-fixture',url:'http://127.0.0.1:3101'}]);
 await page.route('**/api/merchant/me/assessments',route=>route.request().method()==='GET'?route.fulfill({json:{assessments:[latest,older]}}):route.fallback());
 await page.route('**/api/merchant/me/consents',route=>route.fulfill({json:{active:true,purpose:'evidence',version:'1',recordedAt:null}}));
 await page.route('**/api/merchant/me/finance-packages',route=>route.request().method()==='GET'?route.fulfill({json:{items:[]}}):route.fallback());
 await page.route('**/api/merchant/me/finance-packages/email-attempts',route=>route.fulfill({json:{items:[]}}));
});
test('assessment retries retain their intent after a lost response and page refresh',async({page})=>{
 const keys:string[]=[];
 await page.route('**/api/merchant/me/assessments',route=>{if(route.request().method()==='GET')return route.fallback();expect(route.request().postDataJSON().modelId).toBe('george-financial-profile-v1');const key=route.request().headers()['idempotency-key'];if(!key)throw new Error('Missing assessment idempotency key');keys.push(key);return keys.length===1?route.abort():route.fulfill({json:latest});});
 await page.goto('/credit-assessment');await page.getByRole('button',{name:'Run credit assessment',exact:true}).click();await page.getByRole('button',{name:'Generate assessment PDF',exact:true}).click();await expect(page.getByRole('button',{name:'Generate assessment PDF',exact:true})).toBeEnabled();
 await page.reload();await page.getByRole('button',{name:'Run credit assessment',exact:true}).click();await page.getByRole('button',{name:'Generate assessment PDF',exact:true}).click();await expect.poll(()=>keys.length).toBe(2);expect(keys[1]).toBe(keys[0]);
 await expect(page.getByText('Status: More information needed')).toBeVisible();await expect(page.getByText('george-financial-profile-v1', {exact:false})).toHaveCount(0);
});
test('Finance Match defaults visibly to latest and packages the explicitly selected older assessment',async({page},testInfo)=>{
 let selected='';
 const pkg={id:'00000000-0000-4000-8000-000000000003',periodFrom:'2026-09-14T00:00:00Z',periodTo:'2026-09-21T00:00:00Z',createdAt:'2026-09-21T00:00:00Z',assessment:older,assessmentBinding:'verified'};
 await page.route('**/api/merchant/me/finance-packages',route=>{if(route.request().method()==='GET')return route.fallback();selected=route.request().postDataJSON().assessmentId;return route.fulfill({json:pkg});});
 await page.route(`**/api/merchant/me/finance-packages/${pkg.id}/preview`,route=>route.fulfill({json:pkg}));
 await page.route('**/pdf?preview=true',route=>route.fulfill({body:'PDF fixture',contentType:'text/plain'}));
 await page.goto('/finance-match');await expect(page.getByLabel('Saved assessment')).toHaveValue(latest.id);
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth)).toBe(true);
 await page.screenshot({path:`/tmp/mcbuse-demo-finance-${testInfo.project.name}.png`,fullPage:true});
 await page.getByLabel('Saved assessment').selectOption(older.id);await page.getByRole('button',{name:'7 days',exact:true}).click();await page.getByRole('button',{name:'Generate and preview'}).click();
 await expect(page.getByText('Older saved shop')).toBeVisible();expect(selected).toBe(older.id);await expect(page.getByText('Period covered', {exact:true})).toBeVisible();
 await expect(page.getByTitle('Immutable financial evidence PDF')).toHaveAttribute('src',/preview=true/);
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth)).toBe(true);
});
test('prefilled additional information is saved before the assessment PDF is generated',async({page},testInfo)=>{
 let creditProfile={loanAmountMinor:'250000',commencementDate:'2024-01-01'};
 let packages:Array<{id:string;createdAt:string;assessment:typeof latest;assessmentBinding:string}>=[];
 await page.route('**/api/merchant/me/credit-profile',async route=>{
   if(route.request().method()==='PATCH'){
     creditProfile=route.request().postDataJSON().data;
     return route.fulfill({json:creditProfile});
   }
   return route.fulfill({json:creditProfile});
 });
 await page.route('**/api/merchant/me/assessments',route=>route.request().method()==='GET'?route.fulfill({json:{assessments:[latest]}}):route.fulfill({json:latest}));
 await page.route('**/api/merchant/me/finance-packages',route=>{
   if(route.request().method()==='GET')return route.fulfill({json:{items:packages}});
   expect(route.request().postDataJSON()).toMatchObject({assessmentId:latest.id,periodDays:30});
   packages=[{id:'00000000-0000-4000-8000-000000000009',createdAt:'2026-09-21T00:00:00Z',assessment:latest,assessmentBinding:'verified'}];
   return route.fulfill({json:packages[0]});
 });
 await page.goto('/credit-assessment');
 await page.getByRole('button',{name:'Run credit assessment'}).click();
 await expect(page.getByLabel('Requested loan amount (EUR)')).toHaveValue('2500.00');
 await page.screenshot({path:`/tmp/mcbuse-demo-assessment-${testInfo.project.name}.png`,fullPage:true});
 await page.getByLabel('Requested loan amount (EUR)').fill('3000.00');
 await expect(page.getByRole('button',{name:'Generate assessment PDF'})).toBeDisabled();
 await page.getByRole('button',{name:'Save credit profile'}).click();
 await expect(page.getByRole('button',{name:'Generate assessment PDF'})).toBeEnabled();
 await page.getByRole('button',{name:'Generate assessment PDF'}).click();
 await expect(page.getByText('Assessment and financial evidence PDF saved.')).toBeVisible();
 await expect(page.getByRole('link',{name:'Download PDF'})).toHaveAttribute('href',/000000000009\/pdf$/);
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
 await page.getByRole('button',{name:'Preview / email'}).click();
 await expect(page.getByTitle('Immutable financial evidence PDF')).toHaveAttribute('src',/000000000007\/pdf/);
 await page.getByLabel('Recipient email').fill('lender@example.test');
 await page.getByRole('checkbox',{name:/I confirm I am authorised/}).check();
 await page.getByRole('button',{name:'Email PDF and data'}).click();
 await expect(page.getByText('Accepted by the mail server. Inbox delivery has not been confirmed.')).toBeVisible();
 expect(sentTo).toBe('lender@example.test');
});
