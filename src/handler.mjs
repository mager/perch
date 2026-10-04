import { OAuth2Client } from 'google-auth-library';
import { config } from './config.mjs';
import { authorized,cookie,readCookie,nonce,verify,sign,equal,isOwner,scopedClaims,inScope,SESSION,NONCE } from './auth.mjs';
import { sanitize,InputError } from './schema.mjs';
import { createStore } from './store.mjs';
import { demoMachines } from './demo.mjs';
const google=new OAuth2Client();
async function body(req) {
  if(!req.headers['content-type']?.startsWith('application/json'))throw new InputError('JSON required');
  if(req.body!==undefined){const raw=typeof req.body==='string'?req.body:JSON.stringify(req.body);if(Buffer.byteLength(raw)>16384)throw new InputError('Payload too large');return JSON.parse(raw);}
  const chunks=[];let size=0;
  for await(const chunk of req){size+=chunk.length;if(size>16384)throw new InputError('Payload too large');chunks.push(chunk);}
  return JSON.parse(Buffer.concat(chunks).toString());
}
export function createHandler({getConfig=()=>config(),storeFactory=createStore,verifyGoogle=async(token,cfg)=>(await google.verifyIdToken({idToken:token,audience:cfg.clientId})).getPayload(),clock=Date.now}={}) {
  return async(req,res)=>{
    res.setHeader('Cache-Control','no-store, private');res.setHeader('X-Content-Type-Options','nosniff');res.setHeader('Content-Type','application/json');
    const reply=(status,data)=>{res.statusCode=status;res.end(JSON.stringify(data));};
    try {
      const cfg=getConfig();
      const url=new URL(req.url,'http://localhost');
      const action=req.query?.action||url.searchParams.get('action')||url.pathname.split('/').pop();
      if(action==='config'&&req.method==='GET'){
        if(cfg.demo)return reply(200,{demo:true});
        const challenge=nonce(cfg);res.setHeader('Set-Cookie',cookie(NONCE,challenge.token,300,cfg));
        return reply(200,{demo:false,clientId:cfg.clientId,nonce:challenge.value,signedIn:Boolean(authorized(req,cfg))});
      }
      if(action==='login'&&req.method==='POST'&&!cfg.demo){
        if(req.headers.origin!==cfg.origin)return reply(403,{error:'Origin rejected'});
        const data=await body(req), challenge=verify(readCookie(req,NONCE,cfg),cfg.secret);
        if(!inScope(challenge,cfg,'nonce')||!challenge?.nonce||typeof data?.credential!=='string')return reply(401,{error:'Sign-in expired. Reload and try again.'});
        let user;try{user=await verifyGoogle(data.credential,cfg);}catch{return reply(401,{error:'Google sign-in could not be verified.'});}
        if(!equal(user?.nonce,challenge.nonce)||!isOwner(user,cfg))return reply(403,{error:'This account does not have access.'});
        const session=sign({...scopedClaims(cfg,'session'),sub:user.sub,email:user.email,email_verified:user.email_verified,hd:user.hd,exp:clock()+8*3600000},cfg.secret);
        res.setHeader('Set-Cookie',[cookie(SESSION,session,8*3600,cfg),cookie(NONCE,'',0,cfg)]);
        return reply(200,{ok:true});
      }
      if(action==='logout'&&req.method==='POST'&&!cfg.demo){if(req.headers.origin!==cfg.origin)return reply(403,{error:'Origin rejected'});res.setHeader('Set-Cookie',cookie(SESSION,'',0,cfg));return reply(200,{ok:true});}
      if(action==='heartbeat'&&req.method==='POST'&&!cfg.demo){
        const id=req.headers['x-perch-machine'], machine=Object.hasOwn(cfg.machines,id)?cfg.machines[id]:null;
        if(!machine||!equal(req.headers.authorization,`Bearer ${machine.token}`))return reply(401,{error:'Agent authentication failed'});
        const snapshot={...sanitize(await body(req),clock()),receivedAt:clock()};
        await storeFactory(cfg).write(id,snapshot);return reply(200,{ok:true});
      }
      if(action==='machines'&&req.method==='GET'){
        if(cfg.demo)return reply(200,{demo:true,serverTime:clock(),machines:demoMachines(clock())});
        if(!authorized(req,cfg))return reply(401,{error:'Sign in to view your machines.'});
        return reply(200,{demo:false,serverTime:clock(),machines:await storeFactory(cfg).list()});
      }
      return reply(404,{error:'Not found'});
    } catch(error){
      if(error instanceof InputError||error instanceof SyntaxError)return reply(400,{error:'Invalid request payload'});
      // Do not log request bodies, credentials, or provider exceptions.
      console.error('Perch request failed:',error?.name||'Error');
      return reply(503,{error:'Perch is not ready. Check server configuration or storage availability.'});
    }
  };
}
