import {createServer} from 'node:http';
import {readFile} from 'node:fs/promises';
import {resolve,extname} from 'node:path';
const root=resolve(import.meta.dirname,'../public');
const types={'.html':'text/html','.js':'text/javascript','.css':'text/css','.svg':'image/svg+xml','.txt':'text/plain','.png':'image/png','.jpg':'image/jpeg','.jpeg':'image/jpeg','.webp':'image/webp','.woff2':'font/woff2'};
const port=Number(process.env.PORT||4173);
createServer(async(req,res)=>{try{const url=new URL(req.url,'http://localhost');const path=resolve(root,'.'+decodeURIComponent(url.pathname==='/'?'/index.html':url.pathname));if(!path.startsWith(root+'/')){res.writeHead(403).end();return;}const body=await readFile(path);res.writeHead(200,{'Content-Type':`${types[extname(path)]||'application/octet-stream'}; charset=utf-8`,'Cache-Control':'no-store'});res.end(body);}catch{res.writeHead(404).end('Not found');}}).listen(port,'0.0.0.0',()=>console.log(`Preview running on http://localhost:${port}`));
