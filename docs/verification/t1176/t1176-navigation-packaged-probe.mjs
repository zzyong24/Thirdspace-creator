import { mkdtempSync, mkdirSync, writeFileSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { createHash, randomBytes } from 'node:crypto';
import { spawn } from 'node:child_process';
import net from 'node:net';
import { chromium } from '/Users/zyongzhu/.codex/worktrees/t1062-client-integration/Thirdspace-creator/frontend/node_modules/@playwright/test/index.mjs';
import { resolveChromiumExecutable } from '/Users/zyongzhu/.codex/worktrees/t1062-client-integration/Thirdspace-creator/ai-worker/src/runtime/browser/browser-launch.ts';
import { buildLocalPackageEnv } from '/Users/zyongzhu/.codex/worktrees/t1062-client-integration/Thirdspace-creator/frontend/scripts/desktop/package-local.mjs';
import { createBuildSmokeVerdictToken } from '/Users/zyongzhu/.codex/worktrees/t1062-client-integration/Thirdspace-creator/frontend/scripts/desktop/verdict-key-material.mjs';
import { buildSmokeSidecarEnv } from '/Users/zyongzhu/.codex/worktrees/t1062-client-integration/Thirdspace-creator/frontend/scripts/desktop/obfuscate.mjs';
const w='/Users/zyongzhu/.codex/worktrees/t1062-client-integration/Thirdspace-creator',n='/Users/zyongzhu/.codex/creatoros-verification/t1117-20261009',runtime=join(w,'frontend/src-tauri/sidecar');
const root=mkdtempSync(join(n,'t1176-navigation-recovery-isolation-'));const dir=name=>{const p=join(root,name);mkdirSync(p,{recursive:true,mode:0o700});return p;};
const handshake=randomBytes(24).toString('hex');
const base={...buildLocalPackageEnv(),CREATOROS_SIDECAR_HANDSHAKE_TOKEN:handshake,CREATOROS_APP_DATA_DIR:root,CREATOROS_DOUYIN_AUTH_DIR:dir('auth-douyin'),CREATOROS_WEB_AUTH_DIR:dir('auth-web'),CREATOROS_MASTER_KEY:randomBytes(32).toString('base64'),CREATOROS_BROWSERS_DIR:join(runtime,'frontend/browsers'),PLAYWRIGHT_BROWSERS_PATH:join(runtime,'frontend/browsers')};
const port=await new Promise((resolve,reject)=>{const s=net.createServer();s.on('error',reject);s.listen(0,'127.0.0.1',()=>{const p=s.address().port;s.close(()=>resolve(p));});});
const env=buildSmokeSidecarEnv(base,{port,token:createBuildSmokeVerdictToken({sidecarPort:port},base),smokeDataRoot:root,libDir:join(runtime,'lib')});
const head=(await import('node:child_process')).execFileSync('git',['rev-parse','HEAD'],{cwd:w,encoding:'utf8'}).trim();const startedAt=new Date().toISOString();const child=spawn(process.execPath,[join(runtime,'frontend/server.js')],{cwd:join(runtime,'frontend'),env,stdio:['pipe','pipe','pipe']});let out='',err='';child.stdout.on('data',x=>out+=x);child.stderr.on('data',x=>err+=x);const exited=new Promise(resolve=>child.once('exit',(code,signal)=>resolve({code,signal})));let browser;const observed={};
try{
 const deadline=Date.now()+120000;let ready=false;
 while(Date.now()<deadline){if(child.exitCode!==null)throw new Error('sidecar提前退出');if(out.includes('[CreatorOS] SIDECAR_STARTUP_VERIFIED')){ready=true;break;}await new Promise(r=>setTimeout(r,150));}
 if(!ready)throw new Error('instrumentation实际未就绪');
 const url='http://127.0.0.1:'+port+'/';const response=await fetch(url,{signal:AbortSignal.timeout(120000)});observed.httpStatus=response.status;observed.renderedUrl=response.url;if(response.status!==200)throw new Error('页面真实状态不是200');await response.text();
 process.env.PLAYWRIGHT_BROWSERS_PATH=base.PLAYWRIGHT_BROWSERS_PATH;const executablePath=await resolveChromiumExecutable();if(!executablePath?.startsWith(join(runtime,'frontend/browsers/')+'chromium-1223/'))throw new Error('生产resolver未选择精确随包1223');
 observed.executablePath=executablePath;observed.executableSha256=createHash('sha256').update(readFileSync(executablePath)).digest('hex');
 browser=await chromium.launch({executablePath,headless:true,timeout:120000});const page=await browser.newPage({viewport:{width:1280,height:720}});const groupReads=[];page.on('response',response=>{const request=response.request();if(request.url().endsWith('/api/v1/dispatch')&&request.postDataJSON()?.id==='accountGroups.list')groupReads.push({operation:'accountGroups.list',status:response.status()});});page.setDefaultTimeout(120000);page.setDefaultNavigationTimeout(120000);const pageErrors=[];page.on('pageerror',e=>pageErrors.push(e.message));
 await page.addInitScript(value=>{window.__CREATOROS_HANDSHAKE_TOKEN__=value;},handshake);
 await page.goto(url,{waitUntil:'networkidle',timeout:120000});
 await page.locator('[data-testid=workspace-initialization-loading]').waitFor({state:'hidden',timeout:120000});
 if(await page.locator('[data-testid=workspace-initialization-error]').count())throw new Error('fresh工作区未开放');
 const nav=page.getByRole('navigation',{name:'主要导航'});
 const expected=[['首页','/'],['创作者总览','/overview'],['定位中心','/positioning'],['内容雷达','/intelligence'],['选题','/topics'],['项目','/projects'],['知识库','/knowledge'],['素材中心','/assets'],['创作画布','/canvases'],['发布中心','/publishing'],['运营分析','/daily-report'],['自动化','/automations'],['设置','/settings']];
 observed.navigation=await nav.getByRole('link').evaluateAll(links=>links.map(link=>[link.textContent.trim(),link.getAttribute('href')]));
 if(JSON.stringify(observed.navigation)!==JSON.stringify(expected))throw new Error('13个真实导航与现合同不符');
 const rootHandle=await page.locator('[data-slot=page-scroll-area]').elementHandle();
 const viewportHandle=await page.locator('[data-slot=page-scroll-area] > [data-slot=scroll-area-viewport]').elementHandle();
 const sample=async name=>{
  const layout=await page.evaluate(()=>{
   const root=document.querySelector('[data-slot=page-scroll-area]'),viewport=root?.querySelector(':scope > [data-slot=scroll-area-viewport]'),content=root?.querySelector('[data-slot=app-page-content]');
   if(!root||!viewport||!content)throw new Error('真实页面滚动容器缺失');
   const css=getComputedStyle(viewport);
   return {url:location.pathname,fill:root.getAttribute('data-fill'),rootCount:document.querySelectorAll('[data-slot=page-scroll-area]').length,contentCount:document.querySelectorAll('[data-slot=app-page-content]').length,overflowY:css.overflowY,clientHeight:viewport.clientHeight,scrollHeight:viewport.scrollHeight,scrollTop:viewport.scrollTop,bodyClientHeight:document.documentElement.clientHeight,bodyScrollHeight:document.documentElement.scrollHeight,scrollbarDisplays:[...root.querySelectorAll(':scope > [data-slot=scroll-area-scrollbar]')].map(x=>getComputedStyle(x).display),internalScrollRegions:[...content.querySelectorAll('*')].filter(x=>['auto','scroll'].includes(getComputedStyle(x).overflowY)).map(x=>({slot:x.getAttribute('data-slot'),clientHeight:x.clientHeight,scrollHeight:x.scrollHeight,overflowY:getComputedStyle(x).overflowY}))};
  });
  const sameRoot=await rootHandle.evaluate(root=>root.isConnected&&root===document.querySelector('[data-slot=page-scroll-area]'));
  const sameViewport=await viewportHandle.evaluate(viewport=>viewport.isConnected&&viewport===document.querySelector('[data-slot=page-scroll-area] > [data-slot=scroll-area-viewport]'));
  if(!sameRoot||!sameViewport||layout.rootCount!==1||layout.contentCount!==1)throw new Error('原滚动容器被导航卸载/重复');
  if(layout.fill==='true'&&(layout.overflowY!=='hidden'||layout.scrollbarDisplays.some(x=>x!=='none')))throw new Error('填满模式外层仍可滚动');
  if(layout.fill!=='true'&&!['scroll','auto'].includes(layout.overflowY))throw new Error('普通模式外层不能滚动');
  await page.screenshot({path:join(n,'t1176-navigation-'+name+'.png')});return{...layout,sameRoot,sameViewport};
 };
 observed.layout=[await sample('home-before')];
 await nav.getByRole('link',{name:'内容雷达',exact:true}).click();await page.waitForURL('**/intelligence',{timeout:120000});
 await page.locator('[data-slot=page-scroll-area][data-fill=true]').waitFor({state:'visible',timeout:120000});
 await page.waitForTimeout(600);observed.layout.push(await sample('intelligence-fill'));
 const box=await page.locator('[data-slot=app-page-content]').boundingBox();await page.mouse.move(box.x+box.width/2,box.y+box.height/2);await page.mouse.wheel(0,800);await page.waitForTimeout(300);
 observed.fillAfterWheel=await viewportHandle.evaluate(x=>x.scrollTop);if(observed.fillAfterWheel!==0)throw new Error('填满工作台滚轮误滚外层');
 await nav.getByRole('link',{name:'首页',exact:true}).click();await page.waitForURL(url,{timeout:120000});await page.locator('[data-slot=page-scroll-area][data-fill=false]').waitFor({state:'visible',timeout:120000});
 await page.waitForTimeout(400);observed.layout.push(await sample('home-after'));
 const homebox=await page.locator('[data-slot=app-page-content]').boundingBox();await page.mouse.move(homebox.x+homebox.width/2,homebox.y+Math.min(200,homebox.height/2));await page.mouse.wheel(0,900);await page.waitForTimeout(400);
 observed.homeAfterWheel=await viewportHandle.evaluate(x=>({scrollTop:x.scrollTop,maxScroll:x.scrollHeight-x.clientHeight}));
 if(observed.homeAfterWheel.maxScroll>0&&observed.homeAfterWheel.scrollTop<=0)throw new Error('返回普通页面后滚轮不能滚动');
 if(pageErrors.length)throw new Error('真实页面出现JS错误：'+JSON.stringify(pageErrors));
 observed.groupReads=groupReads;observed.browserVersion=browser.version();observed.pageErrorCount=pageErrors.length;
 const dispatch=await fetch('http://127.0.0.1:'+port+'/api/v1/dispatch',{method:'POST',headers:{'content-type':'application/json','x-creatoros-handshake':handshake},body:JSON.stringify({id:'smoke.noop',input:{}}),signal:AbortSignal.timeout(120000)});observed.dispatchStatus=dispatch.status;await dispatch.text();if(dispatch.status>=500&&/Cannot find module|ERR_MODULE|ChunkLoadError|is not a function/i.test(err))throw new Error('原dispatch运行时断言失败');
 if(/降级 master key|未取到 master key/.test(err))throw new Error('隔离宿主注入未生效');observed.masterKeyDevelopmentFallback=false;
}finally{
 if(browser)await browser.close();child.kill('SIGTERM');const exit=await Promise.race([exited,new Promise((_,reject)=>setTimeout(()=>reject(new Error('sidecar清理未完成')),120000).unref())]);observed.sidecarExit=exit;writeFileSync(join(n,'t1176-navigation-packaged-recovery-sidecar.log'),out+'\n'+err,{flag:'wx',mode:0o600});
}
const record={head,startedAt,finishedAt:new Date().toISOString(),observed,nodeExecutable:process.execPath,isolationRoot:root,nativeApp:false,realUserDataUsed:false,modelCalled:false,realPlatformCalled:false,scope:'T1176现5a新包隔离Node/full Chromium真实13导航，首页→内容雷达contentFill→首页，浏览器计算样式/滚轮与同滚动容器身份；不签原生安装、真人平台、数据充满时的内部滚动或全功能。'};
writeFileSync(join(n,'t1176-navigation-packaged-recovery-result.json'),JSON.stringify(record,null,2)+'\n',{flag:'wx',mode:0o600});console.log(JSON.stringify({head:record.head,observed,nodeExecutable:record.nodeExecutable,nativeApp:false,realUserDataUsed:false}));
