import AxeBuilder from '@axe-core/playwright';
import {test,expect} from '@playwright/test';
import {demoMachines} from '../../src/demo.mjs';
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
const fixture=()=>({demo:true,serverTime:Date.now(),machines:demoMachines()});
async function json(route,data,status=200){await route.fulfill({status,contentType:'application/json',body:JSON.stringify(data)});}

test('landing downloads a real agent ZIP with accurate prerequisites and checksum',async({page})=>{
  await page.goto('/');
  await page.getByRole('link',{name:'Get Perch for Mac',exact:true}).click();
  await expect(page.getByRole('heading',{name:'Perch for your Mac.'})).toBeVisible();
  await expect(page.getByText('Source ZIP · Node.js 22 required · Apple silicon & Intel')).toBeVisible();
  await expect(page.getByText('This ZIP contains source files, not the native Mac app.',{exact:false})).toBeVisible();
  await expect(page.getByRole('link',{name:'Download Mac app (DMG)',exact:false})).toHaveAttribute('href','https://github.com/mager/perch/releases/download/v0.2.1-preview.1/Perch-0.2.1-developer-preview.dmg');
  await expect(page.getByText('Not yet Developer ID signed or notarized by Apple.',{exact:false})).toBeVisible();
  const downloadEvent=page.waitForEvent('download');
  await page.getByRole('link',{name:'Download Mac agent (ZIP)',exact:false}).click();
  const download=await downloadEvent;
  expect(download.suggestedFilename()).toBe('perch-mac-agent.zip');
  expect(await download.failure()).toBeNull();
  const bytes=await readFile(await download.path());
  expect(bytes.subarray(0,4).toString('hex')).toBe('504b0304');
  const checksum=await page.request.get('/downloads/perch-mac-agent.zip.sha256');
  expect(checksum.ok()).toBe(true);
  expect((await checksum.text()).split(' ')[0]).toBe(createHash('sha256').update(bytes).digest('hex'));
});

test('sample dashboard, switching machines, and every sample state',async({page})=>{
  await page.goto('/app');
  await expect(page.getByRole('heading',{name:'Studio mini',exact:true})).toBeVisible();
  await expect(page.getByText('SAMPLE DATA',{exact:true})).toBeVisible();
  await page.getByRole('button',{name:'Lab mini',exact:true}).click();
  await expect(page.getByText('Heartbeat overdue',{exact:true})).toBeVisible();
  await expect(page.getByText('Last snapshot retained. The machine’s current state is unknown.')).toBeVisible();
  await page.getByRole('button',{name:'Studio mini',exact:true}).click();
  await page.getByLabel('Explore a state').selectOption('empty');
  await expect(page.getByRole('heading',{name:'Connect the Mac you want to monitor.'})).toBeVisible();
  await expect(page.getByRole('link',{name:'Get Perch for Mac'})).toHaveAttribute('href','/#download');
  await expect(page.getByText('Install Perch on that Mac.',{exact:false})).toBeVisible();
  await page.getByLabel('Explore a state').selectOption('unavailable');
  await expect(page.getByText('Disk could not be collected')).toBeVisible();
  await expect(page.getByText('tmux data is unavailable.',{exact:false})).toBeVisible();
  await page.getByLabel('Explore a state').selectOption('error');
  await expect(page.getByRole('alert')).toContainText('Updates interrupted');
  await expect(page.getByText('Current state unverified',{exact:true})).toBeVisible();
  await page.getByLabel('Explore a state').selectOption('normal');
  await expect(page.getByText('Heartbeat received',{exact:true})).toBeVisible();
  await page.getByRole('button',{name:'Sessions 2'}).click();
  await expect(page.getByRole('table')).toBeVisible();
  await expect(page.getByRole('heading',{name:'CPU history'})).toBeHidden();
});
test('age advances even when refresh fails',async({page})=>{
  await page.clock.install();
  const data=fixture();data.machines[0].snapshot.receivedAt=data.serverTime-175000;
  await page.route('**/api/machines',route=>json(route,data));
  await page.goto('/app');
  await expect(page.getByText('Heartbeat received',{exact:true})).toBeVisible();
  await page.clock.fastForward(11000);
  await expect(page.getByText('Heartbeat overdue',{exact:true})).toBeVisible();
  await page.route('**/api/machines',route=>json(route,{error:'Storage unavailable'},503));
  await page.getByRole('button',{name:'Refresh',exact:true}).click();
  await expect(page.getByRole('alert')).toContainText('Storage unavailable');
  await expect(page.getByRole('table')).toBeVisible();
});
test('session expiry removes all private data',async({page})=>{
  let expired=false;
  await page.route('**/api/config',route=>json(route,{demo:false,clientId:'test',nonce:'test',signedIn:!expired}));
  await page.route('https://accounts.google.com/**',route=>route.abort());
  await page.route('**/api/machines',route=>expired?json(route,{error:'Sign in'},401):json(route,{...fixture(),demo:false}));
  await page.goto('/app');
  await expect(page.getByRole('heading',{name:'Studio mini',exact:true})).toBeVisible();
  await expect(page.getByLabel('Explore a state')).toHaveCount(0);
  expired=true;
  await page.getByRole('button',{name:'Refresh',exact:true}).click();
  await expect(page.getByRole('heading',{name:'A little closer to your machine.'})).toBeVisible();
  await expect(page.getByText('website',{exact:true})).toHaveCount(0);
});
test('unconfigured server offers recovery and setup guide',async({page})=>{
  await page.route('**/api/config',route=>json(route,{error:'Perch is not ready.'},503));
  await page.goto('/app');
  await expect(page.getByRole('heading',{name:'Your perch needs a little setup.'})).toBeVisible();
  await expect(page.getByRole('button',{name:'Try again'})).toBeVisible();
});
test('machine and session text cannot inject HTML',async({page})=>{
  const data=fixture();data.machines[0].name='<img src=x onerror=alert(1)>';data.machines[0].snapshot.sessions[0].name='<script>bad()</script>';
  await page.route('**/api/machines',route=>json(route,data));
  await page.goto('/app');
  await expect(page.getByRole('heading',{name:data.machines[0].name,exact:true})).toBeVisible();
  await expect(page.locator('img[src="x"]')).toHaveCount(0);
  await expect(page.getByText('<script>bad()</script>',{exact:true})).toBeVisible();
});
test('Tailscale addresses copy, age into unknown, and show unavailable states',async({page,context})=>{
  const data=fixture();
  await context.grantPermissions(['clipboard-read','clipboard-write']);
  await page.clock.install();
  data.machines[0].snapshot.receivedAt=data.serverTime-175000;
  await page.route('**/api/machines',route=>json(route,data));
  await page.goto('/app');
  await expect(page.locator('#tailscale-status')).toHaveText('Running at last heartbeat');
  await page.getByRole('button',{name:'Copy MagicDNS address'}).click();
  expect(await page.evaluate(()=>navigator.clipboard.readText())).toBe('studio-mini.example-tailnet.ts.net');
  await expect(page.getByRole('status').filter({hasText:'Address copied.'})).toBeVisible();
  await page.clock.fastForward(11000);
  await expect(page.locator('#tailscale-status')).toHaveText('Current state unknown');
  await expect(page.locator('#tailscale-freshness')).toContainText('may be out of date');
  await page.getByLabel('Explore a state').selectOption('unavailable');
  await expect(page.getByRole('button',{name:'Copy MagicDNS address'})).toHaveCount(0);
  await expect(page.getByText('The agent could not read Tailscale status.',{exact:false})).toBeVisible();
});
for(const width of [390,768,1440]){
  test(`landing and dashboard layout at ${width}px`,async({page})=>{
    const errors=[];page.on('pageerror',error=>errors.push(error.message));
    await page.setViewportSize({width,height:1000});
    for(const path of ['/','/app']){
      await page.goto(path);await expect(page.locator('h1')).toBeVisible();
      if(path==='/app')await expect(page.getByText('Heartbeat received',{exact:true})).toBeVisible();
      expect(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth)).toBe(true);
      await page.screenshot({path:`/tmp/perch-${path==='/'?'landing':'dashboard'}-${width}.png`,fullPage:true});
    }
    expect(errors).toEqual([]);
  });
}
test('Google button callback and logout use the real API contract',async({page})=>{
  let signedIn=false;
  await page.route('**/api/config',route=>json(route,{demo:false,clientId:'test-client',nonce:'test-nonce',signedIn}));
  await page.route('https://accounts.google.com/gsi/client',route=>route.fulfill({contentType:'text/javascript',body:`window.google={accounts:{id:{initialize(options){window.loginOptions=options},renderButton(el){const b=document.createElement('button');b.textContent='Sign in with Google';b.onclick=()=>window.loginOptions.callback({credential:'test-credential'});el.append(b)},disableAutoSelect(){}}}};`}));
  await page.route('**/api/login',async route=>{expect(route.request().postDataJSON()).toEqual({credential:'test-credential'});signedIn=true;await json(route,{ok:true});});
  await page.route('**/api/logout',async route=>{expect(route.request().method()).toBe('POST');signedIn=false;await json(route,{ok:true});});
  await page.route('**/api/machines',route=>json(route,{...fixture(),demo:false}));
  await page.goto('/app');await page.getByRole('button',{name:'Sign in with Google',exact:true}).click();
  await expect(page.getByRole('heading',{name:'Studio mini',exact:true})).toBeVisible();
  await page.getByRole('button',{name:'Sign out',exact:true}).click();
  await expect(page.getByRole('heading',{name:'A little closer to your machine.'})).toBeVisible();
});

test('a late private response cannot restore the dashboard after sign-out',async({page})=>{
  let signedIn=true,requests=0,release;
  const pending=new Promise(resolve=>{release=resolve;});
  await page.route('**/api/config',route=>json(route,{demo:false,clientId:'test',nonce:'test',signedIn}));
  await page.route('https://accounts.google.com/**',route=>route.abort());
  await page.route('**/api/logout',async route=>{signedIn=false;await json(route,{ok:true});});
  await page.route('**/api/machines',async route=>{if(++requests>1)await pending;await json(route,{...fixture(),demo:false});});
  await page.goto('/app');
  await expect(page.getByRole('heading',{name:'Studio mini',exact:true})).toBeVisible();
  const refreshRequest=page.waitForRequest('**/api/machines');
  await page.getByRole('button',{name:'Refresh',exact:true}).click();await refreshRequest;
  await page.getByRole('button',{name:'Sign out',exact:true}).click();
  await expect(page.getByRole('heading',{name:'A little closer to your machine.'})).toBeVisible();
  const response=page.waitForResponse('**/api/machines');release();await (await response).finished();
  await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
  await expect(page.getByRole('heading',{name:'Studio mini',exact:true})).toHaveCount(0);
  await expect(page.getByText('website',{exact:true})).toHaveCount(0);
  await expect(page.getByRole('heading',{name:'A little closer to your machine.'})).toBeVisible();
});

test('sign-out clears private snapshots in another open tab',async({context,page})=>{
  let signedIn=true;
  await context.route('**/api/config',route=>json(route,{demo:false,clientId:'test',nonce:'test',signedIn}));
  await context.route('https://accounts.google.com/**',route=>route.abort());
  await context.route('**/api/logout',async route=>{signedIn=false;await json(route,{ok:true});});
  await context.route('**/api/machines',route=>json(route,{...fixture(),demo:false}));
  await page.goto('/app');
  await expect(page.getByRole('heading',{name:'Studio mini',exact:true})).toBeVisible();
  const other=await context.newPage();await other.goto('/app');
  await expect(other.getByRole('heading',{name:'Studio mini',exact:true})).toBeVisible();
  await page.getByRole('button',{name:'Sign out',exact:true}).click();
  for(const tab of [page,other]){
    await expect(tab.getByRole('heading',{name:'A little closer to your machine.'})).toBeVisible();
    await expect(tab.getByText('website',{exact:true})).toHaveCount(0);
  }
});

test('private data clears immediately even when sign-out cannot be confirmed',async({page})=>{
  let release;
  const pending=new Promise(resolve=>{release=resolve;});
  await page.route('**/api/config',route=>json(route,{demo:false,clientId:'test',nonce:'test',signedIn:true}));
  await page.route('**/api/machines',route=>json(route,{...fixture(),demo:false}));
  await page.route('**/api/logout',async route=>{await pending;await json(route,{error:'Unavailable'},503);});
  await page.goto('/app');
  await page.getByRole('button',{name:'Sign out',exact:true}).click();
  await expect(page.getByRole('heading',{name:'Signing out…'})).toBeVisible();
  await expect(page.getByText('website',{exact:true})).toHaveCount(0);
  release();
  await expect(page.getByText('Sign-out could not be confirmed.',{exact:false})).toBeVisible();
  await expect(page.getByRole('heading',{name:'Studio mini',exact:true})).toHaveCount(0);
});

test('a restored page hides its snapshot before checking the session',async({page})=>{
  let restore=false,release;
  const pending=new Promise(resolve=>{release=resolve;});
  await page.route('**/api/config',async route=>{if(restore)await pending;await json(route,{demo:false,clientId:'test',nonce:'test',signedIn:!restore});});
  await page.route('https://accounts.google.com/**',route=>route.abort());
  await page.route('**/api/machines',route=>json(route,{...fixture(),demo:false}));
  await page.goto('/app');
  await expect(page.getByRole('heading',{name:'Studio mini',exact:true})).toBeVisible();
  restore=true;
  await page.evaluate(()=>window.dispatchEvent(new PageTransitionEvent('pageshow',{persisted:true})));
  await expect(page.getByText('website',{exact:true})).toHaveCount(0);
  await expect(page.getByRole('heading',{name:'Checking your session…'})).toBeVisible();
  release();
  await expect(page.getByRole('heading',{name:'A little closer to your machine.'})).toBeVisible();
});

test('accessibility checks across landing, dashboard, and empty states',async({page})=>{
  for(const path of ['/','/app']){
    await page.goto(path);await expect(page.locator('h1')).toBeVisible();
    if(path==='/app')await expect(page.getByText('Heartbeat received',{exact:true})).toBeVisible();
    expect((await new AxeBuilder({page}).withTags(['wcag2a','wcag2aa','wcag21aa']).analyze()).violations).toEqual([]);
  }
  await page.getByLabel('Explore a state').selectOption('empty');
  expect((await new AxeBuilder({page}).withTags(['wcag2a','wcag2aa','wcag21aa']).analyze()).violations).toEqual([]);
});
