import test from 'node:test';
import assert from 'node:assert/strict';
import {SOURCES} from '../public/data.js';
import worker from '../dist/worker.mjs';
import {summaryLabel,validPublicEmail,contactMarkup,portraitMarkup,linkAuditMarkup,correctionNotice} from '../public/source-details.js';

test('public contacts are links with evidence, without accepting injected email or social schemes',()=>{
 const s={url:'https://university.example/research',contactEmail:'department@university.example',contactName:'Research department',contactPage:'https://university.example/contact',social:['https://www.linkedin.com/company/example','https://www.linkedin.com/company/example','javascript:alert(1)'],contactEvidence:[{url:'https://university.example/contact',detail:'Published departmental address'}]};
 const html=contactMarkup(s);
 assert.match(html,/href="mailto:department@university.example"/);
 assert.match(html,/Published contact details/);
 assert.equal((html.match(/>LinkedIn</g)||[]).length,1);
 assert(!html.includes('javascript:'));
 for(const value of ['person@example.org\r\nBcc:other@example.org','x@example.org?subject=test','bad<@example.org',null])assert.equal(validPublicEmail(value),null);
 assert(!contactMarkup({...s,contactName:'<script>alert(1)</script>'}).includes('<script>'));
});
test('portraits require a local image and a safe attribution page',()=>{
 assert.equal(portraitMarkup({portrait:{path:'https://example.org/avatar.jpg',sourceUrl:'https://example.org/bio'}}),'');
 const html=portraitMarkup({portrait:{path:'/assets/people/researcher.webp',sourceUrl:'https://example.org/bio',alt:'Researcher portrait',credit:'University biography'}});
 assert.match(html,/src="\/assets\/people\/researcher.webp"/);
 assert.match(html,/>University biography</);
});
test('restricted checks and generated/source-provided summaries have distinct labels',()=>{
 assert.match(summaryLabel({provenance:'Editor-added'}),/Auto-generated summary/);
 assert.match(summaryLabel({provenance:'Source-declared'}),/Source-provided summary/);
 const html=linkAuditMarkup({linkAudit:{status:'restricted',checkedAt:'2026-10-15',httpStatus:403,note:'Automated access blocked.'}});
 assert.match(html,/Automated access restricted/);
 assert.match(html,/2026-10-15/);
 assert(!html.includes('Website checked'));
 assert.match(correctionNotice(),/If details are incorrect or you wish to be removed, email/);
 assert.match(correctionNotice(),/href="mailto:contact@id-ebp.org"/);
});
test('every catalogue entry has a dated audit, a summary and evidenced public contact metadata',()=>{
 for(const source of SOURCES){
  assert(source.about?.trim().length>=40,source.id+' summary');
  assert.equal(source.summaryGenerated,true,source.id+' label');
  assert.match(source.linkAudit?.checkedAt||'',/^2026-10-15/,source.id+' audit date');
  assert(['working','redirected','restricted','unreachable','not-found'].includes(source.linkAudit.status),source.id+' status');
  if(source.contactEmail){assert(validPublicEmail(source.contactEmail),source.id+' email');assert(source.contactEvidence?.length,source.id+' contact evidence');}
 }
 assert.equal(new Set(SOURCES.map(source=>source.id)).size,SOURCES.length);
 assert.equal(new Set(SOURCES.map(source=>source.url)).size,SOURCES.length);
});
test('every attributed portrait is packaged as a working first-party image',async()=>{
 for(const source of SOURCES.filter(source=>source.portrait)){
  const response=await worker.fetch(new Request('https://example.org'+source.portrait.path));
  assert.equal(response.status,200,source.id);
  assert.equal(response.headers.get('content-type'),'image/webp',source.id);
  assert.equal(new TextDecoder().decode((await response.arrayBuffer()).slice(0,4)),'RIFF',source.id);
 }
});
