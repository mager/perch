import AxeBuilder from '@axe-core/playwright';
import {test,expect} from '@playwright/test';
import {demoMachines} from '../../src/demo.mjs';
const fixture=()=>({demo:true,serverTime:Date.now(),machines:demoMachines()});
async function json(route,data,status=200){await route.fulfill({status,contentType:'application/json',body:JSON.stringify(data)});}

test('sample dashboard, switching machines, and every sample state',async({page})=>{
  await page.goto('/app');
  await expect(page.getByRole('heading',{name:'Studio mini',exact:true})).toBeVisible();
  await expect(page.getByText('SAMPLE DATA',{exact:true})).toBeVisible();
  await page.getByRole('button',{name:'Lab mini',exact:true}).click();
  await expect(page.getByText('Heartbeat overdue',{exact:true})).toBeVisible();
  await expect(page.getByText('Last snapshot retained. The machine’s current state is unknown.')).toBeVisible();
  await page.getByRole('button',{name:'Studio mini',exact:true}).click();
  await page.getByLabel('Explore a state').selectOption('empty');
  await expect(page.getByRole('heading',{name:'Waiting for the first hello.'})).toBeVisible();
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

test('accessibility checks across landing, dashboard, and empty states',async({page})=>{
  for(const path of ['/','/app']){
    await page.goto(path);await expect(page.locator('h1')).toBeVisible();
    if(path==='/app')await expect(page.getByText('Heartbeat received',{exact:true})).toBeVisible();
    expect((await new AxeBuilder({page}).withTags(['wcag2a','wcag2aa','wcag21aa']).analyze()).violations).toEqual([]);
  }
  await page.getByLabel('Explore a state').selectOption('empty');
  expect((await new AxeBuilder({page}).withTags(['wcag2a','wcag2aa','wcag21aa']).analyze()).violations).toEqual([]);
});
