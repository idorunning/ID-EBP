import test from 'node:test';
import assert from 'node:assert/strict';
import {ownerOnlyRating,publicCommunity} from '../backend/api.mjs';

test('public community summary carries no rating average or count',()=>{
 const result=publicCommunity({authoritative:true,sources:{a:{rating:{average:4,count:3},ratingAverage:4,ratingCount:3,tags:[{label:'x'}],domainConfirmed:true}}});
 assert.deepEqual(result.sources.a,{tags:[{label:'x'}],domainConfirmed:true});
 assert.equal(result.authoritative,true);
});

test('members see only their own rating; managers see the average',()=>{
 assert.deepEqual(ownerOnlyRating({managed:false,rating:{average:4,count:3,own:5},tags:[]}),{managed:false,rating:{own:5},tags:[]});
 assert.deepEqual(ownerOnlyRating({rating:{average:4,count:3,own:null}}).rating,{own:null});
 const owner={managed:true,rating:{average:4,count:3,own:null}};
 assert.deepEqual(ownerOnlyRating(owner),owner);
});
