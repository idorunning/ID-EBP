import {accountApi,getMemberSession} from './members.js';
const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const field=(label,name,attributes='')=>`<label class="member-field"><span>${label}</span><input name="${name}" ${attributes}></label>`;
export function submissionPage(admin=false){
 if(admin)return `<section class="container prose-page research-submit"><p class="eyebrow">ID-EBP EDITORIAL</p><h1>Review submitted research</h1><p>Only approved entries become searchable. Check the original publication, authors, DOI, link and possible duplicates before approval.</p><div id="submission-notice" role="status"></div><div id="submission-review-list">Loading submissions…</div></section>`;
 return `<section class="container prose-page research-submit"><p class="eyebrow">CONTRIBUTE TO ID-EBP</p><h1>Submit individual research</h1><p class="body-large">Researchers, students and policing practitioners can suggest a study, evaluation, report or evidence review for the international catalogue.</p><p>Already represent a collection or institution? <a href="/source-workspace">Add or claim a source</a> instead.</p><div id="submission-notice" role="status" aria-live="polite"></div>
 <form id="research-submit-form" class="member-panel">
 <h2>Research details</h2>
 ${field('DOI (optional)','doi','maxlength="250" placeholder="10.1234/example"')}
 <p class="member-hint">A DOI can automatically fill in publication details. Check them before submitting.</p>
 <button class="button button-outline" type="button" id="research-doi-lookup">Fill from DOI</button>
 ${field('Research title','title','required minlength="5" maxlength="300"')}
 ${field('Authors','authors','required minlength="2" maxlength="1000" placeholder="Names as published"')}
 <div class="member-form-grid">
 ${field('Publication year','year','type="number" min="1600" max="2100" step="1"')}
 ${field('Institution or publisher','sourceName','maxlength="200"')}
 </div>
 ${field('Link to the research','url','type="url" required pattern="https://.+" maxlength="2048" placeholder="https://"')}
 <label class="member-field"><span>Abstract or short description</span><textarea name="summary" maxlength="3000" rows="5"></textarea></label>
 ${field('Policing topics (comma-separated)','tags','maxlength="1000" placeholder="domestic abuse, crime prevention"')}
 <p class="member-hint">Only link to the original research or an authorised public copy. Your submission will be reviewed before publication.</p>
 <button class="button" type="submit">Submit research for review</button>
 </form><div id="research-my-submissions"></div></section>`;
}
export function bindSubmissionPage({admin=false}={}){
 const notice=document.getElementById('submission-notice');if(!notice)return;
 let busy=false;
 const message=(text,error=false)=>{notice.textContent=text;notice.className=error?'member-error':'member-success';};
 if(admin){
   const list=document.getElementById('submission-review-list');
   const load=async()=>{try{
     const data=await accountApi('/admin/research-submissions');const items=data.submissions||[];
     list.innerHTML=items.length?items.map(item=>`<article class="member-panel" data-submission="${esc(item.id)}"><h2>${esc(item.title)}</h2><p>${esc(item.authors)} · ${esc(item.publication_year||'Year unknown')}</p><p>${esc(item.source_name)}</p><p>${esc(item.summary)}</p><p>DOI: ${esc(item.doi||'Not supplied')}</p><p><a href="${esc(item.url)}" target="_blank" rel="noopener noreferrer">View original research</a></p><p>Tags: ${esc((item.tags||[]).join(', '))}</p><button class="button" data-decision="approved">Approve and publish</button> <button class="button button-outline" data-decision="rejected">Reject</button></article>`).join(''):'<p>No submissions awaiting review.</p>';
   }catch(e){list.textContent=e.status===403?'Administrator access is required.':'The review queue could not be loaded.';}};
   list.addEventListener('click',async e=>{const button=e.target.closest('[data-decision]');if(!button||busy)return;const item=button.closest('[data-submission]');if(!item)return;busy=true;button.disabled=true;
     try{await accountApi('/admin/research-submissions',{method:'POST',body:{id:item.dataset.submission,decision:button.dataset.decision}});message('Review recorded.');await load();}
     catch(err){message(err.code==='already_submitted'?'This submission has already been reviewed or matches an existing catalogue record.':'Could not complete the review. Check its status before trying again.',true);}
     finally{busy=false;button.disabled=false;}
   });load();return;
 }
 const form=document.getElementById('research-submit-form');
 const session=getMemberSession();if(!session.user){message('Sign in with a confirmed email to submit research. Your details can be entered before signing in.',true);}
 const lookup=document.getElementById('research-doi-lookup');
 lookup.addEventListener('click',async()=>{const raw=form.elements.doi.value.trim().replace(/^https?:\/\/(?:dx\.)?doi\.org\//i,'');if(!/^10\.\d{4,9}\//.test(raw)){message('Enter a valid DOI first.',true);return;}lookup.disabled=true;
   try{const response=await fetch('https://api.crossref.org/works/'+encodeURIComponent(raw),{signal:AbortSignal.timeout(10000)});if(!response.ok)throw Error('lookup');const m=(await response.json()).message;
     if(m.title?.[0])form.elements.title.value=m.title[0].replace(/<[^>]*>/g,'');
     if(m.author?.length)form.elements.authors.value=m.author.map(a=>[a.given,a.family].filter(Boolean).join(' ')).join(', ');
     if(m.published?.['date-parts']?.[0]?.[0])form.elements.year.value=m.published['date-parts'][0][0];
     if(m.publisher)form.elements.sourceName.value=m.publisher;
     if(m.URL)form.elements.url.value=m.URL.replace(/^http:/,'https:');
     message('DOI details retrieved. Please check every field.');
   }catch{message('DOI lookup was unavailable. Enter the details manually.',true);}finally{lookup.disabled=false;}
 });
 const mine=document.getElementById('research-my-submissions');
 const loadMine=async()=>{if(!getMemberSession().user)return;try{const d=await accountApi('/research/submissions');mine.innerHTML='<h2>Your recent submissions</h2>'+(d.submissions||[]).map(x=>`<p>${esc(x.title)} — <strong>${esc(x.status)}</strong></p>`).join('')||'';}catch{/* Submission form remains available. */}};
 form.addEventListener('submit',async e=>{e.preventDefault();if(busy||!form.reportValidity())return;busy=true;const button=form.querySelector('[type=submit]');button.disabled=true;
   const data=Object.fromEntries(new FormData(form));data.tags=data.tags.split(',').map(v=>v.trim()).filter(Boolean);
   try{await accountApi('/research/submissions',{method:'POST',body:data});form.reset();message('Research submitted for editorial review. It is not yet publicly searchable.');await loadMine();}
   catch(error){message(error.code==='sign_in_required'?'Please sign in before submitting.':error.code==='already_submitted'?'This research appears to have already been submitted.':'The submission could not be confirmed. Check your submissions before retrying.',true);}
   finally{busy=false;button.disabled=false;}
 });loadMine();
}
