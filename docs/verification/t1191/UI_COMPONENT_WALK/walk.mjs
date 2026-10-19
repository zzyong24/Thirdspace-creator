import fs from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
const N=path.dirname(new URL(import.meta.url).pathname);
const W=process.env.HARNESS_SOURCE_ROOT??'/Users/zyongzhu/.codex/worktrees/t1062-client-integration/Thirdspace-creator';
const req=createRequire(path.join(W,'frontend/package.json'));
const {chromium}=req('@playwright/test');
const tag=process.env.HARNESS_BUILD_TAG??'current';
const executablePath='/Users/zyongzhu/Library/Caches/ms-playwright/chromium-1223/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing';
const browser=await chromium.launch({headless:true,executablePath,args:['--disable-background-networking','--disable-component-update','--no-first-run','--disable-sync']});
const results=[];
async function snapshot(page){return page.evaluate(()=>{
 const rect=el=>{if(!el)return null;const r=el.getBoundingClientRect();return {x:r.x,y:r.y,width:r.width,height:r.height,top:r.top,bottom:r.bottom,right:r.right,visible:r.width>0&&r.height>0,withinViewport:r.left>=0&&r.right<=innerWidth&&r.top>=0&&r.bottom<=innerHeight};};
 const active=document.activeElement;
 return {at:new Date().toISOString(),evidence:window.__HARNESS_EVIDENCE__,prompt:document.querySelector('[data-slot="prompt-input"]')?.value,text:document.body.innerText,geometry:{innerWidth,innerHeight,devicePixelRatio,rootClientWidth:document.documentElement.clientWidth,rootScrollWidth:document.documentElement.scrollWidth,bodyScrollWidth:document.body.scrollWidth,prompt:rect(document.querySelector('[data-slot="prompt-input"]')),retry:rect(document.querySelector('[data-slot="copilot-error-retry"]')),settings:rect(document.querySelector('[data-slot="copilot-error-engine-settings-link"]'))},active:{tag:active?.tagName,name:active?.getAttribute('aria-label')??active?.textContent,slot:active?.getAttribute('data-slot'),rect:rect(active)},buttons:[...document.querySelectorAll('button')].map(b=>({name:b.getAttribute('aria-label')??b.innerText,disabled:b.disabled,slot:b.getAttribute('data-slot')})),settingsHref:document.querySelector('[data-slot="copilot-error-engine-settings-link"]')?.getAttribute('href')};
});}
async function tabTo(page,name,run){
 for(let i=0;i<30;i++){
  await page.keyboard.press('Tab');
  const active=await page.evaluate(()=>{const a=document.activeElement,r=a?.getBoundingClientRect();return {tag:a?.tagName,name:a?.getAttribute('aria-label')??a?.textContent,slot:a?.getAttribute('data-slot'),href:a?.getAttribute('href'),disabled:a?.disabled,rect:r?{x:r.x,y:r.y,width:r.width,height:r.height,right:r.right,bottom:r.bottom,withinViewport:r.left>=0&&r.right<=innerWidth&&r.top>=0&&r.bottom<=innerHeight}:null};});
  run.steps.push({at:new Date().toISOString(),action:'Tab',active});
  if(active.name===name){assert(active.rect.withinViewport,'键盘聚焦动作必须完整在当前视口内');return active;}
 }
 throw Error('30次Tab内未到达产品动作：'+name);
}
try{
 for(const scenario of ['prepare','creation'])for(const viewport of [{width:1280,height:800},{width:900,height:600}]){
  const context=await browser.newContext({viewport,serviceWorkers:'block'});
  const run={tag,scenario,viewport,zoom:'100%',at:new Date().toISOString(),browserVersion:browser.version(),executablePath,steps:[],checkpoints:[],screenshots:[],blocked:[],errors:[],consoleLogs:[],requests:[]};
  await context.route('**/*',async route=>{const url=new URL(route.request().url());if(url.hostname!=='127.0.0.1'||url.port!=='31591'){run.blocked.push({url:route.request().url(),method:route.request().method()});await route.abort('blockedbyclient');return;}await route.continue();});
  const page=await context.newPage();page.setDefaultTimeout(120000);page.setDefaultNavigationTimeout(120000);
  page.on('pageerror',error=>run.errors.push(error.stack??String(error)));page.on('console',msg=>run.consoleLogs.push({type:msg.type(),text:msg.text()}));page.on('request',r=>run.requests.push({url:r.url(),method:r.method()}));
  const shot=async(label)=>{await page.evaluate(()=>document.fonts.ready);const name=`${tag}-walk-${scenario}-${viewport.width}x${viewport.height}-${label}.png`;await page.screenshot({path:path.join(N,name)});run.screenshots.push(name);};
  const checkpoint=async(label)=>{const state=await snapshot(page);run.checkpoints.push({label,...state});console.log(JSON.stringify({scenario,viewport,label,postCalls:state.evidence.postCalls.length,prepareCalls:state.evidence.prepareCalls,submission:state.evidence.creationSubmission,geometry:state.geometry}));return state;};
  try{
   await page.goto(`http://127.0.0.1:31591/?scenario=${scenario}`,{waitUntil:'domcontentloaded'});run.steps.push({at:new Date().toISOString(),action:'访问隔离真实组件'});
   await page.getByRole('textbox',{name:'我能帮你做什么'}).waitFor({state:'visible'});
   if(scenario==='prepare'){
    await page.getByRole('textbox',{name:'我能帮你做什么'}).fill('这次明确修改');run.steps.push({at:new Date().toISOString(),action:'输入原话：这次明确修改'});
    await page.getByRole('button',{name:'提交提示给 Copilot'}).click();run.steps.push({at:new Date().toISOString(),action:'点真实产品发送按钮'});
    await page.getByText('稿件尚未准备好',{exact:true}).waitFor();
   }else{
    await page.getByText('编导引擎尚未就绪',{exact:true}).waitFor();
   }
   const before=await checkpoint('failed-before-recovery');assert.equal(before.evidence.postCalls.length,0);assert.equal(before.geometry.rootScrollWidth,before.geometry.rootClientWidth);assert(before.geometry.prompt.withinViewport,'输入框须完整可达');await shot('failed');
   if(scenario==='prepare'){
    assert.equal(before.prompt,'这次明确修改');assert.equal(await page.getByRole('button',{name:'继续本轮',exact:true}).isEnabled(),true);
    await page.getByRole('button',{name:'隔离夹具：准备拒绝',exact:true}).click();run.steps.push({at:new Date().toISOString(),action:'只将外部EditorPort.prepareForTurn夹具设为可用'});
   }else{
    assert.equal(before.settingsHref,'/settings?highlight=assistant-engine');assert.equal(await page.getByRole('button',{name:'继续本轮',exact:true}).isDisabled(),true);assert.deepEqual(before.evidence.creationSubmission,['not-submitted']);
    await tabTo(page,'检查编导引擎',run);await shot('settings-keyboard-focus');await page.keyboard.press('Enter');run.steps.push({at:new Date().toISOString(),action:'Enter触发真实组件设置入口，由next/link宿主记录而不导航'});
    const nav=await checkpoint('settings-link-activated');assert.deepEqual(nav.evidence.navigation,[{method:'link',href:'/settings?highlight=assistant-engine'}]);
    await page.getByRole('button',{name:'隔离夹具：引擎不可用',exact:true}).click();run.steps.push({at:new Date().toISOString(),action:'只将外部引擎输入夹具设ready'});
    await page.getByText('编导引擎已就绪',{exact:true}).waitFor();
   }
   const ready=await checkpoint('ready-no-automatic-post');assert.equal(ready.evidence.postCalls.length,0);assert.equal(await page.getByRole('button',{name:'继续本轮',exact:true}).isEnabled(),true);await shot('ready');
   await tabTo(page,'继续本轮',run);await shot('continue-keyboard-focus');await page.keyboard.press('Enter');run.steps.push({at:new Date().toISOString(),action:'Enter一次触发真实继续本轮按钮'});
   await page.waitForFunction(()=>window.__HARNESS_EVIDENCE__.postCalls.length===1,{},{timeout:120000});
   await page.getByText('原请求结果待确认',{exact:true}).waitFor();
   const after=await checkpoint('continued-sdk-post-503');assert.equal(after.evidence.postCalls.length,1);assert.equal(after.evidence.blockedNetwork.length,0);
   const body=after.evidence.postCalls[0].body;
   assert(body.messages.some(m=>m.role==='user'&&m.parts?.some(p=>p.type==='text'&&p.text===after.evidence.originalText)),'POST保留原话');
   if(scenario==='prepare'){assert.equal(after.evidence.prepareCalls,2);assert.deepEqual(body.chatContext.editorTarget,after.evidence.target);}else{assert.deepEqual(body.chatContext.creationTarget,after.evidence.creationTarget);assert.deepEqual(after.evidence.creationSubmission,['not-submitted','submitted-unknown']);}
   assert.equal(await page.getByRole('button',{name:'核对原请求',exact:true}).isDisabled(),true);assert.equal(after.geometry.rootScrollWidth,after.geometry.rootClientWidth);assert(after.geometry.prompt.withinViewport,'继续后输入框须完整可达');await shot('submitted-unknown');
   await fs.writeFile(path.join(N,`${tag}-walk-${scenario}-${viewport.width}x${viewport.height}-dom.html`),await page.content());
   run.status='passed-in-isolated-component-boundary';
  }catch(error){run.status='failed';run.failure=error.stack??String(error);run.failureState=await snapshot(page).catch(()=>null);await shot('failure').catch(()=>{});console.log('FAILURE',run.failure);}
  run.finishedAt=new Date().toISOString();results.push(run);await fs.writeFile(path.join(N,`${tag}-walk-browser-receipt.json`),JSON.stringify({scope:'组件隔离harness，非生产/安装PASS',tag,results},null,2));await context.close();
 }
}finally{await browser.close();await fs.writeFile(path.join(N,`${tag}-walk-browser-receipt.json`),JSON.stringify({scope:'组件隔离harness，非生产/安装PASS',tag,results},null,2));console.log(JSON.stringify(results.map(r=>({scenario:r.scenario,viewport:r.viewport,status:r.status,failure:r.failure,errors:r.errors})),null,2));}
