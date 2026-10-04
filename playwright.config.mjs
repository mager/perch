import {defineConfig} from '@playwright/test';
export default defineConfig({
  testDir:'./test/browser', fullyParallel:true, retries:0,
  use:{baseURL:'http://127.0.0.1:8787',headless:true},
  webServer:{command:'npm run demo',url:'http://127.0.0.1:8787/api/config',reuseExistingServer:!process.env.CI},
});
