'use strict';
const assert=require('node:assert/strict');
const path=require('node:path');
const {createRequire}=require('node:module');
const root=process.env.T1295_SOURCE_ROOT;
assert(root&&process.env.T1295_SERVICE_BINDING&&process.env.T1295_EVIDENCE_ROOT,'显式 owned 绑定必填');
assert.equal(process.env.T1295_POLICY_MODE,'current');
assert(['desktop','compact'].includes(process.env.T1295_STRICT_PROJECT),'只允许专用 runner 的单 project 调用');
const {defineConfig}=createRequire(path.join(root,'frontend/package.json'))('@playwright/test');
const title='T1295 release CSP page-origin WASM42 + JS eval/Function禁用 + 真实native预览导出';
const exactTitle=new RegExp(title.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')+'$');
module.exports=defineConfig({
 testDir:path.join(root,'frontend/tests/e2e'),
 testMatch:'t1295-desktop-csp-wasm-video.spec.ts',grep:exactTitle,
 workers:1,retries:0,fullyParallel:false,forbidOnly:true,
 // 原配置及正式 spec 的预算原样保留；spec 的 28_800_000ms 覆盖此默认值。
 timeout:1800000,globalTimeout:0,expect:{timeout:120000},
 outputDir:path.join(process.env.T1295_EVIDENCE_ROOT,'artifacts'),
 reporter:[['list'],['json',{outputFile:path.join(process.env.T1295_EVIDENCE_ROOT,'playwright.json')}]],
 projects:[
  {name:'desktop',use:{viewport:{width:1536,height:1024}}},
  {name:'compact',use:{viewport:{width:640,height:450}}},
 ],
 use:{headless:true,channel:'chrome',locale:'zh-CN',serviceWorkers:'block',
  actionTimeout:120000,navigationTimeout:120000,trace:'retain-on-failure',screenshot:'only-on-failure',
  launchOptions:{timeout:180000}},
});
