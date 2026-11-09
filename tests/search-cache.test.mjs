import test from 'node:test';
import assert from 'node:assert/strict';
import {searchSources} from '../public/ranking.js';
import {signature,buildSearchEntry} from '../public/search.js';
for(const field of ['name','owner','initials','brandName','originalName','searchTerms','about','communityTags','country','coverage','types','content','methods','languages','topics'])test(`cache notices an in-place ${field} update`,()=>{
 const source={id:'cache-fixture',name:'Fixture',owner:'',initials:'',brandName:'',originalName:'',searchTerms:[],about:'',communityTags:[],country:'GB',coverage:[],types:[],content:[],methods:[],languages:[],topics:[]};
 const before=signature(source);assert.equal(searchSources([source],{query:'quasarword'}).length,0);
 source[field]=Array.isArray(source[field])?['quasarword']:'quasarword';
 assert.notEqual(signature(source),before);assert.equal(signature(source),buildSearchEntry(source).signature);
 assert.equal(searchSources([source],{query:'quasarword'}).length,1);
 source[field]=Array.isArray(source[field])?[]:'';assert.equal(searchSources([source],{query:'quasarword'}).length,0);
});
