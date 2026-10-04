import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {sanitizeTailscale} from '../src/tailscale.mjs';
const exec=promisify(execFile);
const empty=state=>({state,dnsName:null,ips:[]});

export function parseTailscale(raw){
  const status=JSON.parse(raw);
  const states={Running:'running',Stopped:'stopped',NeedsLogin:'needs-login',NeedsMachineAuth:'needs-approval',Starting:'starting'};
  const state=states[status?.BackendState]||'unavailable';
  if(!['running','stopped','starting'].includes(state))return empty(state);
  if(!status.Self||typeof status.Self!=='object')return empty('unavailable');
  return sanitizeTailscale({state,dnsName:typeof status.Self.DNSName==='string'?status.Self.DNSName.toLowerCase().replace(/\.$/,'')||null:null,ips:status.Self.TailscaleIPs??[]});
}

export async function collectTailscale(env=process.env,run=exec,platform=process.platform){
  // Private addresses leave the Mac only after explicit opt-in.
  if(env.PERCH_TAILSCALE!=='1')return empty('disabled');
  const candidates=env.PERCH_TAILSCALE_PATH?[env.PERCH_TAILSCALE_PATH]:['tailscale',...(platform==='darwin'?['/Applications/Tailscale.app/Contents/MacOS/Tailscale']:[])];
  for(const executable of candidates){
    try{
      const {stdout}=await run(executable,['status','--json','--peers=false'],{timeout:3000,maxBuffer:65536,env:{...process.env,TAILSCALE_BE_CLI:'1'}});
      return parseTailscale(stdout);
    }catch(error){if(error.code!=='ENOENT')return empty('unavailable');}
  }
  return empty('not-installed');
}
