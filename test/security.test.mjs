import { test } from 'node:test';
import assert from 'node:assert/strict';
import { config } from '../src/config.mjs';
import { sign,verify,nonce,isOwner } from '../src/auth.mjs';
import { createHandler } from '../src/handler.mjs';
import { sanitize } from '../src/schema.mjs';
import { agentConfig,parseSessions } from '../agent/agent.mjs';
const cfg={demo:false,origin:'https://perch.example',secret:'s'.repeat(64),clientId:'google-client',ownerEmail:'owner@gmail.com',machines:{mini:{name:'Mini',token:'a'.repeat(64)},other:{name:'Other',token:'b'.repeat(64)}}};
const payload=()=>({sampledAt:Date.now(),hostname:'mini',platform:'darwin',uptime:100,cpu:10,memoryTotal:1000,memoryUsed:200,disk:{total:10000,free:5000},tmuxStatus:'ok',sessions:[]});
async function request(action,{method='GET',headers={},body,getConfig=()=>cfg,verifyGoogle=async()=>null}={}){
  const writes=[];let reads=0;
  const handler=createHandler({getConfig,verifyGoogle,storeFactory:()=>({write:async(...args)=>writes.push(args),list:async()=>{reads++;return [];}})});
  const req={url:`/api/${action}`,method,headers,body};
  const res={headers:{},setHeader(k,v){this.headers[k]=v;},end(raw){this.data=JSON.parse(raw);}};
  await handler(req,res);return {...res,writes,reads};
}
test('demo can never enable on Vercel or production',()=>{
  assert.throws(()=>config({PERCH_DEMO:'1',VERCEL:'1'}));assert.throws(()=>config({PERCH_DEMO:'1',NODE_ENV:'production'}));assert.equal(config({PERCH_DEMO:'1'}).demo,true);
});
test('sessions reject tampering and expiration',()=>{const token=sign({exp:Date.now()+60000},cfg.secret);assert.ok(verify(token,cfg.secret));assert.equal(verify(token+'x',cfg.secret),null);assert.equal(verify(sign({exp:1},cfg.secret),cfg.secret),null);});
test('owner authorization requires verified authoritative email or pinned subject',()=>{
  assert.equal(isOwner({sub:'a',email:'owner@gmail.com',email_verified:false},cfg),false);
  assert.equal(isOwner({sub:'a',email:'owner@gmail.com',email_verified:true},cfg),true);
  assert.equal(isOwner({sub:'a',email:'owner@external.example',email_verified:true},{...cfg,ownerEmail:'owner@external.example'}),false);
  assert.equal(isOwner({sub:'a'},{...cfg,ownerSub:'a'}),true);
});
test('unauthenticated and agent tokens cannot read status',async()=>{
  for(const headers of [{},{authorization:`Bearer ${cfg.machines.mini.token}`},{cookie:'__Host-perch=forged'}]){const r=await request('machines',{headers});assert.equal(r.statusCode,401);assert.equal(r.reads,0);assert.equal(r.headers['Cache-Control'],'no-store, private');}
});
test('owner cookie can read status, other owner cannot',async()=>{
  const user={sub:'owner',email:'owner@gmail.com',email_verified:true,exp:Date.now()+60000};
  assert.equal((await request('machines',{headers:{cookie:`__Host-perch=${sign(user,cfg.secret)}`}})).statusCode,200);
  assert.equal((await request('machines',{headers:{cookie:`__Host-perch=${sign({...user,email:'other@gmail.com'},cfg.secret)}`}})).statusCode,401);
});
test('machine token cannot impersonate another machine',async()=>{
  const r=await request('heartbeat',{method:'POST',headers:{'content-type':'application/json','x-perch-machine':'other',authorization:`Bearer ${cfg.machines.mini.token}`},body:payload()});assert.equal(r.statusCode,401);assert.equal(r.writes.length,0);
});
test('heartbeat uses server receipt time and strips extra fields',async()=>{
  const r=await request('heartbeat',{method:'POST',headers:{'content-type':'application/json','x-perch-machine':'mini',authorization:`Bearer ${cfg.machines.mini.token}`},body:{...payload(),receivedAt:1,terminal:'SECRET'}});assert.equal(r.statusCode,200);assert.equal(r.writes[0][0],'mini');assert.equal(r.writes[0][1].terminal,undefined);assert.ok(r.writes[0][1].receivedAt>1);
});
test('bad metrics, timestamps, oversized payloads and invalid structures are rejected',async()=>{
  for(const patch of [{cpu:101},{sampledAt:Date.now()-700000},{disk:undefined},{sessions:[null]},{hostname:'x'.repeat(17000)}]){
    const r=await request('heartbeat',{method:'POST',headers:{'content-type':'application/json','x-perch-machine':'mini',authorization:`Bearer ${cfg.machines.mini.token}`},body:{...payload(),...patch}});assert.equal(r.statusCode,400);assert.equal(r.writes.length,0);
  }
  assert.throws(()=>sanitize({...payload(),memoryUsed:Infinity}));
});
test('login rejects wrong origin and mismatched nonce',async()=>{
  const challenge=nonce(cfg), headers={'content-type':'application/json',origin:cfg.origin,cookie:`__Host-perch-nonce=${challenge.token}`};
  const user={sub:'owner',email:'owner@gmail.com',email_verified:true,nonce:challenge.value};
  assert.equal((await request('login',{method:'POST',headers:{...headers,origin:'https://evil.example'},body:{credential:'token'},verifyGoogle:async()=>user})).statusCode,403);
  assert.equal((await request('login',{method:'POST',headers,body:{credential:'token'},verifyGoogle:async()=>({...user,nonce:'wrong'})})).statusCode,403);
  const r=await request('login',{method:'POST',headers,body:{credential:'token'},verifyGoogle:async()=>user});assert.equal(r.statusCode,200);assert.match(r.headers['Set-Cookie'][0],/HttpOnly; SameSite=Strict; Max-Age=28800; Secure/);
});
test('demo serves only fixtures and cannot ingest real status',async()=>{
  const getConfig=()=>({demo:true});assert.equal((await request('machines',{getConfig})).data.demo,true);assert.equal((await request('heartbeat',{method:'POST',getConfig})).statusCode,404);
});
test('agent disallows insecure remote destinations and excessive heartbeat rates',()=>{
  const env={PERCH_URL:'https://perch.example',PERCH_MACHINE_ID:'mini',PERCH_AGENT_TOKEN:'a'.repeat(64)};
  assert.equal(agentConfig(env).interval,60);assert.throws(()=>agentConfig({...env,PERCH_URL:'http://example.com'}));assert.throws(()=>agentConfig({...env,PERCH_INTERVAL_SECONDS:'1'}));assert.throws(()=>agentConfig({...env,PERCH_URL:'https://user:pass@example.com'}));
});
test('tmux parser reports foreground codex panes without inferring task state',()=>{assert.deepEqual(parseSessions('project\t2\t0\n','project\tcodex\nproject\tzsh\n'),[{name:'project',windows:2,attached:0,codexPanes:1}]);});
