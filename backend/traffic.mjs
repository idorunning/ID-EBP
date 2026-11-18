// Read-only, administrator-scoped website traffic integrations.
// All credentials are server-side Supabase Edge Function environment secrets.
// Do not send OAuth tokens, API keys, raw provider errors or credential configuration to clients.
const DAY = 86400000;
const CONFIG = 'setup_required';
const missing = (help) => ({status:CONFIG,help});
const failed = (help) => ({status:'unavailable',help:'Reporting is temporarily unavailable. '+help});
const number = (value) => Number.isFinite(Number(value)) ? Math.max(0,Number(value)) : 0;

export function trafficWindow(days=28,now=new Date()) {
 const count=[7,28,90].includes(Number(days))?Number(days):28;
 const midnight=new Date(now);midnight.setUTCHours(0,0,0,0);
 const start=new Date(midnight.getTime()-count*DAY);
 const last=new Date(midnight.getTime()-DAY);
 return {days:count,startDate:start.toISOString().slice(0,10),endDate:last.toISOString().slice(0,10),startISO:start.toISOString(),endISO:midnight.toISOString()};
}

async function jsonRequest(fetcher,url,{method='GET',token,body}={}) {
 const response=await fetcher(url,{
  method,headers:{Accept:'application/json',...(token?{Authorization:'Bearer '+token}:{}),...(body?{'Content-Type':'application/json'}:{})},
  ...(body?{body:JSON.stringify(body)}:{}),signal:AbortSignal.timeout(9000)
 });
 if(!response.ok)throw Error('Provider unavailable');
 const json=await response.json();
 if(!json || typeof json!=='object' || Array.isArray(json))throw Error('Unexpected provider response');
 return json;
}
function rowsOf(data,key){return Array.isArray(data?.[key])?data[key]:[];}
function dailySeries(data){return rowsOf(data,'stats').map(row=>({date:String(row.day||''),value:number(row.daily)})).filter(row=>/^\d{4}-\d{2}-\d{2}$/.test(row.date)).sort((a,b)=>a.date.localeCompare(b.date));}

export async function goatCounterReport(env,window,{fetcher=fetch}={}) {
 const code=String(env.GOATCOUNTER_SITE||'').trim().toLowerCase();
 const token=String(env.GOATCOUNTER_API_TOKEN||'').trim();
 if(!code||!token)return missing('Set GOATCOUNTER_SITE and GOATCOUNTER_API_TOKEN in Supabase Edge Function secrets. Ensure the website tracking code is installed.');
 if(!/^[a-z0-9][a-z0-9-]{0,62}$/.test(code))return failed('Check the GoatCounter site code.');
 const origin='https://'+code+'.goatcounter.com';
 const params=new URLSearchParams({start:window.startISO,end:window.endISO});
 try {
  const [total,paths]=await Promise.all([
   jsonRequest(fetcher,origin+'/api/v0/stats/total?'+params,{token}),
   jsonRequest(fetcher,origin+'/api/v0/stats/hits?'+params+'&limit=10&group=day',{token})
  ]);
  if(!Number.isFinite(Number(total.total)))throw Error('Missing count');
  return {status:'connected',retrievedAt:new Date().toISOString(),days:window.days,
   pageHits:Math.max(0,number(total.total)-number(total.total_events)),events:number(total.total_events),
   daily:dailySeries(total),topPages:rowsOf(paths,'hits').slice(0,10).map(row=>({path:String(row.path||'/'),count:number(row.count)})),
   dashboardUrl:origin};
 }catch{return failed('Check the GoatCounter API token, site code and reporting permission.');}
}
const enc = (bytes) => btoa(String.fromCharCode(...bytes)).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'');
const textEnc = new TextEncoder();
async function serviceToken(raw,fetcher) {
 let credential;
 try{credential=JSON.parse(raw);}catch{throw Error('Credential JSON invalid');}
 if(!credential||typeof credential.client_email!=='string'||typeof credential.private_key!=='string'||!credential.client_email.endsWith('.gserviceaccount.com'))throw Error('Invalid credential');
 const keyBytes=Uint8Array.from(atob(credential.private_key.replace(/-----BEGIN PRIVATE KEY-----|-----END PRIVATE KEY-----|\s/g,'')),c=>c.charCodeAt(0));
 const key=await crypto.subtle.importKey('pkcs8',keyBytes,{name:'RSASSA-PKCS1-v1_5',hash:'SHA-256'},false,['sign']);
 const now=Math.floor(Date.now()/1000);
 const header=enc(textEnc.encode(JSON.stringify({alg:'RS256',typ:'JWT'})));
 const payload=enc(textEnc.encode(JSON.stringify({iss:credential.client_email,scope:'https://www.googleapis.com/auth/webmasters.readonly https://www.googleapis.com/auth/analytics.readonly',aud:'https://oauth2.googleapis.com/token',iat:now,exp:now+1200})));
 const unsigned=header+'.'+payload;
 const signature=enc(new Uint8Array(await crypto.subtle.sign('RSASSA-PKCS1-v1_5',key,textEnc.encode(unsigned))));
 const response=await fetcher('https://oauth2.googleapis.com/token',{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams({grant_type:'urn:ietf:params:oauth:grant-type:jwt-bearer',assertion:unsigned+'.'+signature}).toString(),signal:AbortSignal.timeout(9000)});
 if(!response.ok)throw Error('Google token unavailable');
 const data=await response.json();
 if(typeof data.access_token!=='string'||!data.access_token)throw Error('Google token missing');
 return data.access_token;
}
function gaDailyRows(data) {
 return rowsOf(data,'rows').map(row=>({date:String(row.dimensionValues?.[0]?.value||'').replace(/^(\d{4})(\d{2})(\d{2})$/,'$1-$2-$3'),value:number(row.metricValues?.[0]?.value)})).filter(row=>/^\d{4}-\d{2}-\d{2}$/.test(row.date)).sort((a,b)=>a.date.localeCompare(b.date));
}
async function ga4Report(env,window,token,fetcher) {
 const id=String(env.GOOGLE_GA4_PROPERTY_ID||'').trim();
 if(!id)return missing('Set GOOGLE_GA4_PROPERTY_ID and grant the service account Viewer access in GA4.');
 if(!/^\d{4,20}$/.test(id))return failed('Check the GA4 property ID.');
 try{
  const report=await jsonRequest(fetcher,'https://analyticsdata.googleapis.com/v1beta/properties/'+id+':runReport',{
   method:'POST',token,body:{dateRanges:[{startDate:window.startDate,endDate:window.endDate}],dimensions:[{name:'date'}],
   metrics:[{name:'sessions'},{name:'totalUsers'},{name:'engagedSessions'},{name:'screenPageViews'}],metricAggregations:['TOTAL'],limit:100}
  });
  const metric=report.totals?.[0]?.metricValues||[];
  const rows=rowsOf(report,'rows');
  const sum=index=>rows.reduce((acc,row)=>acc+number(row.metricValues?.[index]?.value),0);
  return {status:'connected',retrievedAt:new Date().toISOString(),days:window.days,
   sessions:metric[0]?number(metric[0].value):sum(0),
   users:metric[1]?number(metric[1].value):null,
   engagedSessions:metric[2]?number(metric[2].value):sum(2),
   pageViews:metric[3]?number(metric[3].value):sum(3),daily:gaDailyRows(report)};
 }catch{return failed('Check GA4 access for the service account and property ID.');}
}
async function searchConsoleReport(env,window,token,fetcher) {
 const site=String(env.GOOGLE_SEARCH_CONSOLE_SITE_URL||'').trim();
 if(!site)return missing('Set GOOGLE_SEARCH_CONSOLE_SITE_URL, verify the property and grant the service account access.');
 if(!(site==='sc-domain:id-ebp.org'||site==='https://id-ebp.org/'||site==='https://www.id-ebp.org/'))return failed('Select the verified ID-EBP Search Console property.');
 try{
  const url='https://www.googleapis.com/webmasters/v3/sites/'+encodeURIComponent(site)+'/searchAnalytics/query';
  const dates={startDate:window.startDate,endDate:window.endDate};
  const [byDay,byQuery]=await Promise.all([
   jsonRequest(fetcher,url,{method:'POST',token,body:{...dates,dimensions:['date'],rowLimit:100}}),
   jsonRequest(fetcher,url,{method:'POST',token,body:{...dates,dimensions:['query'],rowLimit:10}})
  ]);
  const daily=rowsOf(byDay,'rows').map(row=>({date:String(row.keys?.[0]||''),value:number(row.clicks),impressions:number(row.impressions),position:number(row.position)})).filter(row=>/^\d{4}-\d{2}-\d{2}$/.test(row.date)).sort((a,b)=>a.date.localeCompare(b.date));
  const clicks=daily.reduce((n,row)=>n+row.value,0),impressions=daily.reduce((n,row)=>n+row.impressions,0);
  return {status:'connected',retrievedAt:new Date().toISOString(),days:window.days,clicks,impressions,
   ctr:impressions?clicks/impressions:null,
   position:impressions?daily.reduce((n,row)=>n+row.position*row.impressions,0)/impressions:null,
   daily:daily.map(({date,value})=>({date,value})),
   topQueries:rowsOf(byQuery,'rows').slice(0,10).map(row=>({query:String(row.keys?.[0]||''),clicks:number(row.clicks),impressions:number(row.impressions)}))};
 }catch{return failed('Check the verified Search Console property and service-account permissions.');}
}
export async function googleTrafficReports(env,window,{fetcher=fetch}={}) {
 const gaConfigured=Boolean(env.GOOGLE_GA4_PROPERTY_ID),gscConfigured=Boolean(env.GOOGLE_SEARCH_CONSOLE_SITE_URL);
 if(!gaConfigured&&!gscConfigured)return {ga4:missing('Set GOOGLE_GA4_PROPERTY_ID.'),searchConsole:missing('Set GOOGLE_SEARCH_CONSOLE_SITE_URL.')};
 if(!env.GOOGLE_SERVICE_ACCOUNT_JSON)return {
  ga4:missing('Set GOOGLE_SERVICE_ACCOUNT_JSON and grant the service account access to GA4.'),
  searchConsole:missing('Set GOOGLE_SERVICE_ACCOUNT_JSON and grant the service account access to Search Console.')
 };
 let token;
 try{token=await serviceToken(env.GOOGLE_SERVICE_ACCOUNT_JSON,fetcher);}
 catch{return {ga4:gaConfigured?failed('Check the Google service account credentials.'):missing('Set GOOGLE_GA4_PROPERTY_ID.'),searchConsole:gscConfigured?failed('Check the Google service account credentials.'):missing('Set GOOGLE_SEARCH_CONSOLE_SITE_URL.')};}
 const [ga4,searchConsole]=await Promise.all([ga4Report(env,window,token,fetcher),searchConsoleReport(env,window,token,fetcher)]);
 return {ga4,searchConsole};
}
export async function trafficReports(env,days,{fetcher=fetch}={}) {
 const window=trafficWindow(days);
 const [goatcounter,google]=await Promise.all([goatCounterReport(env,window,{fetcher}),googleTrafficReports(env,window,{fetcher})]);
 return {range:{days:window.days,startDate:window.startDate,endDate:window.endDate},goatcounter,google};
}
