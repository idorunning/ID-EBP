// Small, testable helpers for public homepage catalogue totals.
export function publishedCoverage(publicDirectory){
 const profiles=Object.values(publicDirectory||{}).map(item=>item?.profile).filter(profile=>profile&&typeof profile==='object');
 return {sources:profiles.length,countries:new Set(profiles.map(profile=>profile.country).filter(Boolean)).size};
}
export function catalogueTotal(payload){
 const value=payload?.total;
 if(value===null||value===undefined||value==='')return null;
 const n=Number(value);
 return Number.isSafeInteger(n)&&n>=0?n:null;
}
export function liveStatsState(sourceCheckedAt,researchCheckedAt,now=Date.now()){
 const checked=Math.min(sourceCheckedAt||0,researchCheckedAt||0);
 if(!checked)return 'checking';
 return now-checked<150000?'live':'delayed';
}
