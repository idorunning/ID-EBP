import {readFile,writeFile} from 'node:fs/promises';
import {SEARCH_TOPICS,normaliseSearch,TOPIC_VERSION} from '../public/search-topics.js';
const file=new URL('../supabase/migrations/20261024020430_topic_hybrid_search.sql',import.meta.url);
const quote=s=>"'"+s.replaceAll("'","''")+"'";
const rows=SEARCH_TOPICS.map(t=>{
 const aliases=[...new Set(t.aliases.map(normaliseSearch))];
 const pattern='(^| )('+aliases.map(a=>a.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')).join('|')+')( |$)';
 return `(${quote(t.id)},${quote(t.label)},${quote(pattern)},${quote(TOPIC_VERSION)})`;
}).join(',\n');
const seed=`-- BEGIN GENERATED TOPICS\ninsert into public.research_search_topics(id,label,pattern,version) values\n${rows}\non conflict(id) do update set label=excluded.label,pattern=excluded.pattern,version=excluded.version;\n-- END GENERATED TOPICS`;
const before=await readFile(file,'utf8'),after=before.replace(/-- BEGIN GENERATED TOPICS[\s\S]*?-- END GENERATED TOPICS/,seed);
if(process.argv.includes('--check')){if(after!==before)throw Error('Search topic seed differs from shared dictionary. Run node scripts/sync-search-topics.mjs.');}
else await writeFile(file,after);
