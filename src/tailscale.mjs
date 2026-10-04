import {isIP} from 'node:net';

export const tailscaleStates=['disabled','unavailable','not-installed','running','stopped','needs-login','needs-approval','starting'];
export function isTailnetIP(value){
  if(typeof value!=='string'||value.includes('%'))return false;
  if(isIP(value)===4){const [first,second]=value.split('.').map(Number);return first===100&&second>=64&&second<=127;}
  return isIP(value)===6&&value.toLowerCase().startsWith('fd7a:115c:a1e0:');
}
export function sanitizeTailscale(value){
  if(!value||Array.isArray(value)||!tailscaleStates.includes(value.state))throw new Error('Invalid Tailscale status');
  const dnsName=value.dnsName??null,ips=value.ips??[];
  if(dnsName!==null&&(typeof dnsName!=='string'||dnsName.length>253||!dnsName.endsWith('.ts.net')||!dnsName.split('.').every(label=>/^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/.test(label))))throw new Error('Invalid Tailscale DNS name');
  if(!Array.isArray(ips)||ips.length>4||!ips.every(isTailnetIP))throw new Error('Invalid Tailscale address');
  // No cached addresses when the local client cannot provide usable status.
  const hasIdentity=['running','stopped','starting'].includes(value.state);
  return {state:value.state,dnsName:hasIdentity?dnsName:null,ips:hasIdentity?[...new Set(ips)]:[]};
}
