import fs from 'node:fs/promises';
import path from 'node:path';
import {createRequire} from 'node:module';
const N=path.dirname(new URL(import.meta.url).pathname);
const W=process.env.HARNESS_SOURCE_ROOT??'/Users/zyongzhu/.codex/worktrees/t1062-client-integration/Thirdspace-creator';
const req=createRequire(path.join(W,'frontend/package.json'));
const {chromium}=req('@playwright/test');
const tag=process.env.HARNESS_BUILD_TAG??'current';
const executablePath='/Users/zyongzhu/Library/Caches/ms-playwright/chromium-1223/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing';
const browser=await chromium.launch({headless:true,executablePath,args:['--disable-background-networking','--disable-component-update','--no-first-run','--disable-sync']});
const results=[];
try {
 for(const scenario of ['prepare','creation'])for(const viewport of [{width:1280,height:800},{width:900,height:600}]){
  const context=await browser.newContext({viewport,serviceWorkers:'block'});
  const blocked=[];const errors=[];const consoleLogs=[];const requests=[];
  await context.route('**/*',async route=>{const url=new URL(route.request().url());if(url.hostname!=='127.0.0.1'||url.port!=='31591'){blocked.push({url:route.request().url(),method:route.request().method()});await route.abort('blockedbyclient');return;}await route.continue();});
  const page=await context.newPage();page.setDefaultTimeout(120000);page.setDefaultNavigationTimeout(120000);
  page.on('pageerror',error=>{errors.push(error.stack??String(error));console.log('PAGEERROR',error.stack??String(error));});page.on('console',msg=>consoleLogs.push({type:msg.type(),text:msg.text()}));page.on('request',request=>requests.push({url:request.url(),method:request.method()}));
  const run={tag,scenario,viewport,at:new Date().toISOString(),browserVersion:browser.version(),executablePath,blocked,errors,consoleLogs,requests};
  try{
   await page.goto(`http://127.0.0.1:31591/?scenario=${scenario}`,{waitUntil:'domcontentloaded'});
   await page.getByRole('textbox',{name:'我能帮你做什么'}).waitFor({state:'visible'});
   if(scenario==='prepare'){
    await page.getByRole('textbox',{name:'我能帮你做什么'}).fill('这次明确修改');
    await page.getByRole('button',{name:'提交提示给 Copilot'}).click();
    await page.waitForFunction(()=>window.__HARNESS_EVIDENCE__.prepareCalls===1,{},{timeout:120000});
   }else{
    await page.waitForFunction(()=>window.__HARNESS_EVIDENCE__.creationSubmission.length>=1,{},{timeout:120000});
   }
   await page.evaluate(()=>document.fonts.ready);
   run.afterFailure=await page.evaluate(()=>({evidence:window.__HARNESS_EVIDENCE__,prompt:document.querySelector('[data-slot="prompt-input"]')?.value,visibleText:document.body.innerText,errorPanel:document.querySelector('[data-slot="copilot-error"]')?.outerHTML??null,buttons:[...document.querySelectorAll('button')].map(b=>({name:b.getAttribute('aria-label')??b.innerText,disabled:b.disabled,slot:b.getAttribute('data-slot')}))}));
   const stem=`${tag}-${scenario}-${viewport.width}x${viewport.height}`;
   run.screenshot=stem+'.png';await page.screenshot({path:path.join(N,run.screenshot)});
   await fs.writeFile(path.join(N,stem+'-dom.html'),await page.content());
   run.status='captured';
  }catch(error){run.status='failed';run.error=String(error);run.screenshot=`${tag}-${scenario}-${viewport.width}x${viewport.height}-failure.png`;await page.screenshot({path:path.join(N,run.screenshot)}).catch(()=>{});}
  run.finishedAt=new Date().toISOString();results.push(run);await context.close();
 }
}finally{await browser.close();await fs.writeFile(path.join(N,`${tag}-browser-receipt.json`),JSON.stringify({scope:'组件隔离harness，非生产/安装PASS',tag,results},null,2));console.log(JSON.stringify(results.map(r=>({scenario:r.scenario,viewport:r.viewport,status:r.status,error:r.error,pageErrors:r.errors,submission:r.afterFailure?.evidence.postCalls.length,prepareCalls:r.afterFailure?.evidence.prepareCalls,creationSubmission:r.afterFailure?.evidence.creationSubmission,errorPanelPresent:Boolean(r.afterFailure?.errorPanel)})),null,2));}
