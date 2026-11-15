import {test,expect} from '@playwright/test';
const record={id:'fixture',title:'Burglary prevention fixture',url:'https://example.org/research',source:'Fixture University',source_slug:'fixture',summary:'Synthetic public research for browser testing.',tags:['Burglary']};
test.beforeEach(async({page})=>{
 await page.route('**/api/**',async route=>{
  const u=new URL(route.request().url());let body={};
  if(u.pathname==='/api/status')body={configured:true,email:true};
  else if(u.pathname==='/api/session')body={user:null};
  else if(u.pathname==='/api/community')body={authoritative:false,sources:{}};
  else if(u.pathname==='/api/research')body={total:1,page:1,results:[record]};
  else if(u.pathname==='/api/research/filters')body={sources:[]};
  else if(u.pathname==='/api/research/tags')body=[];
  else if(u.pathname==='/api/research/stats')body={total:1,sources:1};
  else return route.fulfill({status:401,json:{error:{code:'sign_in_required'}}});
  await route.fulfill({json:body});
 });
});
test('homepage topic selection leads to labelled results and source-only searching',async({page})=>{
 const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto('/');const input=page.getByRole('combobox',{name:'Topic or keyword'});await input.fill('burgl');
 await expect(page.locator('#research-suggestions')).toBeVisible();await input.press('ArrowDown');await input.press('Enter');
 await expect(page.locator('#research-selected')).toContainText(/burglary/i);
 await page.locator('#research-form').getByRole('button',{name:'Search',exact:true}).click();
 await expect(page).toHaveURL(/\/research\?/);await expect(page.locator('.result-kind-badge--research')).toBeVisible();
 await page.getByRole('radio',{name:'Sources',exact:true}).check();await page.getByRole('combobox',{name:'Topic or keyword'}).fill('');
 await page.locator('[data-remove-tag]').first().click();await page.locator('#research-form').getByRole('button',{name:'Search',exact:true}).click();
 await expect(page.locator('.result-kind-badge--source').first()).toBeVisible();await expect(page.locator('#search-research-section')).toBeHidden();expect(errors).toEqual([]);
});
test('correcting an invalid year range immediately restores native form validity',async({page})=>{
 await page.goto('/research?scope=research');await expect(page.locator('.research-result')).toHaveCount(1);
 await page.locator('.research-advanced summary').click();await page.getByLabel('Published from').fill('2025');await page.getByLabel('Published to').fill('2020');
 await page.locator('#research-form').getByRole('button',{name:'Search',exact:true}).click();
 expect(await page.getByLabel('Published to').evaluate(e=>e.validity.customError)).toBe(true);
 await page.getByLabel('Published to').fill('2026');expect(await page.getByLabel('Published to').evaluate(e=>e.validity.customError)).toBe(false);
 await page.locator('#research-form').getByRole('button',{name:'Search',exact:true}).click();await expect(page).toHaveURL(/yearFrom=2025.*yearTo=2026/);
 await page.getByLabel('Published from').fill('2028');await page.getByLabel('Published from').fill('2020');expect(await page.getByLabel('Published to').evaluate(e=>e.validity.customError)).toBe(false);
});
test('anonymous administration is gated and failed searches do not show zero matches',async({page})=>{
 await page.goto('/#/admin');await expect(page.locator('main')).not.toContainText('Members and source access');
 await page.route('**/api/research?**',route=>route.fulfill({status:503,json:{error:{code:'unavailable'}}}));
 await page.goto('/research?q=burglary');await expect(page.locator('#research-results')).toContainText('connection problem');await expect(page.locator('#research-results')).not.toContainText('No matching research records');
});
for(const width of [320,390])test(`search and login fit a ${width}px screen`,async({page})=>{
 await page.setViewportSize({width,height:844});
 for(const route of ['/','/research?scope=research','/#/login']){await page.goto(route);await expect(page.locator('main')).toBeVisible();expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),route).toBe(true);}
});
