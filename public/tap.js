// Thinking About Policing ownership: links, contact details and shared markup.
export const TAP={
 name:'Thinking About Policing',
 url:'https://thinkingaboutpolicing.org',
 email:'hello@thinkingaboutpolicing.org',
 tagline:'Ideas. Evidence. Practice.',
 links:[
  {label:'Articles',href:'https://thinkingaboutpolicing.org/sitemap'},
  {label:'Research Assistant',href:'https://thinkingaboutpolicing.org/research'},
  {label:'About Thinking About Policing',href:'https://thinkingaboutpolicing.org/about'}
 ],
 social:[
  {id:'linkedin',label:'LinkedIn',href:'https://www.linkedin.com/in/nathan-tracey-3b85a9427'},
  {id:'x',label:'X',href:'https://x.com/ta_policing'},
  {id:'bluesky',label:'Bluesky',href:'https://bsky.app/profile/thinkpolicing.bsky.social'}
 ]
};

const SOCIAL_PATHS={
 linkedin:'<path d="M20.45 20.45h-3.56v-5.57c0-1.33-.03-3.04-1.85-3.04-1.86 0-2.14 1.45-2.14 2.94v5.67H9.35V9h3.41v1.56h.05c.48-.9 1.64-1.85 3.37-1.85 3.6 0 4.27 2.37 4.27 5.46v6.28ZM5.34 7.43a2.06 2.06 0 1 1 0-4.13 2.06 2.06 0 0 1 0 4.13ZM7.12 20.45H3.56V9h3.56v11.45ZM22.22 0H1.77C.79 0 0 .77 0 1.73v20.54C0 23.23.79 24 1.77 24h20.45c.98 0 1.78-.77 1.78-1.73V1.73C24 .77 23.2 0 22.22 0Z"/>',
 x:'<path d="M14.234 10.162 22.977 0h-2.072l-7.591 8.824L7.251 0H.258l9.168 13.343L.258 24H2.33l8.016-9.318L16.749 24h6.993zm-2.837 3.299-.929-1.329L3.076 1.56h3.182l5.965 8.532.929 1.329 7.754 11.09h-3.182z"/>',
 bluesky:'<path d="M5.202 2.857C7.954 4.922 10.913 9.11 12 11.358c1.087-2.247 4.046-6.436 6.798-8.501C20.783 1.366 24 .213 24 3.883c0 .732-.42 6.156-.667 7.037-.856 3.061-3.978 3.842-6.755 3.37 4.854.826 6.089 3.562 3.422 6.299-5.065 5.196-7.28-1.304-7.847-2.97-.104-.305-.152-.448-.153-.327 0-.121-.05.022-.153.327-.568 1.666-2.782 8.166-7.847 2.97-2.667-2.737-1.432-5.473 3.422-6.3-2.777.473-5.899-.308-6.755-3.369C.42 10.04 0 4.615 0 3.883c0-3.67 3.217-2.517 5.202-1.026"/>'
};
const ARROW='<svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 12h14m-6-6 6 6-6 6"/></svg>';
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const ext=href=>href.startsWith('http')?' target="_blank" rel="noopener"':'';

export const tapMark=(size=28,cls='tap-mark')=>`<img class="${cls}" src="/assets/brand/tap-mark.webp" width="${size}" height="${size}" alt="">`;

export function tapSocial(cls='tap-social'){
 return `<ul class="${cls}">${TAP.social.map(s=>`<li><a href="${esc(s.href)}"${ext(s.href)} aria-label="${esc(TAP.name)} on ${esc(s.label)}" title="${esc(s.label)}"><svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">${SOCIAL_PATHS[s.id]}</svg></a></li>`).join('')}</ul>`;
}

// Thin ownership strip that sits above the main header on every page.
export function tapBar(){
 return `<div class="tap-bar"><div class="container tap-bar-inner"><a class="tap-bar-owner" href="/ownership">${tapMark(22)}<span class="tap-bar-long">ID-EBP is owned and run by <strong>${TAP.name}</strong></span><span class="tap-bar-short">A <strong>${TAP.name}</strong> project</span></a><div class="tap-bar-links"><a class="tap-bar-email" href="mailto:${TAP.email}">${TAP.email}</a>${tapSocial()}</div></div></div>`;
}

// Lockup beside the ID-EBP logo in the main header (desktop only).
export function tapHeaderLockup(){
 return `<a class="tap-lockup" href="/ownership" aria-label="ID-EBP is a ${TAP.name} project" title="A ${TAP.name} project">${tapMark(34)}<span><small>A project by</small><strong>${TAP.name}</strong></span></a>`;
}

// Homepage section explaining who owns and runs the directory.
export function tapOwnership(){
 return `<section class="tap-ownership" aria-labelledby="tap-ownership-title"><div class="container tap-ownership-grid"><div class="tap-ownership-copy"><p class="eyebrow">Who runs ID-EBP</p><h2 id="tap-ownership-title">Owned and managed by ${TAP.name}</h2><p>ID-EBP is a free, independent project owned and run by <a href="${TAP.url}"${ext(TAP.url)}>${TAP.name}</a>, which publishes evidence-based writing on policing and public policy. The directory exists to help officers, staff, researchers and policymakers find good evidence quickly.</p><ul class="tap-principles"><li><strong>Free for everyone.</strong> No paywall and no account needed to search.</li><li><strong>Signposting only.</strong> We link to the original publisher and never take credit for anyone’s research.</li><li><strong>Kept accurate by its owners.</strong> Research organisations can claim their listing and keep it up to date.</li></ul><p class="tap-ownership-more"><a href="/ownership">Who owns and runs ID-EBP${ARROW}</a><a href="/legal">Legal and policies${ARROW}</a></p></div><aside class="tap-card"><a class="tap-card-brand" href="${TAP.url}"${ext(TAP.url)}>${tapMark(64)}<span><strong>${TAP.name}</strong><small>${TAP.tagline}</small></span></a><nav class="tap-card-links" aria-label="${TAP.name}">${TAP.links.map(l=>`<a href="${l.href}"${ext(l.href)}>${esc(l.label)}${ARROW}</a>`).join('')}</nav><div class="tap-card-foot"><span>Follow</span>${tapSocial()}</div></aside></div></section>`;
}

// Replaces the plain "Add a source" callout: invites research owners to claim listings.
export function tapClaimCallout(button){
 return `<section class="container source-callout tap-claim"><div><p class="eyebrow">For research owners</p><h2>Own or publish policing research?</h2><p>Claim your listing, correct your details or suggest a new source. Do it online, or email <a href="mailto:${TAP.email}">${TAP.email}</a> and we will set it up for you.</p></div><div class="button-row">${button('Claim or add a source'+ARROW,'/source-workspace')}${button('Email us',`mailto:${TAP.email}`,'button button-outline')}</div></section>`;
}

export function tapFooterOwner(){
 return `<a class="tap-footer-owner" href="${TAP.url}"${ext(TAP.url)}>${tapMark(36)}<span><small>A project by</small><strong>${TAP.name}</strong></span></a>`;
}

export function tapFooterColumn(){
 return `<div class="tap-footer-col"><strong>${TAP.name}</strong><a href="${TAP.url}"${ext(TAP.url)}>thinkingaboutpolicing.org</a>${TAP.links.map(l=>`<a href="${l.href}"${ext(l.href)}>${esc(l.label)}</a>`).join('')}${tapSocial('tap-social tap-social-footer')}</div>`;
}
