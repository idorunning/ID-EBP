// The index describes destinations, never papers fetched from those destinations.
import {sourceTranslationSearchText} from './source-translations.js';
export function normalise(value) {
  return String(value ?? '').normalize('NFKD').replace(/\p{M}/gu,'').toLowerCase()
    .replace(/&/g,' and ').replace(/[’']/g,'').replace(/[^\p{L}\p{N}]+/gu,' ').trim().replace(/\s+/g,' ');
}
// These are spelling/terminology equivalents. They do not relax selected filters.
export function queryWords(value) {
  return normalise(value)
    .replace(/\bhot spots?\b/g,'hotspot').replace(/\bhotspots\b/g,'hotspot')
    .replace(/\bcommunity policing\b/g,'neighbourhood policing')
    .replace(/\bneighborhood\b/g,'neighbourhood')
    .replace(/\borganization(s)?\b/g,'organisation$1')
    .replace(/\bwell being\b/g,'wellbeing')
    .split(' ').filter(Boolean);
}
export const signature=s=>JSON.stringify([s.name,s.about,s.url,s.owner,s.types,s.languages,s.topics,s.searchTerms,s.communityTags,s.translations]);
export function buildSearchEntry(s) {
  const fields={
    name:normalise(s.name),owner:normalise([s.owner,s.initials,s.brandName].join(' ')),
    topics:normalise((s.topics||[]).join(' ')),
    aliases:normalise([s.originalName,...(s.searchTerms||[])].join(' ')),
    description:normalise(s.about),
    translations:normalise(sourceTranslationSearchText(s)),
    tags:normalise((s.communityTags||[]).join(' ')),
    geography:normalise([s.country,...(s.coverage||[])].join(' ')),
    classification:normalise([...(s.types||[]),...(s.content||[]),...(s.methods||[]),...(s.languages||[])].join(' ')),
  };
  return {id:s.id,signature:signature(s),fields,tokens:[...new Set(Object.values(fields).flatMap(queryWords))]};
}
export function tokenMatches(token,word) {
  const unsegmented=word.length>=2&&/[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Hangul}\p{Script=Thai}]/u.test(word);
  return token===word || (word.length>=4 && token.startsWith(word)) || (unsegmented&&token.includes(word));
}
