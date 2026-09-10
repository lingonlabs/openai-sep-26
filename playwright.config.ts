import { defineConfig } from '@playwright/test';
export default defineConfig({
  testDir:'tests/browser',fullyParallel:false,workers:1,timeout:20000,
  use:{baseURL:'http://127.0.0.1:4317',viewport:{width:1440,height:1000},trace:'retain-on-failure'},
  webServer:{command:'GATE_MODE=demo PORT=4317 pnpm journal:start',url:'http://127.0.0.1:4317/api/health',reuseExistingServer:true,timeout:15000},
});
