'use strict';
const fs=require('node:fs'),path=require('node:path'),{createRequire}=require('node:module');
const bindingPath=process.argv[2];if(!bindingPath)throw Error('OWNED_BINDING_REQUIRED');const b=JSON.parse(fs.readFileSync(bindingPath,'utf8')),rq=createRequire(path.join(b.sourceRoot,'frontend/package.json')),{chromium}=rq('@playwright/test');
const out=path.join(b.evidenceRoot,'zoom-scroll-proof-'+Date.now());fs.mkdirSync(out,{mode:0o700});
const refused=[],requests=[];let browser,context;
async function op(id,input={},groupId){const response=await fetch(b.baseURL+'/api/v1/dispatch',{method:'POST',headers:{'Content-Type':'application/json',...(groupId?{'x-group-id':groupId}:{})},body:JSON.stringify({id,input}),signal:AbortSignal.timeout(120000)});if(!response.ok)throw Error(id+' HTTP '+response.status);return (await response.json()).data;}
(async()=>{
 const owned=JSON.parse(fs.readFileSync(path.join(b.ownedRoot,'owner.json'),'utf8'));if(owned.uid!==process.getuid()||owned.task!=='T-1294')throw Error('OWNED_UID_MISMATCH');
 const groups=await op('accountGroups.list',{query:{page:1,pageSize:100}});let groupId;
 for(const group of groups){if(!group.name.startsWith('T1294隔离验收-'))continue;const conversations=await op('ai.conversations.list',{query:{page:1,pageSize:20}},group.id);if(!conversations.length){groupId=group.id;break;}}
 if(!groupId)throw Error('NO_EXISTING_EMPTY_OWNED_GROUP_NO_CREATE');
 browser=await chromium.launch({headless:true,timeout:180000});context=await browser.newContext({baseURL:b.baseURL,viewport:{width:640,height:450},deviceScaleFactor:2,locale:'zh-CN',serviceWorkers:'block'});
 await context.route('**/*',async route=>{const req=route.request(),url=new URL(req.url());if(['data:','blob:','about:'].includes(url.protocol)){await route.continue();return;}const id=url.pathname==='/api/v1/dispatch'&&req.method()==='POST'?req.postDataJSON()?.id:'';const write=id&&/(?:^|\.)(?:create|put|patch|update|delete|remove|cancel|confirm|command|reserve|bootstrap|apply)(?:\.|$)/i.test(id);if(url.origin!==b.baseURL||url.pathname==='/api/chat'&&req.method()==='POST'||write){refused.push({method:req.method(),path:url.pathname,operation:id||null});await route.abort();return;}requests.push({method:req.method(),path:url.pathname,operation:id||null});await route.continue();});
 await context.addCookies([{name:'creatoros_current_group',value:encodeURIComponent(groupId),url:b.baseURL}]);await context.addInitScript(id=>{localStorage.setItem('creatoros:current-group',id);localStorage.removeItem('creatoros:current-account');localStorage.setItem('creatoros:onboarding:hidden','1');},groupId);
 const page=await context.newPage();page.setDefaultTimeout(120000);page.setDefaultNavigationTimeout(300000);await page.goto(b.baseURL+'/accounts?copilot=open');await page.locator('[data-slot="ai-copilot-dialog"]').waitFor({state:'visible'});
 const measure=()=>{
  const targets={title:'#ai-copilot-title',input:'textarea[aria-label="我能帮你做什么"]',send:'[data-slot="submit-button"]',close:'[data-slot="ai-copilot-close"]'};
  const rows=Object.entries(targets).map(([name,selector])=>{const element=document.querySelector(selector);if(!element)return {name,selector,exists:false,inViewport:false};const r=element.getBoundingClientRect(),c=getComputedStyle(element);return {name,selector,exists:true,rect:{x:r.x,y:r.y,width:r.width,height:r.height,right:r.right,bottom:r.bottom},inViewport:r.width>0&&r.height>0&&r.x>=0&&r.y>=0&&r.right<=innerWidth&&r.bottom<=innerHeight,css:{display:c.display,visibility:c.visibility,overflow:c.overflow,position:c.position}};});
  const panel=document.querySelector('[data-overlay-panel="copilot"]');const p=panel?.getBoundingClientRect();return {innerWidth,innerHeight,devicePixelRatio,htmlZoom:getComputedStyle(document.documentElement).zoom,documentScrollWidth:document.documentElement.scrollWidth,panel:p?{x:p.x,y:p.y,width:p.width,height:p.height,right:p.right,bottom:p.bottom}:null,rows};
 };
 const result=await page.evaluate(measure);
 await page.screenshot({path:path.join(out,'assistant-css640x450-dsf2.png'),fullPage:false,animations:'disabled',caret:'hide',timeout:120000});
 await page.locator('[data-slot="submit-button"]').scrollIntoViewIfNeeded({timeout:120000});
 const afterScroll=await page.evaluate(measure);
 await page.screenshot({path:path.join(out,'assistant-after-original-inner-scroll.png'),fullPage:false,animations:'disabled',caret:'hide',timeout:120000});
 const report={...result,afterScroll,groupId,modelsStarted:0,configWrites:0,newTasks:0,refused,requests,status:result.rows.every(x=>x.inViewport)&&refused.length===0?'GEOMETRY_PASS_PENDING_VISUAL_REVIEW':'FAIL',priorCssZoom2FailurePreserved:true};fs.writeFileSync(path.join(out,'geometry.json'),JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify({out,...report,requests:undefined}));if(report.status==='FAIL')process.exitCode=1;
})().catch(e=>{fs.writeFileSync(path.join(out,'failure.json'),JSON.stringify({error:e.message,refused,modelsStarted:0,newTasks:0},null,2)+'\n');console.error(e.message);process.exitCode=1;}).finally(async()=>{await context?.close();await browser?.close();fs.writeFileSync(path.join(out,'browser-close.json'),JSON.stringify({contextClosed:true,browserClosed:true,serverStopped:false},null,2)+'\n');});
