import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { createHandler } from '../src/handler.mjs';
const handle=createHandler();
const deployment=JSON.parse(await readFile(new URL('../vercel.json',import.meta.url),'utf8'));
const files={'/':['index.html','text/html'],'/app':['app.html','text/html'],'/app.js':['app.js','text/javascript'],'/model.js':['model.js','text/javascript'],'/landing.css':['landing.css','text/css'],'/perch-hero.png':['perch-hero.png','image/png'],'/favicon.svg':['favicon.svg','image/svg+xml'],'/wordmark.svg':['wordmark.svg','image/svg+xml'],'/style.css':['style.css','text/css'],'/logo.svg':['logo.svg','image/svg+xml'],'/brand.html':['brand.html','text/html']};
createServer(async(req,res)=>{
  for(const {key,value} of deployment.headers[0].headers)res.setHeader(key,value);
  res.setHeader('Referrer-Policy','no-referrer-when-downgrade');
  const pathname=new URL(req.url,'http://localhost').pathname;
  if(pathname.startsWith('/api/'))return handle(req,res);
  const entry=files[pathname];if(!entry){res.writeHead(404);return res.end('Not found');}
  try{res.setHeader('Content-Type',entry[1]);res.end(await readFile(new URL(`../public/${entry[0]}`,import.meta.url)));}catch{res.writeHead(404);res.end('Not found');}
}).listen(8787,'127.0.0.1',()=>console.log(`Perch: http://localhost:8787 (${process.env.PERCH_DEMO==='1'?'sample data':'authenticated'})`));
