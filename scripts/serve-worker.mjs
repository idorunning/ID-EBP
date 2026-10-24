// Local acceptance preview of the built Worker, including paginated research API.
import {createServer} from 'node:http';
import worker from '../dist/worker.mjs';
const port=Number(process.env.PORT||4173);
createServer(async(req,res)=>{
 try{
  const response=await worker.fetch(new Request(`http://localhost:${port}${req.url}`,{method:req.method,headers:req.headers}));
  res.writeHead(response.status,Object.fromEntries(response.headers));
  res.end(Buffer.from(await response.arrayBuffer()));
 }catch(error){console.error(error.message);res.writeHead(500).end('Preview unavailable');}
}).listen(port,'0.0.0.0',()=>console.log(`Worker preview on http://localhost:${port}`));
