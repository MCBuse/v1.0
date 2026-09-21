import { expect, test } from '@playwright/test';
const latest={id:'00000000-0000-4000-8000-000000000002',modelId:'readiness-rules-v1',modelVersion:'1',stage:'building_evidence',score:null,evidenceWindow:{from:'2026-06-23T00:00:00Z',to:'2026-09-21T00:00:00Z',days:90},passedRequirements:['Saved profile'],missingRequirements:['More trading history'],reliability:{},sourceCoverage:{},limitations:['Third-party scoring model is not included.'],disclaimer:'Evidence readiness is not a credit score.',businessProfile:{businessName:'Latest shop'},createdAt:'2026-09-21T00:00:00Z',actorUserId:'user'};
const older={...latest,id:'00000000-0000-4000-8000-000000000001',createdAt:'2026-09-01T00:00:00Z',businessProfile:{businessName:'Older saved shop'}};
test.beforeEach(async({context,page})=>{
 await context.addCookies([{name:'mcbuse_portal_access',value:'test-only',url:'http://127.0.0.1:3101',httpOnly:true,sameSite:'Lax'},{name:'mcbuse_portal_csrf',value:'csrf-fixture',url:'http://127.0.0.1:3101'}]);
 await page.route('**/api/merchant/me/assessments',route=>route.request().method()==='GET'?route.fulfill({json:{assessments:[latest,older]}}):route.fallback());
 await page.route('**/api/merchant/me/finance-packages',route=>route.request().method()==='GET'?route.fulfill({json:{items:[]}}):route.fallback());
 await page.route('**/api/merchant/me/finance-packages/email-attempts',route=>route.fulfill({json:{items:[]}}));
});
test('assessment retries retain their intent after a lost response and page refresh',async({page})=>{
 const keys:string[]=[];
 await page.route('**/api/merchant/me/assessments',route=>{if(route.request().method()==='GET')return route.fallback();keys.push(route.request().headers()['idempotency-key']);return keys.length===1?route.abort():route.fulfill({json:latest});});
 await page.goto('/credit-assessment');await page.getByRole('button',{name:'Run assessment',exact:true}).click();await expect(page.getByRole('button',{name:'Run assessment',exact:true})).toBeEnabled();
 await page.reload();await page.getByRole('button',{name:'Run assessment',exact:true}).click();await expect.poll(()=>keys.length).toBe(2);expect(keys[1]).toBe(keys[0]);
 await expect(page.getByText('readiness-rules-v1 / 1')).toBeVisible();
});
test('Finance Match defaults visibly to latest and packages the explicitly selected older assessment',async({page})=>{
 let selected='';
 const pkg={id:'00000000-0000-4000-8000-000000000003',periodFrom:'2026-09-14T00:00:00Z',periodTo:'2026-09-21T00:00:00Z',createdAt:'2026-09-21T00:00:00Z',assessment:older,assessmentBinding:'verified'};
 await page.route('**/api/merchant/me/finance-packages',route=>{if(route.request().method()==='GET')return route.fallback();selected=route.request().postDataJSON().assessmentId;return route.fulfill({json:pkg});});
 await page.route(`**/api/merchant/me/finance-packages/${pkg.id}/preview`,route=>route.fulfill({json:pkg}));
 await page.route('**/pdf?preview=true',route=>route.fulfill({body:'PDF fixture',contentType:'text/plain'}));
 await page.goto('/finance-match');await expect(page.getByLabel('Saved assessment')).toHaveValue(latest.id);
 await page.getByLabel('Saved assessment').selectOption(older.id);await page.getByRole('button',{name:'7 days',exact:true}).click();await page.getByRole('button',{name:'Generate and preview'}).click();
 await expect(page.getByText('Older saved shop')).toBeVisible();expect(selected).toBe(older.id);await expect(page.getByText('Evidence period', {exact:true})).toBeVisible();
 await expect(page.getByTitle('Immutable financial evidence PDF')).toHaveAttribute('src',/preview=true/);
});
