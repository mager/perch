import {test} from 'node:test';
import assert from 'node:assert/strict';
import {collectTailscale,parseTailscale} from '../agent/tailscale.mjs';
import {sanitizeTailscale} from '../src/tailscale.mjs';
import {sanitize,InputError} from '../src/schema.mjs';
import {demoMachines} from '../src/demo.mjs';
import {tailscaleStatus} from '../public/model.js';
const raw=()=>({BackendState:'Running',Self:{DNSName:'mini.example-tailnet.ts.net.',TailscaleIPs:['100.64.0.10','fd7a:115c:a1e0::10'],PublicKey:'private-metadata'},Peer:{other:{DNSName:'someone-else'}},User:{1:{LoginName:'private@example.com'}},AuthURL:'https://example.com/sensitive',Health:['private detail']});
const report={state:'running',dnsName:'mini.example-tailnet.ts.net',ips:['100.64.0.10','fd7a:115c:a1e0::10']};

test('Tailscale is opt-in and never invokes the CLI while disabled',async()=>{
  let calls=0;
  assert.deepEqual(await collectTailscale({},async()=>{calls++;}),{state:'disabled',dnsName:null,ips:[]});
  assert.equal(calls,0);
});
test('collector requests no peers and emits only self state and addresses',async()=>{
  const result=await collectTailscale({PERCH_TAILSCALE:'1',PERCH_TAILSCALE_PATH:'/configured/tailscale'},async(file,args,options)=>{
    assert.equal(file,'/configured/tailscale');assert.deepEqual(args,['status','--json','--peers=false']);
    assert.equal(options.timeout,3000);assert.equal(options.maxBuffer,65536);assert.equal(options.env.TAILSCALE_BE_CLI,'1');
    return {stdout:JSON.stringify(raw())};
  });
  assert.deepEqual(result,report);
});
test('macOS falls back to bundled CLI only when the PATH executable is missing',async()=>{
  const calls=[];
  const result=await collectTailscale({PERCH_TAILSCALE:'1'},async(file)=>{calls.push(file);if(file==='tailscale')throw Object.assign(new Error(),{code:'ENOENT'});return {stdout:JSON.stringify(raw())};},'darwin');
  assert.deepEqual(calls,['tailscale','/Applications/Tailscale.app/Contents/MacOS/Tailscale']);assert.deepEqual(result,report);
});
test('missing, failed, oversized and malformed CLI responses degrade without leaking output',async()=>{
  for(const failure of [{code:'ENOENT'},{code:'EACCES'},{code:'ERR_CHILD_PROCESS_STDIO_MAXBUFFER'},{killed:true}]){
    const result=await collectTailscale({PERCH_TAILSCALE:'1'},async()=>{throw {...failure,stderr:'private detail'};},'linux');
    assert.deepEqual(result,{state:failure.code==='ENOENT'?'not-installed':'unavailable',dnsName:null,ips:[]});
  }
  for(const stdout of ['null','not-json','{}',JSON.stringify({BackendState:'Running'})]){
    assert.deepEqual(await collectTailscale({PERCH_TAILSCALE:'1'},async()=>({stdout})),{state:'unavailable',dnsName:null,ips:[]});
  }
});
test('login and approval states discard addresses and do not guess unknown states',()=>{
  for(const [BackendState,state] of [['NeedsLogin','needs-login'],['NeedsMachineAuth','needs-approval'],['FutureState','unavailable']]){
    assert.deepEqual(parseTailscale(JSON.stringify({...raw(),BackendState})),{state,dnsName:null,ips:[]});
  }
  assert.equal(parseTailscale(JSON.stringify({...raw(),BackendState:'Stopped'})).state,'stopped');
});
test('heartbeat validation strips Tailscale extras, rejects unsafe fields, and accepts old agents',()=>{
  const snapshot=demoMachines()[0].snapshot;
  const accepted=sanitize({...snapshot,tailscale:{...report,Peer:{secret:true},AuthURL:'secret'}});
  assert.deepEqual(accepted.tailscale,report);
  assert.equal(sanitize({...snapshot,tailscale:undefined}).tailscale,null);
  for(const change of [{dnsName:'javascript:alert(1)'},{dnsName:'mini.ts.net/evil'},{dnsName:'<script>.ts.net'},{ips:['127.0.0.1']},{ips:['100.64.0.1;evil']},{ips:['fd7a:115c:a1e0::1%en0']},{ips:Array(5).fill('100.64.0.10')},{state:'online'},null]){
    if(change===null){assert.throws(()=>sanitizeTailscale(null));continue;}
    assert.throws(()=>sanitize({...snapshot,tailscale:{...report,...change}}),InputError);
  }
});
test('stale and interrupted Tailscale snapshots never claim current connectivity',()=>{
  const snapshot={receivedAt:1000000,tailscale:report};
  assert.equal(tailscaleStatus(snapshot,1000000),'Running at last heartbeat');
  assert.equal(tailscaleStatus(snapshot,1180001),'Current state unknown');
  assert.equal(tailscaleStatus(snapshot,1000000,true),'Current state unknown');
  assert.equal(tailscaleStatus({...snapshot,tailscale:null},1000000),'Not reported');
});
