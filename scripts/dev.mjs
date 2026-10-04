import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { createHandler } from '../src/handler.mjs';
const handle=createHandler();
const files={'/':['index.html','text/html'],'/app.js':['app.js','text/javascript'],'/style.css':['style.css','text/css'],'/logo.svg':['logo.svg','image/svg+xml'],'/brand.html':['brand.html','text/html']};
createServer(async(req,res)=>{
  const pathname=new URL(req.url,'http://localhost').pathname;
  if(pathname.startsWith('/api/'))return handle(req,res);
  const entry=files[pathname];if(!entry){res.writeHead(404);return res.end('Not found');}
  try{res.setHeader('Content-Type',entry[1]);res.end(await readFile(new URL(`../public/${entry[0]}`,import.meta.url)));}catch{res.writeHead(404);res.end('Not found');}
}).listen(8787,'127.0.0.1',()=>console.log(`Perch: http://localhost:8787 (${process.env.PERCH_DEMO==='1'?'sample data':'authenticated'})`));
