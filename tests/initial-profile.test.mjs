import test from 'node:test';
import assert from 'node:assert/strict';
import {needsPublicProfileHydration,countryFlagEmoji} from '../public/initial-profile.js';

test('preserve server-rendered source page until live catalogue hydrates',()=>{
 const bundled=[{id:'sebp',status:'listed'},{id:'hidden-example',status:'hidden'}];
 assert.equal(needsPublicProfileHydration('/source/international-institute-justice-police-sciences',bundled),true);
 assert.equal(needsPublicProfileHydration('/source/sebp',bundled),false);
 assert.equal(needsPublicProfileHydration('/source/hidden-example',bundled),true);
 assert.equal(needsPublicProfileHydration('/directory',bundled),false);
 assert.equal(needsPublicProfileHydration('/source/',bundled),false);
});

test('render flags without requesting missing images',()=>{
 assert.equal(countryFlagEmoji('IN'),'🇮🇳');
 assert.equal(countryFlagEmoji('GB'),'🇬🇧');
 assert.equal(countryFlagEmoji(''), '');
 assert.equal(countryFlagEmoji('IND'), '');
});
