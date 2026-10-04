import {freshness,relativeTime,bytes,uptime,historyPoints,demoScenario,isMetric,tailscaleStatus,escapeHTML as esc} from './model.js';
const root=document.querySelector('#app');
const state={config:null,data:null,selected:null,view:'overview',scenario:'normal',error:null,busy:false,serverTime:0,observedAt:0};
let authEpoch=0;
const authChannel=typeof BroadcastChannel==='function'?new BroadcastChannel('perch-auth'):null;
function clearPrivate(message='Checking your session…'){
  authEpoch++;
  Object.assign(state,{config:null,data:null,selected:null,error:null,busy:false,serverTime:0,observedAt:0});
  root.innerHTML=`<main id="main" class="welcome">${brand()}<h1>${esc(message)}</h1></main>`;
  announce('');
  return authEpoch;
}
const now=()=>state.serverTime?state.serverTime+performance.now()-state.observedAt:Date.now();
const icon=(name)=>{
  const paths={refresh:'<path d="M13 5a6 6 0 1 0 1 7M13 2v4H9"/>',lock:'<rect x="4" y="7" width="8" height="7" rx="2"/><path d="M6 7V5a2 2 0 0 1 4 0v2"/>',info:'<circle cx="8" cy="8" r="6"/><path d="M8 7v4m0-7v1"/>',arrow:'<path d="M3 8h10M9 4l4 4-4 4"/>',check:'<path d="m4 8 3 3 5-6"/>'};
  return `<svg class="icon" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${paths[name]||paths.info}</svg>`;
};
const mini=`<svg class="heading-device" viewBox="0 0 120 82" fill="none" aria-hidden="true"><rect x="12" y="17" width="96" height="52" rx="15" fill="url(#metal)" stroke="#b7bdb8"/><path d="M12 51v3c0 9 6 15 15 15h66c9 0 15-6 15-15v-3" stroke="#adb4af"/><path d="M27 57h5m6 0h5" stroke="#777e79" stroke-width="3" stroke-linecap="round"/><circle cx="93" cy="57" r="2" fill="#edf3e9"/><defs><linearGradient id="metal" x1="60" y1="17" x2="60" y2="69" gradientUnits="userSpaceOnUse"><stop stop-color="#edf0ed"/><stop offset=".65" stop-color="#d5d9d5"/><stop offset="1" stop-color="#b7bdb8"/></linearGradient></defs></svg>`;
const brand=()=>`<a class="brand" href="/" aria-label="Perch home"><img src="/logo.svg" width="43" height="43" alt=""><img class="wordmark" src="/wordmark.svg" width="100" height="36" alt="perch"></a>`;
function announce(message){document.querySelector('#announcement').textContent=message;}
async function api(action,options={}){
  const response=await fetch(`/api/${action}`,{credentials:'same-origin',cache:'no-store',signal:AbortSignal.timeout(12000),...options});
  let data;try{data=await response.json();}catch{throw new Error('The server returned an unexpected response. Try again.');}
  if(!response.ok){const error=new Error(data.error||'The request could not be completed.');error.status=response.status;throw error;}
  return data;
}
function setup(id){return `<section class="setup"><p class="eyebrow">A NEW PERCH</p><h2>Waiting for the first hello.</h2><p>Once the agent sends its first heartbeat, this is where your machine’s resources and sessions will appear.</p><ol><li>On the Mac you want to monitor, configure the agent with your hosted Perch URL, machine ID <code>${esc(id||'your-machine-id')}</code>, and its private token.</li><li>Run a one-shot heartbeat to check the connection.</li><li>After it succeeds, install the optional LaunchAgent for regular check-ins.</li></ol><a class="button" href="https://github.com/mager/perch#install-the-mac-agent" target="_blank" rel="noreferrer">Agent setup guide ${icon('arrow')}</a><details><summary>What Perch can see</summary><p>CPU, allocated memory, disk space, uptime, hostname, and tmux session metadata. Terminal output and conversation content stay on your Mac. There is no remote execution.</p></details></section>`;}
function metric(label,value,note,percent){const available=isMetric(percent);return `<div class="metric"><div class="metric-label">${label}</div><div class="metric-value">${value}</div><p class="metric-note">${note}</p>${available?`<svg class="meter" viewBox="0 0 100 4" preserveAspectRatio="none" role="img" aria-label="${esc(label)} ${Math.round(percent)} percent"><line x1="0" y1="2" x2="${Math.max(0,Math.min(100,percent))}" y2="2"/></svg>`:'<div class="meter" aria-hidden="true"></div>'}</div>`;}
function chart(machine){
  const points=historyPoints(machine.history), span=points.length>1?points.at(-1).receivedAt-points[0].receivedAt:0;
  const head=`<div class="section-head"><h2>CPU history</h2><span class="mono muted">${points.length>1?`${Math.round(span/60000)} minutes · ${points.length} samples`:'Recent samples'}</span></div>`;
  if(points.length<2)return `<section class="history">${head}<div class="history-empty">${points.length?'One sample received. The next heartbeat will start the chart.':'No history in this snapshot yet.'}</div></section>`;
  // A gap over three minutes breaks the line; never imply data across an outage.
  let d='';points.forEach((p,i)=>{const x=40+(p.receivedAt-points[0].receivedAt)/Math.max(1,span)*940,y=10+(100-p.cpu)*1.2;d+=`${i===0||p.receivedAt-points[i-1].receivedAt>180000?'M':'L'}${x.toFixed(2)},${y.toFixed(2)} `;});
  return `<section class="history">${head}<div class="chart-frame"><div class="chart-axis" aria-hidden="true"><span>100%</span><span>50%</span><span>0%</span></div><svg class="chart" viewBox="40 0 960 145" preserveAspectRatio="none" role="img" aria-label="CPU utilization, ${points.length} samples over ${Math.round(span/60000)} minutes, on a zero to 100 percent scale"><path class="chart-grid" d="M40 10H980M40 70H980M40 130H980"/><path class="chart-line" d="${d}"/></svg></div><div class="chart-labels mono"><span>${esc(new Date(points[0].receivedAt).toLocaleTimeString([],{hour:'2-digit',minute:'2-digit'}))}</span><span>${esc(new Date(points.at(-1).receivedAt).toLocaleTimeString([],{hour:'2-digit',minute:'2-digit'}))}</span></div></section>`;
}
function sessions(snapshot){
  const rows=snapshot.sessions||[],available=snapshot.tmuxStatus==='ok';
  return `<section class="sessions"><div class="section-head"><h2>tmux sessions <span class="count">${available?rows.length:'?'}</span></h2><span class="eyebrow" data-snapshot-label>Latest snapshot</span></div>${!available?'<p class="empty-inline">tmux data is unavailable. Check that tmux is installed and reachable by the agent.</p>':!rows.length?'<p class="empty-inline">No tmux sessions were reported in this snapshot.</p>':`<div class="table-wrap"><table><thead><tr><th scope="col">Session</th><th scope="col">Windows</th><th scope="col">Clients</th><th scope="col">Codex panes</th></tr></thead><tbody>${rows.map(s=>`<tr><td><div class="session-name"><span class="session-icon" aria-hidden="true">›_</span><span>${esc(s.name)}</span></div></td><td>${esc(s.windows)}</td><td>${esc(s.attached)}</td><td>${s.codexPanes===null?'Unavailable':esc(s.codexPanes)}</td></tr>`).join('')}</tbody></table></div>`}<p class="session-note">${icon('info')}<span>Foreground process counts only. Task progress and completion are not available.</span></p></section>`;
}
function tailscale(snapshot){
  const status=snapshot.tailscale;
  const addresses=[...(status?.dnsName?[['MagicDNS',status.dnsName]]:[]),...(status?.ips||[]).map(ip=>[ip.includes(':')?'IPv6':'IPv4',ip])];
  const help=!status||status.state==='disabled'?'Enable optional Tailscale reporting in your Mac agent to see this machine’s private address here.':status.state==='not-installed'?'Install Tailscale or set its executable path in the agent configuration.':status.state==='unavailable'?'The agent could not read Tailscale status. Check the Tailscale app and agent configuration.':status.state==='needs-login'?'Sign in using the Tailscale app on this machine.':status.state==='needs-approval'?'Approve this device in your Tailscale admin console.':'Reported by the Mac agent. This does not test reachability from your browser.';
  return `<section class="tailscale" aria-labelledby="tailscale-heading"><div class="section-head"><h2 id="tailscale-heading">Tailscale</h2><span class="mono muted" id="tailscale-status"></span></div>${addresses.length?`<dl class="network-addresses">${addresses.map(([label,value],i)=>`<div><dt>${label}</dt><dd><code>${esc(value)}</code><button class="button" id="copy-tailnet-${i}" data-copy-address="${esc(value)}" aria-label="Copy ${label} address">Copy</button></dd></div>`).join('')}</dl>`:''}<p class="network-note muted">${help}</p><p class="network-note muted" id="tailscale-freshness"></p>${addresses.length?'<p class="network-note muted">Use these addresses from a device on your tailnet with permission to reach this Mac. Perch does not change Tailscale access rules.</p>':'<a class="network-guide" href="https://github.com/mager/perch#tailscale" target="_blank" rel="noreferrer">Tailscale setup guide ↗</a>'}</section>`;
}
function render(){
  if(!state.data)return;
  const focused=document.activeElement?.id;
  const machines=demoScenario(state.data,state.scenario),machine=machines.find(m=>m.id===state.selected)||machines[0];
  state.selected=machine?.id;
  const snap=machine?.snapshot;
  const sample=state.data.demo;
  const error=state.error||(sample&&state.scenario==='error'?'Sample interruption: the status API could not be reached.':null);
  root.innerHTML=`<div class="shell"><header class="app-header">${brand()}<div class="header-actions">${sample?'<span class="badge sample">SAMPLE DATA</span>':`<span class="private-label mono">${icon('lock')} Owner only</span><button class="button" id="logout">Sign out</button>`}<button class="button" id="refresh" ${state.busy?'disabled':''}>${icon('refresh')}<span>${state.busy?'Refreshing…':'Refresh'}</span></button></div></header><main class="workspace" id="main"><nav class="machine-nav" aria-label="Your machines">${machines.map(m=>`<button class="machine-button" id="machine-${esc(m.id)}" data-machine="${esc(m.id)}" aria-current="${m.id===state.selected}"><span class="dot ${freshness(m.snapshot,now())}" data-machine-dot="${esc(m.id)}"></span><span>${esc(m.name)}</span></button>`).join('')}</nav>${error?`<div class="notice" role="alert"><strong>Updates interrupted.</strong> ${esc(error)} The last fetched snapshot is shown below; its current state cannot be verified.</div>`:''}<section class="machine-summary" data-freshness="${freshness(snap,now())}"><p class="eyebrow">${sample?'A LITTLE LOOK AROUND':'YOUR PRIVATE LOOKOUT'}</p><h1>${esc(machine?.name||'Your machines')}</h1><p class="hostline mono">${snap?`${esc(snap.hostname)} <span aria-hidden="true">·</span> ${snap.platform==='darwin'?'macOS':'Linux'} <span aria-hidden="true">·</span> Uptime ${uptime(snap.uptime)}`:'A quiet place to keep an eye on things.'}</p><div class="heartbeat"><span class="dot ${freshness(snap,now())}" id="main-dot"></span><span class="status-title" id="status-title"></span><span class="status-time mono" id="status-age"></span></div><p class="status-description" id="status-description"></p>${mini}</section><div id="snapshot" data-freshness="${freshness(snap,now())}">${snap?`<nav class="view-nav" aria-label="Snapshot view"><button id="view-overview" data-view="overview" aria-pressed="${state.view==='overview'}">Overview</button><button id="view-sessions" data-view="sessions" aria-pressed="${state.view==='sessions'}">Sessions <span class="count">${snap.tmuxStatus==='ok'?snap.sessions.length:'?'}</span></button><span class="snapshot-label mono" data-snapshot-label></span></nav><div ${state.view==='overview'?'':'hidden'}><section class="metrics" aria-label="System resources">${metric('CPU',`${esc(snap.cpu)}<small> %</small>`,'utilization · one-second sample',snap.cpu)}${metric('Memory',bytes(snap.memoryUsed),`of ${bytes(snap.memoryTotal)} allocated, including cache`,snap.memoryUsed/snap.memoryTotal*100)}${metric('Disk free',bytes(snap.disk?.free),snap.disk?`of ${bytes(snap.disk.total)} capacity`:'Disk could not be collected',snap.disk?snap.disk.free/snap.disk.total*100:null)}</section>${tailscale(snap)}${chart(machine)}</div>${sessions(snap)}`:setup(machine?.id)}</div>${sample?`<aside class="sample-controls" aria-label="Sample scenarios"><label for="scenario">Explore a state</label><select id="scenario"><option value="normal">Normal reporting</option><option value="stale">Missed heartbeats</option><option value="empty">First heartbeat</option><option value="unavailable">Unavailable metrics</option><option value="error">Connection error</option></select><p class="sample-explainer">Fictional machines. Your Mac is not connected.</p></aside>`:''}<footer class="foot mono"><span>${sample?'Local sample data · no Mac connected':'Private snapshots · read-only monitoring'}</span><a href="https://github.com/mager/perch" target="_blank" rel="noreferrer">Perch is open source ↗</a></footer></main></div>`;
  root.querySelector('#refresh').addEventListener('click',()=>refresh(true));
  root.querySelector('#logout')?.addEventListener('click',logout);
  root.querySelectorAll('[data-copy-address]').forEach(button=>button.addEventListener('click',async()=>{
    const epoch=authEpoch;
    try{await navigator.clipboard.writeText(button.dataset.copyAddress);if(epoch===authEpoch&&button.isConnected){button.textContent='Copied';announce('Address copied.');}}
    catch{if(epoch===authEpoch&&button.isConnected)announce('Could not copy. Select the address and copy it manually.');}
  }));
  root.querySelectorAll('[data-machine]').forEach(button=>button.addEventListener('click',()=>{state.selected=button.dataset.machine;render();announce(`${button.textContent.trim()} selected`);}));
  root.querySelectorAll('[data-view]').forEach(button=>button.addEventListener('click',()=>{state.view=button.dataset.view;render();}));
  const select=root.querySelector('#scenario');if(select){select.value=state.scenario;select.addEventListener('change',()=>{state.scenario=select.value;render();announce(`Sample state: ${select.selectedOptions[0].textContent}`);});}
  updateAge();
  if(focused)document.getElementById(focused)?.focus({preventScroll:true});
}
function updateAge(){
  if(!state.data)return;
  const machines=demoScenario(state.data,state.scenario),machine=machines.find(m=>m.id===state.selected),snap=machine?.snapshot;
  const status=freshness(snap,now()),interrupted=Boolean(state.error)||(state.data.demo&&state.scenario==='error');
  const title=document.querySelector('#status-title');if(!title)return;
  const tailnetStatus=document.querySelector('#tailscale-status');
  if(tailnetStatus)tailnetStatus.textContent=tailscaleStatus(snap,now(),interrupted);
  const tailnetFreshness=document.querySelector('#tailscale-freshness');
  if(tailnetFreshness)tailnetFreshness.textContent=interrupted||status==='stale'?'This Tailscale snapshot may be out of date. Current connectivity is unknown.':'';
  title.textContent=interrupted?'Current state unverified':status==='fresh'?'Heartbeat received':status==='stale'?'Heartbeat overdue':'No heartbeat yet';
  document.querySelector('#status-age').textContent=snap?relativeTime(snap.receivedAt,now()):'';
  document.querySelector('#status-description').textContent=interrupted?'Showing the last fetched snapshot. Refresh to check for a newer one.':status==='stale'?'Last snapshot retained. The machine’s current state is unknown.':status==='fresh'?'A recent check-in. A little peace of mind.':'Your machine will appear here after its first check-in.';
  document.querySelector('#main-dot').className=`dot ${interrupted?'stale':status}`;
  root.querySelectorAll('[data-freshness]').forEach(el=>el.dataset.freshness=interrupted?'stale':status);
  root.querySelectorAll('[data-snapshot-label]').forEach(el=>el.textContent=interrupted?'Last fetched snapshot':status==='stale'?'Stale snapshot':'Latest snapshot');
  machines.forEach(m=>{const dot=root.querySelector(`[data-machine-dot="${CSS.escape(m.id)}"]`);if(dot)dot.className=`dot ${freshness(m.snapshot,now())}`;});
}
async function refresh(manual=false){
  if(state.busy||document.hidden||!(state.config?.demo||state.config?.signedIn))return;
  const epoch=authEpoch;
  state.busy=true;if(state.data)render();
  try{
    const data=await api('machines');
    if(epoch!==authEpoch)return;
    if(!Array.isArray(data.machines)||!isMetric(data.serverTime))throw new Error('The server returned an unexpected snapshot.');
    state.data=data;state.serverTime=data.serverTime;state.observedAt=performance.now();state.error=null;
    if(manual)announce('Snapshots refreshed.');
  }catch(error){
    if(epoch!==authEpoch)return;
    if(error.status===401){await initialize('Your session ended. Sign in again to see your machines.');return;}
    state.error=error.message;
    if(!state.data){showUnavailable(error.message);return;}
    announce('Could not refresh. The last fetched snapshot is still shown.');
  }finally{if(epoch===authEpoch)state.busy=false;}
  if(epoch!==authEpoch)return;
  render();
}
function showUnavailable(message){root.innerHTML=`<main id="main" class="welcome">${brand()}<p class="eyebrow">LET’S GET YOU SETTLED</p><h1>Your perch needs a little setup.</h1><p class="muted">${esc(message)}</p><p class="muted">If this is a new installation, configure Google sign-in, your owner account, and Redis in the hosting environment. If it worked before, check the service connection.</p><div class="welcome-actions"><button class="button primary" id="retry">Try again</button><a class="button" href="https://github.com/mager/perch#deploy-on-vercel">Setup guide ${icon('arrow')}</a></div><p class="welcome-note">Your Mac sends outbound heartbeats. The web portal is hosted separately so it can stay available during a reporting interruption.</p></main>`;root.querySelector('#retry').addEventListener('click',()=>initialize());}
let googlePromise;
function loadGoogle(){
  if(window.google?.accounts?.id)return Promise.resolve();
  if(googlePromise)return googlePromise;
  googlePromise=new Promise((resolve,reject)=>{
    const script=document.createElement('script');script.src='https://accounts.google.com/gsi/client';script.async=true;
    const timeout=setTimeout(()=>{script.remove();googlePromise=null;reject(new Error('Google sign-in did not load. Check your connection, then try again.'));},12000);
    script.onload=()=>{clearTimeout(timeout);resolve();};script.onerror=()=>{clearTimeout(timeout);script.remove();googlePromise=null;reject(new Error('Google sign-in is unavailable. Check your connection, then try again.'));};document.head.append(script);
  });return googlePromise;
}
async function showSignIn(message=''){
  const epoch=authEpoch;
  root.innerHTML=`<main id="main" class="welcome">${brand()}<p class="eyebrow">YOUR MINI. WITHIN REACH.</p><h1>A little closer<br>to your machine.</h1><p class="muted">Sign in to your private lookout. Your latest heartbeat, resources, and sessions will be waiting here.</p><div class="signin-slot" id="google-signin"><p class="muted">Loading secure sign-in…</p></div><p id="auth-message" class="auth-error" role="status">${esc(message)}</p><button class="button" id="retry-signin">Reload sign-in</button><p class="welcome-note">${icon('lock')} Only the Google account configured by this installation’s owner can view machine data.</p></main>`;
  root.querySelector('#retry-signin').addEventListener('click',()=>initialize());
  try{
    await loadGoogle();
    if(epoch!==authEpoch||!document.querySelector('#google-signin'))return;
    window.google.accounts.id.initialize({client_id:state.config.clientId,nonce:state.config.nonce,auto_select:false,callback:async({credential})=>{
      if(epoch!==authEpoch)return;
      const target=document.querySelector('#auth-message');target.textContent='Verifying your account…';
      try{await api('login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({credential})});if(epoch!==authEpoch)return;state.config.signedIn=true;await refresh();}catch(error){if(epoch===authEpoch&&target.isConnected)target.textContent=error.message;}
    }});
    const target=root.querySelector('#google-signin');target.replaceChildren();window.google.accounts.id.renderButton(target,{type:'standard',theme:'outline',size:'large',shape:'pill',text:'signin_with',width:280});
  }catch(error){if(epoch!==authEpoch)return;const target=root.querySelector('#auth-message');if(target)target.textContent=error.message;root.querySelector('#google-signin')?.replaceChildren();}
}
async function logout(){
  const epoch=clearPrivate('Signing out…');
  try{
    await api('logout',{method:'POST'});
    authChannel?.postMessage('signed-out');
    if(epoch!==authEpoch)return;
    window.google?.accounts?.id.disableAutoSelect();await initialize('You’re signed out.');
  }catch{
    if(epoch===authEpoch)showUnavailable('Sign-out could not be confirmed. Your session may still be active. Try again, then sign out.');
  }
}
async function initialize(message=''){
  const epoch=clearPrivate();
  try{const config=await api('config');if(epoch!==authEpoch)return;state.config=config;if(config.demo||config.signedIn)await refresh();else await showSignIn(message);}catch(error){if(epoch===authEpoch)showUnavailable(error.message);}
}
if(authChannel)authChannel.onmessage=event=>{if(event.data==='signed-out'&&!state.config?.demo)initialize('You’re signed out.');};
setInterval(()=>{if(!document.hidden&&state.data)refresh();},60000);
setInterval(()=>{if(!document.hidden)updateAge();},10000);
document.addEventListener('visibilitychange',()=>{if(!document.hidden&&(state.data||state.config?.demo||state.config?.signedIn)){updateAge();refresh();}});
window.addEventListener('pagehide',()=>clearPrivate());
window.addEventListener('pageshow',event=>{if(event.persisted)initialize();});
window.addEventListener('online',()=>{if(state.data)refresh();});
initialize();
