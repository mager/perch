import os from 'node:os';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { setTimeout as delay } from 'node:timers/promises';
import { pathToFileURL } from 'node:url';
const exec=promisify(execFile);
function cpuTimes(){return os.cpus().reduce((a,c)=>{a.idle+=c.times.idle;a.total+=Object.values(c.times).reduce((s,n)=>s+n,0);return a;},{idle:0,total:0});}
export function parseSessions(output,panes){
  const counts=new Map();
  for(const row of (panes??'').trim().split('\n')){const[name,command]=row.split('\t');if(command==='codex')counts.set(name,(counts.get(name)||0)+1);}
  return output.trim().split('\n').filter(Boolean).slice(0,40).map(row=>{const[name,windows,attached]=row.split('\t');return {name:name.slice(0,100),windows:Number(windows),attached:Number(attached),codexPanes:panes===null?null:counts.get(name)||0};});
}
export async function collect(env=process.env){
  const before=cpuTimes();await delay(1000);const after=cpuTimes();
  let disk=null,sessions=[],tmuxStatus='unavailable';
  try{const{stdout}=await exec('/bin/df',['-kP','/'],{timeout:5000});const parts=stdout.trim().split('\n').pop().trim().split(/\s+/);disk={total:Number(parts[1])*1024,free:Number(parts[3])*1024};}catch{/* Report unavailable instead of inventing a value. */}
  const tmux=env.PERCH_TMUX_PATH||'tmux';
  try{
    const{stdout}=await exec(tmux,['list-sessions','-F','#{session_name}\t#{session_windows}\t#{session_attached}'],{timeout:5000,maxBuffer:65536});
    let panes=null;try{panes=(await exec(tmux,['list-panes','-a','-F','#{session_name}\t#{pane_current_command}'],{timeout:5000,maxBuffer:65536})).stdout;}catch{}
    sessions=parseSessions(stdout,panes);tmuxStatus='ok';
  }catch(error){if(/no server running|no sessions|error connecting.*No such file/i.test(error.stderr||'')){try{await exec(tmux,['-V'],{timeout:3000});tmuxStatus='ok';}catch{}}}
  const total=after.total-before.total;
  return {sampledAt:Date.now(),platform:os.platform(),hostname:os.hostname(),uptime:os.uptime(),cpu:total?Math.round(1000*(1-(after.idle-before.idle)/total))/10:0,memoryTotal:os.totalmem(),memoryUsed:os.totalmem()-os.freemem(),disk,tmuxStatus,sessions};
}
export function agentConfig(env=process.env){
  const url=new URL(env.PERCH_URL||'');
  if(url.username||url.password||url.search||url.hash||url.pathname!=='/'||(url.protocol!=='https:'&&!(url.protocol==='http:'&&['localhost','127.0.0.1'].includes(url.hostname))))throw new Error('PERCH_URL must be an HTTPS origin (or localhost for development).');
  if(!/^[a-z0-9][a-z0-9-]{0,39}$/.test(env.PERCH_MACHINE_ID||'')||(env.PERCH_AGENT_TOKEN||'').length<32)throw new Error('Set PERCH_MACHINE_ID and a random PERCH_AGENT_TOKEN of at least 32 characters.');
  const interval=Number(env.PERCH_INTERVAL_SECONDS||60);if(!Number.isInteger(interval)||interval<60||interval>3600)throw new Error('Heartbeat interval must be 60–3600 seconds.');
  return {url:url.origin,id:env.PERCH_MACHINE_ID,token:env.PERCH_AGENT_TOKEN,interval};
}
export async function main(){
  const cfg=agentConfig();
  if(!['darwin','linux'].includes(os.platform()))throw new Error('Perch currently supports macOS and Linux.');
  const once=process.argv.includes('--once');
  do{
    try{
      const payload=await collect();
      const response=await fetch(`${cfg.url}/api/heartbeat`,{method:'POST',redirect:'error',signal:AbortSignal.timeout(12000),headers:{'Content-Type':'application/json','Authorization':`Bearer ${cfg.token}`,'X-Perch-Machine':cfg.id},body:JSON.stringify(payload)});
      if(!response.ok)throw new Error(`HTTP ${response.status}`);
      console.log(`${new Date().toISOString()} Heartbeat accepted.`);
    }catch(error){console.error(`${new Date().toISOString()} Heartbeat failed (${error.message?.startsWith('HTTP ')?error.message:'connection or collection error'}).`);if(once)process.exitCode=1;}
    if(!once)await delay(cfg.interval*1000);
  }while(!once);
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href)main().catch(error=>{console.error(error.message);process.exitCode=1;});
