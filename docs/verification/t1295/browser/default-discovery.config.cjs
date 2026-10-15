const path=require('node:path'),{createRequire}=require('node:module');
const root=path.resolve(__dirname,'../../../../');
const {defineConfig}=createRequire(path.join(root,'frontend/package.json'))('@playwright/test');
module.exports=defineConfig({testDir:path.join(root,'frontend/tests/e2e'),testMatch:['t1294-model-settings-and-codex-chat.spec.ts','t1295-desktop-csp-wasm-video.spec.ts'],workers:1,retries:0,forbidOnly:true,reporter:'list',use:{baseURL:'http://127.0.0.1:9'},outputDir:path.join(__dirname,'default-discovery-artifacts')});
