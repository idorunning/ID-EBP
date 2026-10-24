// Focused acceptance checks for the read-only research catalogue.
const {chromium}=require('playwright');
const assert=require('node:assert/strict');
const fs=require('node:fs');
(async()=>{
 const browser=await chromium.launch({headless:true,executablePath:process.env.CHROMIUM_EXECUTABLE_PATH||chromium.executablePath(),args:['--no-sandbox','--disable-dev-shm-usage']});
 const page=await browser.newPage({viewport:{width:1440,height:1050}}),errors=[];
 page.on('pageerror',e=>errors.push(e.message));
 const base=process.env.PREVIEW_URL||'http://localhost:4173';fs.mkdirSync('test-results',{recursive:true});
 await page.goto(base+'/research');await page.locator('.research-card').first().waitFor();
 assert.equal(await page.locator('.research-card').count(),25);assert.match(await page.locator('.research-toolbar').innerText(),/16,246/);
 await page.locator('#research-tag').fill('hot');await page.locator('[role=option]').first().waitFor();await page.locator('[role=option]').first().click();assert.equal(await page.locator('[data-remove-tag]').count(),1);await page.locator('[data-remove-tag]').click();
 await page.locator('#research-query').fill('body worn cameras');await page.locator('#research-form button').click();await page.waitForURL('**/research?*');await page.locator('.research-card').first().waitFor();
 assert.equal(await page.locator('#research-query').inputValue(),'body worn cameras');
 assert.equal(await page.locator('.research-card').count(),25);
 const first=await page.locator('.research-card').first().getAttribute('id');
 await page.getByRole('link',{name:'Next',exact:true}).click();await page.locator('.research-card').first().waitFor();assert.match(page.url(),/page=2/);assert.notEqual(await page.locator('.research-card').first().getAttribute('id'),first);
 await page.goto(base+'/research?source=cebcp&query=Evidence-Based%20Policing');await page.locator('.research-card').first().waitFor();await page.locator('.research-card details').first().locator('summary').click();
 assert.match(await page.locator('.research-list').innerText(),/Source listing|shared by/);
 await page.goto(base+'/research?tag=hot%20spots%20policing&tag=systematic%20review');await page.locator('.research-card').first().waitFor();assert.match(await page.locator('.research-terms').first().innerText(),/all must match/);
 await page.screenshot({path:'test-results/research-desktop.png',fullPage:true});
 for(const width of [390,320]){await page.setViewportSize({width,height:844});for(const path of ['/research','/research?query=body+worn+cameras','/','/directory']){await page.goto(base+path);if(path.startsWith('/research'))await page.locator('.research-card').first().waitFor();assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false,`Overflow ${width} ${path}`);}}
 await page.goto(base+'/research?query=body+worn+cameras');await page.locator('.research-card').first().waitFor();await page.screenshot({path:'test-results/research-mobile.png',fullPage:true});
 // Text escaping: a hostile query must stay input text, never become markup.
 await page.goto(base+'/research?query='+encodeURIComponent('<img src=x onerror=alert(1)>'));await page.locator('#research-results[aria-busy=false]').waitFor();assert.equal(await page.locator('.research-page img').count(),0);
 await page.route('**/api/research?*',r=>r.fulfill({status:503,contentType:'application/json',body:JSON.stringify({error:'Catalogue temporarily unavailable.'})}));
 await page.goto(base+'/research?query=policing');await page.locator('[role=alert]').waitFor();assert.match(await page.locator('[role=alert]').innerText(),/temporarily unavailable/);
 assert.deepEqual(errors,[]);await browser.close();console.log('Research browser checks passed: query and tag filters, pagination, access labels, 320/390px layouts, escaped input and outage message.');
})().catch(e=>{console.error(e);process.exit(1);});
