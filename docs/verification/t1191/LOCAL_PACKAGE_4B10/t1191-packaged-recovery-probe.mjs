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
const root=mkdtempSync(join(n,'t1191-recovery-isolation-'));const dir=name=>{const p=join(root,name);mkdirSync(p,{recursive:true,mode:0o700});return p;};
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
 await page.goto(url,{waitUntil:'networkidle',timeout:120000});await page.waitForTimeout(750);const text=await page.locator('body').innerText();if(pageErrors.length||/This page couldn['’]t load|Reload to try again,? or go back/i.test(text))throw new Error('原页面hydration断言失败：'+JSON.stringify(pageErrors));
 const recovery=page.locator('[data-testid=workspace-initialization-error]');await recovery.waitFor({state:'visible',timeout:120000});
 const recoveryText=await recovery.innerText();if(!recoveryText.includes('登录状态已失效或没有权限,请重新登录后再试。')||/forbidden|request must originate/.test(recoveryText))throw new Error('原公共403恢复反馈仍未转中文');
 if(!groupReads.some(x=>x.status===403))throw new Error('没有真实公共403回执');observed.recoveryText=recoveryText;observed.initialDenied=true;
 await page.screenshot({path:join(n,'t1191-packaged-recovery-before-retry.png')});
 await page.evaluate(value=>{window.__CREATOROS_HANDSHAKE_TOKEN__=value;},handshake);
 await page.getByRole('button',{name:'重试打开工作区',exact:true}).click();
 await recovery.waitFor({state:'hidden',timeout:120000});await page.locator('[data-testid=workspace-initialization-loading]').waitFor({state:'hidden',timeout:120000});
 if(!groupReads.some(x=>x.status===200))throw new Error('原重试没有实际公共list成功');
 observed.groupReads=groupReads;observed.retryOpenedWorkspace=true;observed.workspaceErrorCount=await recovery.count();if(observed.workspaceErrorCount)throw new Error('原重试后工作区仍有错误');
 observed.browserHydrated=true;observed.pageErrorCount=pageErrors.length;observed.browserVersion=browser.version();observed.pageTextSha256=createHash('sha256').update(text).digest('hex');await page.screenshot({path:join(n,'t1191-packaged-recovery-page.png')});
 const dispatch=await fetch('http://127.0.0.1:'+port+'/api/v1/dispatch',{method:'POST',headers:{'content-type':'application/json','x-creatoros-handshake':handshake},body:JSON.stringify({id:'smoke.noop',input:{}}),signal:AbortSignal.timeout(120000)});observed.dispatchStatus=dispatch.status;await dispatch.text();if(dispatch.status>=500&&/Cannot find module|ERR_MODULE|ChunkLoadError|is not a function/i.test(err))throw new Error('原dispatch运行时断言失败');
 if(/降级 master key|未取到 master key/.test(err))throw new Error('隔离宿主注入未生效');observed.masterKeyDevelopmentFallback=false;
}finally{
 if(browser)await browser.close();child.kill('SIGTERM');const exit=await Promise.race([exited,new Promise((_,reject)=>setTimeout(()=>reject(new Error('sidecar清理未完成')),120000).unref())]);observed.sidecarExit=exit;writeFileSync(join(n,'t1191-packaged-recovery-sidecar.log'),out+'\n'+err,{flag:'wx',mode:0o600});
}
const record={head,startedAt,finishedAt:new Date().toISOString(),observed,nodeExecutable:process.execPath,isolationRoot:root,nativeApp:false,realUserDataUsed:false,modelCalled:false,realPlatformCalled:false,scope:'T1191当前随包Node/full Chromium1280×720真实公共403恢复中文；之后才提供与现Rust相同格式的新随机握手，点原重试，原账号组list200才开放真实隔离主页。没有mock/模型/真人profile/数据库直写；不签原生App/真人激活/全功能。'};
writeFileSync(join(n,'t1191-packaged-recovery-result.json'),JSON.stringify(record,null,2)+'\n',{flag:'wx',mode:0o600});console.log(JSON.stringify({head:record.head,observed,nodeExecutable:record.nodeExecutable,nativeApp:false,realUserDataUsed:false}));
