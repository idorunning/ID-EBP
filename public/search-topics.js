// Retrieval relationships, not legal definitions or claims of equivalent evidence.
// Keep this dictionary shared by the browser, API and generated database seed.
export const TOPIC_VERSION = '2026-10-24.1';
const topic=(id,label,aliases,extra={})=>({id,label,aliases:[label.toLowerCase(),...aliases],...extra});
export const SEARCH_TOPICS = [
 topic('burglary','Burglary',['burglaries','burgled','burglar','burglars','housebreaking','house breaking','break in','break ins','breaking and entering'],{queryAliases:['domestic burglary'],includes:['residential-burglary'],related:['repeat-victimisation','target-hardening','neighbourhood-watch']}),
 topic('residential-burglary','Residential burglary',['dwelling burglary','house burglary','household burglary','residential burglaries','domestic burglary','home break ins'],{related:['burglary','target-hardening','repeat-victimisation']}),
 topic('domestic-abuse','Domestic abuse',['domestic violence','domestic/family violence','domestic and family violence','domestic assault','domestic homicide','spousal abuse','spousal violence','wife assault','wife abuse','wife beating'],{queryAliases:['domestic','da','dv','dva','domestic viiolence'],includes:['intimate-partner-violence','family-violence','coercive-control','economic-abuse'],related:['perpetrator-programmes','repeat-victimisation','safeguarding']}),
 topic('intimate-partner-violence','Intimate partner violence',['intimate partner abuse','partner violence','partner abuse','partner assault','partner assaults','dating violence','dating abuse','relationship abuse','relationship violence','violence against partners','abusive partners','abusive relationships'],{queryAliases:['ipv','ipva','assaults by former partners','partners hurting each other','violence between partners'],related:['domestic-abuse','coercive-control','perpetrator-programmes']}),
 topic('family-violence','Family violence',['familial abuse','family abuse','intrafamilial violence','intra familial violence','adolescent to parent violence','child to parent violence'],{related:['domestic-abuse','safeguarding']}),
 topic('coercive-control','Coercive control',['coercive controlling behaviour','coercive controlling behavior','controlling or coercive behaviour','controlling and coercive behaviour','coercive and controlling behaviour','coercive and controlling behavior'],{related:['domestic-abuse','intimate-partner-violence']}),
 topic('economic-abuse','Economic abuse',['financial abuse in relationships','financial abuse by partners'],{related:['domestic-abuse']}),
 topic('perpetrator-programmes','Perpetrator programmes',['perpetrator programs','batterer intervention','batterer interventions','batterer programmes','batterer programs','batterer treatment','domestic violence programmes','domestic violence programs','duluth model'],{related:['domestic-abuse','intimate-partner-violence']}),
 topic('repeat-victimisation','Repeat victimisation',['repeat victimization','repeated victimisation','repeated victimization','near repeat','repeat victims','repeat offending against victims'],{related:['burglary','domestic-abuse']}),
 topic('target-hardening','Target hardening',['household security','home security','security improvements','door locks','window locks'],{related:['burglary','situational-prevention']}),
 topic('neighbourhood-watch','Neighbourhood Watch',['neighborhood watch','neighbourhood watches','neighborhood watches'],{related:['burglary','neighbourhood-policing']}),
 topic('robbery','Robbery',['robberies','mugging','muggings','armed robbery','street robbery']),
 topic('shoplifting','Shoplifting',['shop lifting','shop theft','retail theft','retail crime','theft from shops'],{related:['repeat-offending','problem-oriented-policing']}),
 topic('vehicle-crime','Vehicle crime',['vehicle theft','car theft','theft from vehicles','motor vehicle theft','car crime','vehicle related theft']),
 topic('hot-spots','Hot spots policing',['hotspots policing','hot spot policing','hotspot policing','hot spots','hotspots','hotspot','hot spot'],{related:['focused-deterrence','problem-oriented-policing']}),
 topic('problem-oriented-policing','Problem-oriented policing',['problem oriented policing','problem solving policing','problem solving','problem solving partnerships','sara model','sara process'],{queryAliases:['pop','sara'],related:['hot-spots','situational-prevention']}),
 topic('neighbourhood-policing','Neighbourhood policing',['neighborhood policing','community policing','community oriented policing','community based policing'],{related:['procedural-justice','neighbourhood-watch']}),
 topic('procedural-justice','Procedural justice',['procedurally just','procedural fairness','police legitimacy','policing legitimacy'],{related:['neighbourhood-policing','public-trust']}),
 topic('public-trust','Public trust',['trust in police','police trust','police confidence','public confidence','confidence in police'],{related:['procedural-justice']}),
 topic('body-worn-cameras','Body-worn cameras',['body worn camera','body worn cameras','bodyworn cameras','body cameras','bodycam','bodycams'],{queryAliases:['bwc','bwcs','bwv'],related:['use-of-force','police-accountability']}),
 topic('use-of-force','Use of force',['police force use','police violence','police shootings','taser','tasers','conducted energy devices'],{related:['de-escalation','body-worn-cameras']}),
 topic('de-escalation','De-escalation',['deescalation','de escalation','conflict resolution','crisis negotiation'],{related:['use-of-force','mental-health']}),
 topic('focused-deterrence','Focused deterrence',['pulling levers','pulling levers policing','group violence intervention'],{related:['hot-spots','serious-violence']}),
 topic('situational-prevention','Situational crime prevention',['situational prevention','crime prevention through environmental design','cpted','designing out crime'],{related:['target-hardening','burglary']}),
 topic('antisocial-behaviour','Antisocial behaviour',['anti social behaviour','antisocial behavior','anti social behavior','anti-social behaviour','nuisance behaviour'],{queryAliases:['asb'],related:['neighbourhood-policing','problem-oriented-policing']}),
 topic('stalking','Stalking and harassment',['stalking','harassment','cyberstalking','cyber stalking'],{related:['domestic-abuse','safeguarding']}),
 topic('sexual-violence','Sexual violence',['sexual assault','sexual offences','sexual offenses','rape','rapes','sexual abuse'],{related:['safeguarding','investigative-interviewing']}),
 topic('child-exploitation','Child exploitation',['child sexual exploitation','child criminal exploitation','child trafficking'],{queryAliases:['cse','cce'],related:['county-lines','safeguarding']}),
 topic('county-lines','County lines',['county line drug','county lines drug','cuckooing'],{related:['child-exploitation','organised-crime']}),
 topic('safeguarding','Safeguarding',['child protection','adult protection','vulnerable victims','vulnerable adults','child safeguarding'],{related:['domestic-abuse','child-exploitation']}),
 topic('serious-violence','Serious violence',['violent crime','knife crime','gun crime','homicide','homicides','murder','youth violence'],{related:['focused-deterrence','early-intervention']}),
 topic('early-intervention','Early intervention',['early prevention','early help','youth diversion','diversion programmes','diversion programs'],{related:['serious-violence','safeguarding']}),
 topic('mental-health','Mental health',['mental illness','mental disorder','mental health crisis','crisis intervention'],{related:['de-escalation','police-wellbeing']}),
 topic('police-wellbeing','Police wellbeing',['police well being','officer wellbeing','officer well being','officer wellness','police wellness','police stress','officer stress','police burnout','officer burnout'],{related:['mental-health','leadership']}),
 topic('police-accountability','Police accountability',['police misconduct','police corruption','police complaints','police discipline','police ethics'],{related:['public-trust','procedural-justice']}),
 topic('investigative-interviewing','Investigative interviewing',['investigative interviews','suspect interviews','witness interviews','cognitive interview','peace model','interviewing suspects','interviewing witnesses'],{related:['investigations']}),
 topic('investigations','Investigations',['criminal investigation','criminal investigations','crime investigation','detective work','crime detection'],{related:['investigative-interviewing','forensics']}),
 topic('forensics','Forensic science',['forensic','forensics','dna evidence','fingerprint evidence','crime scene investigation'],{related:['investigations']}),
 topic('fraud','Fraud',['frauds','scams','scam','financial crime','investment fraud','romance fraud'],{related:['cybercrime']}),
 topic('cybercrime','Cybercrime',['cyber crime','cybercriminal','online crime','internet crime','computer crime','cyber offending'],{related:['fraud']}),
 topic('organised-crime','Organised crime',['organized crime','organised criminal groups','organized criminal groups'],{queryAliases:['ocg','ocgs'],related:['county-lines']}),
 topic('repeat-offending','Repeat offending',['reoffending','re offending','recidivism','prolific offenders','repeat offenders','serial offenders'],{related:['shoplifting','burglary']}),
 topic('stop-and-search','Stop and search',['stop search','stop searches','stop and frisk','police stops','pedestrian stops'],{related:['procedural-justice','public-trust']}),
 topic('roads-policing','Roads policing',['road policing','traffic policing','traffic enforcement','road safety','drink driving','drug driving','drink drive','drunk driving']),
 topic('leadership','Police leadership',['police management','policing leadership','police supervision','supervisory leadership','organisational change','organizational change']),
 topic('evidence-based-policing','Evidence-based policing',['evidence based policing','evidence informed policing'],{queryAliases:['ebp'],related:['randomised-trials','systematic-reviews']}),
 topic('randomised-trials','Randomised trials',['randomised controlled trial','randomized controlled trial','randomised trial','randomized trial','randomised controlled trials','randomized controlled trials'],{queryAliases:['rct','rcts'],related:['systematic-reviews']}),
 topic('systematic-reviews','Systematic reviews',['systematic review','meta analysis','meta analyses','evidence synthesis','meta-analysis','meta-analyses'],{related:['randomised-trials']})
];
export const SEARCH_INTENTS = [
 {id:'prevention',label:'Prevention and reduction',aliases:['prevent','preventing','prevention','reduce','reducing','reduction','reductions','stop','stopping','tackle','tackling','what works'],terms:['prevent','reduce','intervention','deterrence','programme','program','effectiveness','evaluation']},
 {id:'response',label:'Police response',aliases:['respond','responding','response','deal with','handle'],terms:['response','respond','police','investigation','practice']},
 {id:'risk',label:'Risk and identification',aliases:['risk','risks','identify','identifying','recognise','recognize','predict','predicting'],terms:['risk','predict','assessment','identification']}
];
export function normaliseSearch(value){return String(value??'').normalize('NFKD').replace(/\p{M}/gu,'').toLowerCase().replace(/&/g,' and ').replace(/[’']/g,'').replace(/[^\p{L}\p{N}]+/gu,' ').trim().replace(/\s+/g,' ');}
const byId=new Map(SEARCH_TOPICS.map(t=>[t.id,t]));
const padded=s=>' '+s+' ';
const contains=(text,term)=>padded(text).includes(padded(normaliseSearch(term)));
export function topicIds(id){const t=byId.get(id);return t?[id,...(t.includes||[]).flatMap(topicIds)]:[];}
export function identifyTopics(text,{query=false}={}){
 const value=normaliseSearch(text),matches=[];
 for(const t of SEARCH_TOPICS){
  const aliases=[...t.aliases,...(query?t.queryAliases||[]:[])];
  const found=aliases.map(normaliseSearch).filter(a=>contains(value,a)).sort((a,b)=>b.length-a.length)[0];
  if(!found)continue;
  if(t.id==='domestic-abuse'&&found==='domestic'&&/\bdomestic (burgl|terror|extrem|animal|cat|dog|product|market|policy|policies)/.test(value))continue;
  matches.push({id:t.id,label:t.label,matched:found});
 }
 // The longest recognised phrase owns its words ("domestic burglary" is one topic).
 return matches.filter(m=>!matches.some(n=>n.id!==m.id&&n.matched.length>m.matched.length&&contains(n.matched,m.matched)));
}
const spelling=new Map([['burgulary','burglary'],['burgalry','burglary'],['burglery','burglary'],['burgalary','burglary'],['viio lence','violence'],['viiolence','violence'],['voilence','violence'],['neigbourhood','neighbourhood'],['harrassment','harassment'],['harasment','harassment']]);
const vocabulary=[...new Set(SEARCH_TOPICS.flatMap(t=>t.aliases.flatMap(a=>normaliseSearch(a).split(' '))))].filter(w=>w.length>=5);
const vocabularySet=new Set(vocabulary);
function distance(a,b){const d=Array.from({length:a.length+1},(_,i)=>[i]);for(let j=0;j<=b.length;j++)d[0][j]=j;for(let i=1;i<=a.length;i++)for(let j=1;j<=b.length;j++){d[i][j]=Math.min(d[i-1][j]+1,d[i][j-1]+1,d[i-1][j-1]+(a[i-1]===b[j-1]?0:1));if(i>1&&j>1&&a[i-1]===b[j-2]&&a[i-2]===b[j-1])d[i][j]=Math.min(d[i][j],d[i-2][j-2]+1);}return d[a.length][b.length];}
const stopwords=new Set('how can could should would do does did i we you they a an the of for in on at by to is are was were be been being it its this that these those and or with about research evidence studies study papers paper find show me please ways best effective effectiveness'.split(' '));
export function planSearch(query,{exact=false}={}){
 const original=String(query??'').trim().slice(0,300),normalised=normaliseSearch(original);
 // Quoted phrases and explicit Boolean operators always keep their literal meaning.
 const literal=exact||/["“”]|\bOR\b|(?:^|\s)-\w/.test(original);
 const corrections=[];
 let corrected=normalised;
 if(!literal)corrected=normalised.split(' ').map(word=>{
  let replacement=spelling.get(word);
  if(!replacement&&word.length>=6&&!vocabularySet.has(word)&&!stopwords.has(word)){
   const candidates=vocabulary.filter(w=>Math.abs(w.length-word.length)<=1&&w[0]===word[0]).map(w=>[w,distance(w,word)]).filter(([,d])=>d<=1).sort((a,b)=>a[1]-b[1]);
   if(candidates.length===1)replacement=candidates[0][0];
  }
  if(replacement&&replacement!==word){corrections.push({from:word,to:replacement});return replacement;}return word;
 }).join(' ');
 const topics=literal?[]:identifyTopics(corrected,{query:true});
 let remainder=padded(corrected);
 for(const t of [...topics].sort((a,b)=>b.matched.length-a.matched.length))remainder=remainder.replaceAll(padded(t.matched),' ');
 const intents=literal?[]:SEARCH_INTENTS.filter(i=>i.aliases.some(a=>contains(corrected,a)));
 for(const i of intents)for(const alias of i.aliases)remainder=remainder.replaceAll(padded(normaliseSearch(alias)),' ');
 const terms=literal?[]:[...new Set(remainder.trim().split(' ').filter(w=>w&&!stopwords.has(w)))];
 const topicGroups=topics.map(t=>topicIds(t.id));
 const related=[...new Set(topics.flatMap(t=>byId.get(t.id).related||[]))].filter(id=>!topicGroups.flat().includes(id)).map(id=>({id,label:byId.get(id).label}));
 const suggestions=/\bintimate relationships?\b/.test(corrected)&&!topics.length?[{id:'intimate-partner-violence',label:'Intimate partner violence'},{id:'domestic-abuse',label:'Domestic abuse'}]:[];
 return {version:TOPIC_VERSION,original,corrected,exact:literal,corrections,topics,topicGroups,terms,intents:intents.map(({id,label,terms})=>({id,label,terms})),related,suggestions,
  text:literal?original:terms.join(' '),semanticText:topics.length?[...topics.map(t=>t.label),...intents.map(i=>i.label),...terms].join(' '):corrected};
}
export function topicSuggestions(query){
 const plan=planSearch(query),prefix=plan.corrected;
 const direct=plan.topics.map(t=>byId.get(t.id));
 const found=SEARCH_TOPICS.filter(t=>[...t.aliases,...(t.queryAliases||[])].some(a=>{const term=normaliseSearch(a);return term.includes(prefix)||(prefix.length>=4&&prefix.length<=term.length&&distance(prefix,term.slice(0,prefix.length))<=1);}));
 return [...new Map([...direct,...(prefix?found:SEARCH_TOPICS.filter(t=>['domestic-abuse','burglary','hot-spots','body-worn-cameras','neighbourhood-policing','police-wellbeing'].includes(t.id)))].map(t=>[t.id,{tag:t.label.toLowerCase(),topic:t.id}])).values()].slice(0,8);
}
