export class InputError extends Error {}
function number(value,min,max) {if(typeof value!=='number'||!Number.isFinite(value)||value<min||value>max)throw new InputError('Invalid metric');return value;}
function text(value,max) {if(typeof value!=='string'||value.length>max||/[\u0000-\u001f\u007f]/.test(value))throw new InputError('Invalid text');return value;}
export function sanitize(input,now=Date.now()) {
  if(!input || typeof input!=='object' || Array.isArray(input))throw new InputError('Invalid payload');
  const sampledAt=number(input.sampledAt,now-600_000,now+120_000);
  if(!['darwin','linux'].includes(input.platform))throw new InputError('Unsupported platform');
  const total=number(input.memoryTotal,1,2**50), used=number(input.memoryUsed,0,total);
  if(input.disk!==null&&(!input.disk||typeof input.disk!=='object'))throw new InputError('Invalid disk');
  const disk=input.disk===null?null:{total:number(input.disk.total,1,2**55),free:number(input.disk.free,0,input.disk.total)};
  if(!Array.isArray(input.sessions)||input.sessions.length>40)throw new InputError('Invalid sessions');
  if(!['ok','unavailable'].includes(input.tmuxStatus))throw new InputError('Invalid tmux status');
  if(input.sessions.some(s=>!s||typeof s!=='object'))throw new InputError('Invalid session');
  return {sampledAt,platform:input.platform,hostname:text(input.hostname,120),uptime:number(input.uptime,0,1e10),cpu:number(input.cpu,0,100),memoryTotal:total,memoryUsed:used,disk,tmuxStatus:input.tmuxStatus,sessions:input.sessions.map(s=>({name:text(s.name,100),windows:number(s.windows,0,1000),attached:number(s.attached,0,1000),codexPanes:number(s.codexPanes,0,1000)}))};
}
