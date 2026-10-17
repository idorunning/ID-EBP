import {readFile,readdir,mkdir,writeFile} from 'node:fs/promises';
import {extname,resolve,posix} from 'node:path';
const root=resolve(import.meta.dirname,'..');
const types={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.svg':'image/svg+xml','.txt':'text/plain; charset=utf-8','.png':'image/png','.jpg':'image/jpeg','.jpeg':'image/jpeg','.webp':'image/webp','.woff2':'font/woff2'};
const binary=new Set(['.png','.jpg','.jpeg','.webp','.woff2']);
const assets={};
async function collect(directory=''){
  for(const entry of await readdir(resolve(root,'public',directory),{withFileTypes:true})){
    const path=posix.join(directory,entry.name);
    if(entry.isDirectory()){await collect(path);continue;}
    const extension=extname(path),type=types[extension];
    if(!type)continue;
    const isBinary=binary.has(extension);
    const body=await readFile(resolve(root,'public',path));
    assets['/'+path]={type,body:body.toString(isBinary?'base64':'utf8'),...(isBinary?{base64:true}:{})};
  }
}
await collect();
await mkdir(resolve(root,'dist'),{recursive:true});
const {SOURCES,COUNTRY_CODES}=await import('../public/data.js');
const seo=(await readFile(resolve(root,'backend/seo.mjs'),'utf8')).replaceAll('export function ','function ');
const catalogue=SOURCES.map(s=>({...s,countryCode:COUNTRY_CODES[s.country]}));
const maintenance=(await readFile(resolve(root,'backend/maintenance.mjs'),'utf8')).replaceAll('export ','');
const api=await readFile(resolve(root,'backend/api.mjs'),'utf8');
const worker=(await readFile(resolve(root,'src/worker.mjs'),'utf8')).replace("import {publicDocument,catalogueFromCommunity,sitemap} from '../backend/seo.mjs';",seo).replace("import {CATALOGUE} from './catalogue.generated.mjs';",`const CATALOGUE=${JSON.stringify(catalogue)};`).replace("import {runDirectoryTasks,serveSourceMedia} from '../backend/maintenance.mjs';",maintenance).replace("import {handleApi} from '../backend/api.mjs';",api.replace('export async function handleApi','async function handleApi'));
await writeFile(resolve(root,'dist/worker.mjs'),worker.replace("import {ASSETS} from './assets.generated.mjs';",`const ASSETS=${JSON.stringify(assets)};`));
console.log(`Built ${Object.keys(assets).length} static assets into dist/worker.mjs.`);
