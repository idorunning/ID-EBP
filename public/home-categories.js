// One homepage placement per source; multi-topic search tags remain unchanged.
const priority=['EBP society','Researcher','Blog','University','Independent','Academic'];
export const primaryCategory=source=>priority.find(type=>source.types.includes(type))||'resources';
export function uniqueSources(sources){
 const ids=new Set(),urls=new Set();
 return sources.filter(source=>{
  let key=source.url;
  try{const url=new URL(source.url);key=url.hostname.toLowerCase().replace(/^www\./,'')+url.pathname.replace(/\/+$/,'')+url.search;}catch{}
  if(ids.has(source.id)||urls.has(key))return false;
  ids.add(source.id);urls.add(key);return true;
 });
}
