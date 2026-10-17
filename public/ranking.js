export const WEIGHTS = Object.freeze({organisation:12,ownership:8,social:5,references:8,ratings:7});
const clamp=(n,max)=>Math.min(Math.max(Number(n)||0,0),max);
// Five neutral prior ratings prevent a single new vote dominating the directory.
// Zero stars is a real rating; unrated sources have null averages and a neutral prior.
export function ratingScore(source){
 const count=Math.floor(clamp(source.ratingCount??source.signals?.ratingCount,1e7));
 const mean=source.ratingAverage??source.signals?.ratingAverage;
 const average=count&&mean!==null&&Number.isFinite(Number(mean))?clamp(mean,5):2.5;
 return ((average*count+2.5*5)/(count+5))/5*WEIGHTS.ratings;
}
export function signals(source) {
  const s=source.signals||{};
  return {organisation:s.organisationConfirmed?12:0, ownership:s.domainConfirmed?8:0,
    social:clamp(s.confirmedSocial,2)*2.5, references:clamp(s.independentReferences,4)*2,
    ratings:ratingScore(source)};
}
export function signalScore(source){return Object.values(signals(source)).reduce((a,b)=>a+b,0);}
import {INDEX} from './search-index.js';
import {normalise,queryWords,buildSearchEntry,signature,tokenMatches} from './search.js';
export {normalise} from './search.js';
const cache=new WeakMap();
function indexed(s){
  const sig=signature(s),cached=cache.get(s);
  if(cached?.signature===sig)return cached;
  const entry=INDEX[s.id]?.signature===sig?INDEX[s.id]:buildSearchEntry(s);
  cache.set(s,entry);return entry;
}
export function searchSources(sources,filters={}) {
  const words=queryWords(filters.query);
  return sources.filter(s=>s.status!=='hidden').filter(s=>{
    const entry=indexed(s);
    return words.every(w=>entry.tokens.some(token=>tokenMatches(token,w)))&&(!filters.based||s.country===filters.based)&&(!filters.country||s.coverage.includes(filters.country))&&(!filters.type||s.types.includes(filters.type))&& (filters.collection!=='resources'||s.types.some(type=>['Research collection','Practice collection','Official','Professional society','Charity','Company','Learning provider'].includes(type)))&&(!filters.content||s.content.includes(filters.content))&&(!filters.access||s.access===filters.access)&&(!filters.language||s.languages.includes(filters.language))&&(!filters.topic||s.topics.includes(filters.topic));
  }).map(s=>{
    const f=indexed(s).fields;
    const inField=(field,w)=>queryWords(field).some(token=>tokenMatches(token,w));
    const matches=words.reduce((n,w)=>n+(inField(f.name,w)?25:inField(f.owner,w)?22:inField(f.topics,w)?15:inField(f.aliases,w)?12:5),0);
    return {...s,matchScore:matches,matchFields:words.length?Object.entries(f).filter(([,value])=>words.some(w=>inField(value,w))).map(([key])=>key):[],signalScore:signalScore(s)};
  }).sort((a,b)=>filters.sort==='name'?a.name.localeCompare(b.name):filters.sort==='country'?a.country.localeCompare(b.country)||a.name.localeCompare(b.name):filters.sort==='rating'?ratingScore(b)-ratingScore(a)||b.matchScore-a.matchScore||a.name.localeCompare(b.name):b.matchScore-a.matchScore||b.signalScore-a.signalScore||a.name.localeCompare(b.name));
}
export function safeUrl(value){try{const u=new URL(value);return ['https:','http:'].includes(u.protocol)&&!u.username&&!u.password?u.href:null;}catch{return null;}}
