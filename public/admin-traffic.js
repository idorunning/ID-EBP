// Admin-only presentation. Values are rendered only after the authenticated admin API responds.
const html = value => String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const integer = value => value!==null && value!==undefined && Number.isFinite(Number(value)) ? new Intl.NumberFormat('en-GB',{maximumFractionDigits:0}).format(Number(value)) : '—';
const date = value => {const d=new Date(value);return Number.isNaN(d.getTime())?'—':new Intl.DateTimeFormat('en-GB',{dateStyle:'medium',timeStyle:'short',timeZone:'UTC'}).format(d)+' UTC';};
const isLive = value => value?.status==='connected';
function status(value) {
 if(value?.status==='connected')return '<span class="traffic-state traffic-state-ok">Connected</span>';
 if(value?.status==='snapshot')return '<span class="traffic-state">Saved snapshot</span>';
 if(value?.status==='unavailable')return '<span class="traffic-state traffic-state-error">Connection unavailable</span>';
 return '<span class="traffic-state">Not connected</span>';
}
function metric(label,value,description) {
 return '<article class="traffic-metric"><span>'+html(label)+'</span><strong>'+html(value)+'</strong><p>'+html(description)+'</p></article>';
}
function external(label,url) {return '<a class="traffic-external" href="'+html(url)+'" target="_blank" rel="noopener noreferrer">'+html(label)+' ↗</a>';}
function details(title,provider,body,link) {
 return '<article class="traffic-provider"><div class="traffic-provider-head"><h3>'+html(title)+'</h3>'+status(provider)+'</div>'+body+(provider?.retrievedAt?'<p class="traffic-meta">Retrieved '+date(provider.retrievedAt)+'</p>':'')+(provider?.status!=='connected'&&provider?.status!=='snapshot'?'<p class="traffic-setup">'+html(provider?.help||'Link this service to start reporting.')+'</p>':'')+(link||'')+'</article>';
}
function trend(rows,title) {
 const list=(Array.isArray(rows)?rows:[]).filter(row=>/^\d{4}-\d{2}-\d{2}$/.test(row.date||'')&&Number.isFinite(Number(row.value))).slice(-90);
 if(!list.length)return '<div class="traffic-no-chart">No daily series available for this service.</div>';
 const high=Math.max(1,...list.map(row=>Number(row.value)));
 const x=index=>28+index*544/Math.max(1,list.length-1);
 const y=value=>140-numberValue(value)*112/high;
 const points=list.map((row,index)=>[x(index),y(row.value)]);
 const path=points.map((point,index)=>(index?'L':'M')+point[0].toFixed(2)+' '+point[1].toFixed(2)).join(' ');
 const first=list[0].date,last=list[list.length-1].date,total=list.reduce((sum,row)=>sum+Number(row.value),0);
 return '<figure class="traffic-chart"><svg viewBox="0 0 600 167" role="img" aria-label="'+html(title+': '+integer(total)+' in daily results from '+first+' to '+last)+'"><line x1="28" x2="572" y1="140" y2="140" stroke="currentColor" stroke-opacity=".18"/><line x1="28" x2="572" y1="84" y2="84" stroke="currentColor" stroke-opacity=".10"/><line x1="28" x2="572" y1="28" y2="28" stroke="currentColor" stroke-opacity=".10"/><path d="'+path+'" fill="none" stroke="var(--traffic-accent,#8c293e)" stroke-width="3" stroke-linejoin="round" stroke-linecap="round"/>'+points.map(p=>'<circle cx="'+p[0].toFixed(2)+'" cy="'+p[1].toFixed(2)+'" r="2.7" fill="var(--traffic-accent,#8c293e)"/>').join('')+'</svg><figcaption>'+html(first)+' <span>to</span> '+html(last)+' · '+html(integer(list.length))+' reported days</figcaption></figure>';
}
function numberValue(value){return Math.max(0,Number(value)||0);}
function listRows(rows,label,value) {
 if(!Array.isArray(rows)||!rows.length)return '<p class="traffic-empty">No results available for this period.</p>';
 return '<ol class="traffic-top-list">'+rows.slice(0,10).map(row=>'<li><span title="'+html(row[label])+'">'+html(row[label]||'Unknown')+'</span><strong>'+integer(row[value])+'</strong></li>').join('')+'</ol>';
}
const cloudflareLink='https://dash.cloudflare.com/50b17fc7d1884367a1b2df1c400f8cf2/web-analytics/overview?siteTag=82c11ee74be04ada92d26a698609f874';
const gscLink='https://search.google.com/search-console?resource_id=sc-domain%3Aid-ebp.org';

function verificationFunnel(funnel) {
 const live=funnel?.status==='connected',totals=funnel?.totals||{};
 const num=key=>live?integer(Number(totals[key])||0):'—';
 const actual=key=>live?integer(funnel[key]):'—';
 const failures=['auth_request_failed','claim_request_failed','signin_verify_failed','claim_submit_failed'];
 const totalFailures=live?integer(failures.reduce((n,key)=>n+Number(totals[key]||0),0)):'—';
 const dateRange=live?html(funnel.startDate)+' to '+html(funnel.endDate)+' (including today)':'Not yet connected';
 return '<section class="traffic-funnel" aria-labelledby="verification-funnel-title">'
  +'<div class="traffic-heading"><div><p class="eyebrow">Source ownership</p><h3 id="verification-funnel-title">Registration and verification funnel</h3>'
  +'<p>Aggregate activity through the new source-verification design. No email addresses, codes or visitor identifiers are stored in these metrics.</p>'
  +'</div>'+status(funnel)+'</div>'
  +'<p class="traffic-period">Funnel period: <strong>'+dateRange+'</strong> · UTC. Tracking starts from deployment; historical visits cannot be recovered.</p>'
  +'<div class="traffic-metrics">'
  +metric('Verify-source link clicks',num('verify_click'),'Clicks, not unique people')
  +metric('Source-claim page views',num('claim_view'),'Includes opening the verification workspace')
  +metric('Registration page views',num('register_view'),'Page entries, not unique visitors')
  +metric('Registration codes issued',num('register_code_issued'),'Code generated, not confirmed delivered')
  +metric('Source-claim codes issued',num('claim_code_issued'),'Code generated, not confirmed delivered')
  +metric('Member emails accepted',num('auth_mail_accepted'),'Cloudflare accepted the sign-in/registration send')
  +metric('Source emails accepted',num('claim_mail_accepted'),'Cloudflare accepted the source-claim send')
  +metric('Email provider failures',live?integer(Number(totals.auth_mail_failed||0)+Number(totals.claim_mail_failed||0)):'—','Cloudflare send errors; not inbox bounces')
  +metric('Email codes verified',num('signin_code_verified'),'Includes returning members signing in')
  +metric('New member accounts',actual('newAccounts'),'Supabase account records created in this period')
  +metric('Claims submitted',actual('claimsSubmitted'),'Recorded claims; code verification is required')
  +metric('Claims approved',actual('claimsApproved'),'Administrator decisions during this period')
  +metric('Claims awaiting review',actual('claimsPending'),'Current queue, independent of selected period')
  +metric('Failed verification steps',totalFailures,'Requests and claim attempts rejected by the application')
  +'</div>'
  +'<div class="traffic-report-grid">'
  +'<article class="traffic-report"><h4>Verification interest</h4>'
  +trend(live?(funnel.daily||[]).filter(v=>v.event==='verify_click').map(v=>({date:v.date,value:v.count})):[],'Verify-source link clicks per day')
  +'<p class="traffic-meta">These are event totals, not unique journeys. They must not be used as a conversion rate for individuals.</p></article>'
  +'<article class="traffic-report"><h4>Where failures occur</h4>'
  +'<ol class="traffic-top-list">'
  +[['Email code requests','auth_request_failed'],['Claim code requests','claim_request_failed'],['Email code checks','signin_verify_failed'],['Claim submissions','claim_submit_failed']]
    .map(([label,key])=>'<li><span>'+html(label)+'</span><strong>'+num(key)+'</strong></li>').join('')
  +'</ol><p class="traffic-meta">The backend tracks rejected requests. Email-provider errors after code generation may not be represented here.</p></article>'
  +'</div></section>';
}

export function renderAdminTraffic(data,{days=28}={}) {
 const period=data?.range||{},cf=data?.cloudflare||{},goat=data?.goatcounter||{},ga=data?.google?.ga4||{},gsc=data?.google?.searchConsole||{};
 const has=data&&data.authorised===true;
 const rangeText=period.startDate&&period.endDate?period.startDate+' to '+period.endDate:'The last '+days+' complete UTC days';
 const control='<label class="traffic-range-label">Reporting period <select data-traffic-range aria-label="Reporting period">'+[7,28,90].map(n=>'<option value="'+n+'" '+(Number(days)===n?'selected':'')+'>'+n+' days</option>').join('')+'</select></label>';
 return '<section class="traffic-dashboard" aria-label="Website analytics"><header class="traffic-heading"><div><p class="eyebrow">Website reporting</p><h2>Traffic and search</h2><p>Private reports for ID-EBP. Each platform counts activity differently; the figures should not be added together.</p></div>'+control+'</header>'
  +'<p class="traffic-period">Selected period: <strong>'+html(rangeText)+'</strong> · UTC, excluding today</p>'
  +(!has?'<div class="traffic-loading" role="status">Loading administrator traffic reports…</div>':'')
  +'<div class="traffic-metrics">'
  +metric('Cloudflare browser visits',cf.visits===undefined?'—':integer(cf.visits),'Saved Cloudflare report'+(cf.days?' · '+integer(cf.days)+' days':'')+', not necessarily this selected period')
  +metric('GoatCounter page hits',isLive(goat)?integer(goat.pageHits):'—',isLive(goat)?days+' complete days':'Not connected')
  +metric('GA4 sessions',isLive(ga)?integer(ga.sessions):'—',isLive(ga)?days+' complete days':'Not connected')
  +metric('Google search clicks',isLive(gsc)?integer(gsc.clicks):'—',isLive(gsc)?days+' complete days':'Not connected')
  +'</div>'
  +'<div class="traffic-report-grid">'
   +'<article class="traffic-report"><div class="traffic-report-head"><div><p class="eyebrow">GoatCounter</p><h3>Website page hits</h3></div>'+status(goat)+'</div>'+trend(isLive(goat)?goat.daily:[],'GoatCounter daily recorded activity')+'<h4>Popular pages</h4>'+listRows(isLive(goat)?goat.topPages:[],'path','count')+'</article>'
   +'<article class="traffic-report"><div class="traffic-report-head"><div><p class="eyebrow">Google Analytics 4</p><h3>Website sessions</h3></div>'+status(ga)+'</div>'+trend(isLive(ga)?ga.daily:[],'Google Analytics daily sessions')+'<div class="traffic-detail-metrics"><span>Users (GA4 estimate) <b>'+(isLive(ga)?integer(ga.users):'—')+'</b></span><span>Page views <b>'+(isLive(ga)?integer(ga.pageViews):'—')+'</b></span><span>Engaged sessions <b>'+(isLive(ga)?integer(ga.engagedSessions):'—')+'</b></span></div></article>'
   +'<article class="traffic-report traffic-report-wide"><div class="traffic-report-head"><div><p class="eyebrow">Google Search Console</p><h3>Search visibility</h3></div>'+status(gsc)+'</div><div class="traffic-search-layout"><div>'+trend(isLive(gsc)?gsc.daily:[],'Daily Google search clicks')+'<div class="traffic-detail-metrics"><span>Impressions <b>'+(isLive(gsc)?integer(gsc.impressions):'—')+'</b></span><span>Click-through rate <b>'+(isLive(gsc)&&gsc.ctr!==null?(gsc.ctr*100).toFixed(1)+'%':'—')+'</b></span><span>Average position <b>'+(isLive(gsc)&&gsc.position!==null?Number(gsc.position).toFixed(1):'—')+'</b></span></div></div><div><h4>Top search queries</h4>'+listRows(isLive(gsc)?gsc.topQueries:[],'query','clicks')+'</div></div></article>'
  +'</div>'
  +verificationFunnel(data?.funnel)
  +'<h3 class="traffic-sources-title">Reporting connections</h3><div class="traffic-providers">'
   +details('Cloudflare Web Analytics',cf,'<p>Browser traffic is already being collected. '+(cf.retrievedAt?'The figures above are a saved snapshot, not a live query.':'Open the report for current figures.')+'</p>',external('Open Cloudflare report',cloudflareLink))
   +details('GoatCounter',goat,'<p>Privacy-focused page-hit tracking. This requires the GoatCounter site tracking code as well as an API token for reporting.</p>',isLive(goat)&&goat.dashboardUrl?external('Open GoatCounter',goat.dashboardUrl):external('GoatCounter setup','https://www.goatcounter.com/'))
   +details('Google Analytics 4',ga,'<p>Sessions, estimated users, engagement and page views. Link the correct ID-EBP GA4 property.</p>',external('Open Google Analytics','https://analytics.google.com/'))
   +details('Google Search Console',gsc,'<p>Search impressions, clicks and queries. A verified ID-EBP property is required.</p>',external('Open Search Console',gscLink))
  +'</div><p class="traffic-disclaimer">These figures are aggregate measurements, not identified individuals. Cloudflare snapshots may have a different date range; GA4, Search Console and GoatCounter may differ because they use different collection methods. Empty data are never shown as zero.</p></section>';
}
