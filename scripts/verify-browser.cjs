// Optional browser acceptance checks. Requires Playwright in the execution environment.
const {chromium}=require('playwright');
const assert=require('node:assert/strict');
const fs=require('node:fs');
(async()=>{
 const browser=await chromium.launch({headless:true,...(process.env.CHROMIUM_EXECUTABLE_PATH?{executablePath:process.env.CHROMIUM_EXECUTABLE_PATH}:{}),args:['--no-sandbox','--disable-dev-shm-usage']});
 const page=await browser.newPage({viewport:{width:1440,height:1050}});
 const errors=[];const posts=[];
 page.on('pageerror',e=>errors.push(e.message));
 page.on('request',r=>{if(r.method()!=='GET')posts.push(r.url());});
 const base=process.env.PREVIEW_URL||'http://localhost:4173';
 fs.mkdirSync('test-results',{recursive:true});
 await page.goto(base);await page.evaluate(()=>document.fonts.ready);await page.screenshot({path:'test-results/home-desktop.png',fullPage:true});
 await page.locator('#search-query').fill('hot spots');await page.locator('#search-form button').click();
 await page.waitForURL('**/directory?*');
 assert((await page.locator('.source-row').count())>0);
 await page.goto(base+'/#/directory?type=EBP%20society&based=Canada&language=English');
 assert.equal(await page.locator('.source-row').count(),1);
 assert.match(await page.locator('.source-row h3').innerText(),/Canadian/);
 await page.selectOption('#language','fr');
 assert.equal(await page.locator('html').getAttribute('lang'),'fr');
 assert.equal(await page.locator('.source-row').count(),1);
 await page.selectOption('#language','en');
 await page.locator('.save-action').click();await page.goto(base+'/#/saved');
 assert.equal(await page.locator('.source-row').count(),1);
 await page.reload();assert.equal(await page.locator('.source-row').count(),1);
 await page.goto(base+'/#/register');
 await page.locator('[name=name]').fill('Example EBP society');
 await page.locator('[name=url]').fill('https://example.org');
 await page.locator('[name=email]').fill('preview@example.org');
 await page.locator('[name=about]').fill('A local test of multilingual society registration.');
 await page.selectOption('[name=country]','United Kingdom');
 await page.locator('#registration-form button[type=submit]').click();
 await page.locator('input[name=types][value="EBP society"]').check();
 await page.locator('input[name=content][value="Learning resources"]').check();
 await page.locator('input[name=languages][value="English"]').check();
 await page.locator('input[name=languages][value="French"]').check();
 await page.selectOption('[name=coverage]',['United Kingdom','International']);
 await page.locator('#registration-form button[type=submit]').click();
 await page.locator('#registration-form button[type=submit]').click();
 assert.match(await page.locator('.review-card').innerText(),/English, French/);
 await page.locator('[name=accuracy]').check();await page.locator('#registration-form button[type=submit]').click();
 await page.locator('a[href="#/draft-profile"]').click();
 assert.match(await page.locator('.profile-facts').innerText(),/English, French/);
 await page.goto(base+'/#/admin-preview');
 await page.locator('[data-tab=societies]').click();
 assert.equal(await page.locator('.admin-table tbody tr').count(),5);
 await page.locator('.edit-source').first().click();await page.locator('#edit-form [name=name]').fill('Edited society preview');await page.locator('#edit-form button[type=submit]').click();
 assert.match(await page.locator('.admin-table').innerText(),/Edited society preview/);
 await page.reload();await page.locator('[data-tab=societies]').click();
 assert(!/Edited society preview/.test(await page.locator('.admin-table').innerText()));
 for(const width of [390,320]){
  await page.setViewportSize({width,height:844});
  for(const route of ['','/directory','/source/sebp','/register','/admin-preview','/design']){
   await page.goto(base+'/#'+route);
   assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false,`Overflow: ${width} ${route}`);
  }
 }
 await page.setViewportSize({width:390,height:844});await page.goto(base);await page.evaluate(()=>document.fonts.ready);await page.screenshot({path:'test-results/home-mobile.png',fullPage:true});
 await page.goto(base+'/#/directory?type=EBP%20society');await page.screenshot({path:'test-results/societies-mobile.png',fullPage:true});
 assert.deepEqual(errors,[]);assert.deepEqual(posts,[]);
 console.log('Browser checks passed: society/country/language filtering, translation, saved collection, multilingual registration, admin isolation, 320/390px layouts, no account submissions.');
 await browser.close();
})().catch(e=>{console.error(e);process.exit(1);});
