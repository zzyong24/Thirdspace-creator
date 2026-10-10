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
const root=mkdtempSync(join(n,'t1180-upload-corrected-recovery-isolation-'));const dir=name=>{const p=join(root,name);mkdirSync(p,{recursive:true,mode:0o700});return p;};
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
 await page.locator('a[href="/accounts"]').first().click();await page.waitForURL('**/accounts',{timeout:120000});
 await page.getByLabel('新账号组名称',{exact:true}).fill('T1179 上传验收 A');
 await page.getByRole('button',{name:'创建账号组',exact:true}).click();
 await page.getByRole('button',{name:'进入此账号组',exact:true}).waitFor({state:'visible',timeout:120000});
 await page.getByRole('button',{name:'进入此账号组',exact:true}).click();
 await page.getByRole('navigation',{name:'主要导航'}).getByRole('link',{name:'首页',exact:true}).click();await page.waitForURL(url,{timeout:120000});
 await page.locator('[data-testid=workspace-initialization-loading]').waitFor({state:'hidden',timeout:120000});
 observed.isolatedGroupCreatedThroughUI=true;
 const network=[],uploadResponses=[],pendingNetwork=[];
 page.on('response',response=>{
  const request=response.request(),pathname=new URL(request.url()).pathname;
  if(pathname==='/api/v1/dispatch'){
   const body=request.postDataJSON();if(!['assets.uploads.create','assets.uploads.complete'].includes(body?.id))return;
   const headers=request.headers();network.push({operation:body.id,status:response.status(),groupId:headers['x-group-id']??null,accountId:headers['x-account-id']??null,input:body.input});
   if(body.id==='assets.uploads.complete')pendingNetwork.push(response.json().then(envelope=>uploadResponses.push(envelope.data)));
  }else if(request.method()==='PUT'&&pathname.startsWith('/api/v1/blob/')){
   const body=request.postDataBuffer();network.push({operation:'bytes.put',status:response.status(),pathname,requestBodyAvailable:body!==null&&body!==undefined,bytes:body?.length??null,sha256:body!==null&&body!==undefined?createHash('sha256').update(body).digest('hex'):null});
  }
 });
 const nav=page.getByRole('navigation',{name:'主要导航'});
 const goAssets=async()=>{await nav.getByRole('link',{name:'素材中心',exact:true}).click();await page.waitForURL('**/assets',{timeout:120000});await page.locator('[data-testid=workspace-initialization-loading]').waitFor({state:'hidden',timeout:120000});};
 await goAssets();const groupA=await page.evaluate(()=>localStorage.getItem('creatoros:current-group'));if(!groupA)throw Error('UI尚未选择A组');
 const expectedFiles=['t1179-neutral.png','t1179-neutral.mp4'].map(name=>{const bytes=readFileSync(join(n,name));return{name,bytes:bytes.length,sha256:createHash('sha256').update(bytes).digest('hex')};});
 for(const file of expectedFiles){
  const before=network.length;await page.locator('[data-slot=assets-upload-input]').first().setInputFiles(join(n,file.name));await page.getByText('已上传素材「'+file.name+'」。',{exact:true}).waitFor({state:'visible',timeout:120000});await page.getByText(file.name,{exact:true}).first().waitFor({state:'visible',timeout:120000});await Promise.all(pendingNetwork);
  const actual=network.slice(before);if(JSON.stringify(actual.map(x=>x.operation))!==JSON.stringify(['assets.uploads.create','bytes.put','assets.uploads.complete']))throw Error('真实上传顺序不是create→PUT→complete');
  if(actual.some(x=>x.status!==200))throw Error('真实上传非200');if(actual.filter(x=>x.operation!=='bytes.put').some(x=>x.groupId!==groupA||x.accountId!==null))throw Error('真实请求归属泄漏');
  const put=actual.find(x=>x.operation==='bytes.put');if(put.requestBodyAvailable&&(put.bytes!==file.bytes||put.sha256!==file.sha256))throw Error('上传字节SHA不相等');
 }
 observed.network=network;observed.files=expectedFiles;
 await page.screenshot({path:join(n,'t1180-upload-corrected-group-a.png')});await page.reload({waitUntil:'networkidle',timeout:120000});for(const file of expectedFiles)await page.getByText(file.name,{exact:true}).first().waitFor({state:'visible',timeout:120000});
 const read=async(id,input,groupId)=>{const response=await fetch(url+'api/v1/dispatch',{method:'POST',headers:{'content-type':'application/json','x-creatoros-handshake':handshake,'x-group-id':groupId},body:JSON.stringify({id,input}),signal:AbortSignal.timeout(120000)});const envelope=await response.json();if(response.status!==200)throw Error(id+'真实回读失败：'+response.status);return envelope.data;};
 const downloads=[];
 for(const file of expectedFiles){const found=uploadResponses.find(x=>x.name===file.name);if(!found)throw Error('真实完成回执缺素材');const asset=await read('assets.get',{params:{assetId:found.id}},groupA);if(asset.name!==file.name||asset.fileSize!==file.bytes)throw Error('正式素材回读不符');const signed=await read('assets.fileDownloadUrl',{params:{assetId:asset.id,assetFileId:asset.currentFileId}},groupA);const response=await fetch(new URL(signed.url,url),{signal:AbortSignal.timeout(120000)});if(response.status!==200)throw Error('真实文件下载失败');const bytes=Buffer.from(await response.arrayBuffer()),sha256=createHash('sha256').update(bytes).digest('hex');if(bytes.length!==file.bytes||sha256!==file.sha256)throw Error('持久文件下载SHA不符');downloads.push({assetId:asset.id,fileId:asset.currentFileId,name:asset.name,mimeType:asset.mimeType,fileSize:asset.fileSize,durationMs:asset.durationMs,width:asset.width,height:asset.height,downloadStatus:response.status,downloadBytes:bytes.length,sha256});}
 observed.publicReadDownloads=downloads;observed.reloadPreservedBothFiles=true;
 await page.locator('a[href="/accounts"]').first().click();await page.waitForURL('**/accounts',{timeout:120000});
 await page.getByLabel('新账号组名称',{exact:true}).fill('T1179 上传验收 B');await page.getByRole('button',{name:'创建账号组',exact:true}).click();await page.getByRole('button',{name:'进入此账号组',exact:true}).waitFor({state:'visible',timeout:120000});await page.getByRole('button',{name:'进入此账号组',exact:true}).click();await goAssets();
 const groupB=await page.evaluate(()=>localStorage.getItem('creatoros:current-group'));if(!groupB||groupB===groupA)throw Error('UI没有切至不同组');
 const otherAssets=await read('assets.list',{query:{page:1,pageSize:24}},groupB);if(!Array.isArray(otherAssets)||otherAssets.length!==0)throw Error('B组出现非空库存');for(const file of expectedFiles)if(await page.getByText(file.name,{exact:true}).count())throw Error('A组素材在B组混入');
 observed.secondGroupEmptyThroughUIAndPublicRead=true;await page.screenshot({path:join(n,'t1180-upload-corrected-group-b.png')});
 await page.locator('a[href="/accounts"]').first().click();await page.waitForURL('**/accounts',{timeout:120000});await page.getByText('T1179 上传验收 A',{exact:true}).first().click();await page.getByRole('button',{name:'进入此账号组',exact:true}).click();await goAssets();for(const file of expectedFiles)await page.getByText(file.name,{exact:true}).first().waitFor({state:'visible',timeout:120000});
 observed.returnToOriginalGroupPreservedBothFiles=true;await page.screenshot({path:join(n,'t1180-upload-corrected-return-a.png')});if(pageErrors.length)throw Error('真实页面JS错误：'+JSON.stringify(pageErrors));observed.browserVersion=browser.version();observed.pageErrorCount=pageErrors.length;
 const dispatch=await fetch('http://127.0.0.1:'+port+'/api/v1/dispatch',{method:'POST',headers:{'content-type':'application/json','x-creatoros-handshake':handshake},body:JSON.stringify({id:'smoke.noop',input:{}}),signal:AbortSignal.timeout(120000)});observed.dispatchStatus=dispatch.status;await dispatch.text();if(dispatch.status>=500&&/Cannot find module|ERR_MODULE|ChunkLoadError|is not a function/i.test(err))throw new Error('原dispatch运行时断言失败');
 if(/降级 master key|未取到 master key/.test(err))throw new Error('隔离宿主注入未生效');observed.masterKeyDevelopmentFallback=false;
}finally{
 if(browser)await browser.close();child.kill('SIGTERM');const exit=await Promise.race([exited,new Promise((_,reject)=>setTimeout(()=>reject(new Error('sidecar清理未完成')),120000).unref())]);observed.sidecarExit=exit;writeFileSync(join(n,'t1180-upload-corrected-packaged-recovery-sidecar.log'),out+'\n'+err,{flag:'wx',mode:0o600});
}
const record={head,startedAt,finishedAt:new Date().toISOString(),observed,nodeExecutable:process.execPath,isolationRoot:root,nativeApp:false,realUserDataUsed:false,modelCalled:false,realPlatformCalled:false,scope:'T1180校正私有请求体观测，缺body按未知；两媒体公开下载严格size/SHA；T1179现5a产品包隔离Node/full Chromium，UI建纯组→中性PNG/MP4真实上传及回读下载SHA→刷新→不同纯组无混入→返回原组；无真实平台/模型/数据或原生App，不签工程导入/全功能。'};
writeFileSync(join(n,'t1180-upload-corrected-packaged-recovery-result.json'),JSON.stringify(record,null,2)+'\n',{flag:'wx',mode:0o600});console.log(JSON.stringify({head:record.head,observed,nodeExecutable:record.nodeExecutable,nativeApp:false,realUserDataUsed:false}));
