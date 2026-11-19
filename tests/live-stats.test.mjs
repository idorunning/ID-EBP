import test from 'node:test';
import assert from 'node:assert/strict';
import {publishedCoverage,catalogueTotal,liveStatsState} from '../public/live-stats.js';

test('directory counters reflect newly published source entries and countries',()=>{
 const initial={
  a:{profile:{name:'A',country:'GB'}},
  b:{profile:{name:'B',country:'GB'}},
  c:{profile:{name:'C',country:'DE'}},
  internal:{signal:{status:'review'}}
 };
 assert.deepEqual(publishedCoverage(initial),{sources:3,countries:2});
 const afterPublication={...initial,d:{profile:{name:'D',country:'FR'}}};
 assert.deepEqual(publishedCoverage(afterPublication),{sources:4,countries:3});
 const sameCountry={...afterPublication,e:{profile:{name:'E',country:'GB'}}};
 assert.deepEqual(publishedCoverage(sameCountry),{sources:5,countries:3});
});
test('research totals accept genuine zero but never missing or invalid results',()=>{
 assert.equal(catalogueTotal({total:17209}),17209);
 assert.equal(catalogueTotal({total:17210}),17210);
 assert.equal(catalogueTotal({total:0}),0);
 for(const result of [{total:null},{},{total:-1},{total:'invalid'},{total:1.5}])
  assert.equal(catalogueTotal(result),null);
});
test('Live appears only after both database-backed totals refresh',()=>{
 const t=1000000;
 assert.equal(liveStatsState(0,0,t),'checking');
 assert.equal(liveStatsState(t,0,t),'checking');
 assert.equal(liveStatsState(t,t,t+60000),'live');
 assert.equal(liveStatsState(t,t,t+150000),'delayed');
 assert.equal(liveStatsState(t,t+80000,t+150000),'delayed');
});
