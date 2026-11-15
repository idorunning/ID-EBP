import {createServer} from 'node:http';
import worker from '../dist/worker.mjs';
createServer(async(req,res)=>{try{
 const response=await worker.fetch(new Request('http://localhost:4173'+req.url,{method:req.method}));
 res.writeHead(response.status,Object.fromEntries(response.headers));res.end(Buffer.from(await response.arrayBuffer()));
}catch(e){res.writeHead(500).end('Fixture failure');console.error(e);}}).listen(4173,'127.0.0.1');
