import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {renderMemberPage} from '../public/members.js';
import {COPY} from '../public/i18n.js';

const page=(lang='en',query='add=1')=>renderMemberPage({path:'/source-workspace',params:new URLSearchParams(query),lang,sources:[]});
test('new institute route opens its form first, without duplicating it',()=>{
 const html=page();
 assert.match(html,/id="add-new-source"[^>]*open/);
 assert.equal((html.match(/id="add-new-source"/g)||[]).length,1);
 assert.ok(html.indexOf('id="add-new-source"')<html.indexOf('Managed sources'));
 assert.match(html,/href="\/register\?next=add-source"/);
 assert.doesNotMatch(html,/\$\{esc\(tr\(lang,'sourceRegistrationHelp'\)\)\}/);
});
test('registration route is translated into all three supported interface languages',()=>{
 for(const lang of ['en','fr','es']){
  const html=page(lang);
  assert.ok(html.includes(COPY[lang].sourceRegistrationHelp));
  assert.ok(html.includes(COPY[lang].sourceRegistrationLink));
  assert.ok(html.includes('href="/register?next=add-source"'));
 }
});
test('existing homepage collections, flags and original research/practice/source icon names remain',()=>{
 const script=readFileSync(new URL('../public/app.js',import.meta.url),'utf8');
 for(const part of ["icon('research')","icon('shield')","icon('people')","homeCategories.map(c=>sourceCollection(c,visible))",'class="country-band"',"tapClaimCallout(button)"])
  assert.ok(script.includes(part),part+' must remain in the homepage');
 assert.ok(script.includes('sourceOwnerTitle')&&script.includes('sourceVerifyListing'));
});
test('mobile verify action is not hidden under inherited narrow-screen header styles',()=>{
 const css=readFileSync(new URL('../public/home.css',import.meta.url),'utf8');
 assert.match(css,/\.header-actions \.source-register-button\{display:inline-flex!important;/);
});
