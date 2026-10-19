// 独立只读诊断工具；不改产品/原用例，不签原170通过。
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const crypto = require('node:crypto');
const { createRequire } = require('node:module');
const net = require('node:net');
const { spawn, execFileSync } = require('node:child_process');
const root = '/Users/zyongzhu/.codex/worktrees/integrated-dev-acceptance/Thirdspace-creator';
const frozen = '533224f334c43cdb81a344424e420cad93784dd1';
const run = path.join(root, 'docs/verification/t1246/settings-history-diagnosis');
const port = 61348, origin = `http://127.0.0.1:${port}`;
const hash = file => crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
const source = JSON.parse(fs.readFileSync(path.join(root,'docs/verification/t1246/source-inventory-before.json'),'utf8'));
const workers = JSON.parse(fs.readFileSync(path.join(root,'docs/verification/t1246/round-1/533224f/browser-original-dr005/next-launch.json'),'utf8')).workerDistFiles;
function verify() {
  if(execFileSync('git',['rev-parse','HEAD'],{cwd:root,encoding:'utf8'}).trim()!==frozen) throw Error('HEAD drift');
  const rows=[...source.other_changes,...source.same_as_codex];
  if(rows.length!==253||workers.length!==11) throw Error('Inventory count drift');
  for(const row of rows)if(hash(path.join(root,row.path))!==row.sha256)throw Error(`Source drift: ${row.path}`);
  for(const row of workers)if(hash(path.join(root,'ai-worker/dist',row.file))!==row.sha256)throw Error(`Worker drift: ${row.file}`);
  return {sourceCount:rows.length,workerCount:workers.length,errors:[]};
}
function safeUrl(value) {try {const u=new URL(value);return u.origin===origin?u.pathname+u.search:u.protocol==='about:'?u.href:u.origin;}catch{return 'invalid';}}
let server, browser, data, logFd, outer, stopPromise;
const result={schema:1,frozen,scope:'独立真实导航历史诊断；不代签原用例/官方生成/App',startedAt:new Date().toISOString(),events:[],cases:[],externalAttempts:[]};
function record(kind,event) {const row={at:new Date().toISOString(),kind,...event};result.events.push(row);fs.appendFileSync(path.join(run,'events.jsonl'),JSON.stringify(row)+'\n');}
function stop() {
  if(stopPromise)return stopPromise;
  stopPromise=(async()=>{
  if(browser)await browser.close().catch(e=>record('cleanup-error',{message:String(e)}));
  if(server&&server.exitCode===null){server.kill('SIGTERM');await new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(Error('Owned Next cleanup exceeded 120s')),120000);server.once('exit',(code,signal)=>{clearTimeout(timer);record('server-exit',{code,signal});resolve();});});}
  if(logFd!==undefined)fs.closeSync(logFd);
  })();
  return stopPromise;
}
(async()=>{
  if(fs.existsSync(run))throw Error('Fresh evidence directory required');
  fs.mkdirSync(run,{recursive:true});
  result.before=verify();result.toolSHA256=hash(__filename);
  await new Promise((resolve,reject)=>{const guard=net.createServer();guard.once('error',reject);guard.listen(port,'127.0.0.1',()=>guard.close(resolve));});
  data=fs.mkdtempSync(path.join(os.tmpdir(),'creatoros-playwright-t1246-settings-history-'));
  for(const suffix of ['pglite','media','auth-web','auth-douyin','app','scratch','cache','backups'])fs.mkdirSync(path.join(data,suffix));
  result.dataRoot=fs.realpathSync(data);
  const env={...process.env,CREATOROS_T1246_RUN_DIR:run,CREATOROS_T1246_FROZEN_CANDIDATE:frozen,CREATOROS_T1246_PACKAGE_READY:'1',CREATOROS_TEST_PORT:String(port),DATABASE_URL:'',PGLITE_DATA_DIR:path.join(data,'pglite'),DB_DIR:path.join(data,'pglite'),APP_DATA_DIR:path.join(data,'app'),CREATOROS_MEDIA_ROOT:path.join(data,'media'),CREATOROS_WEB_AUTH_DIR:path.join(data,'auth-web'),CREATOROS_DOUYIN_AUTH_DIR:path.join(data,'auth-douyin'),CREATOROS_DISABLE_SCHEDULER:'1',CREATOROS_DEV_MODE:'1',NO_PROXY:'127.0.0.1,localhost',no_proxy:'127.0.0.1,localhost',TMPDIR:path.join(data,'scratch'),TMP:path.join(data,'scratch'),TEMP:path.join(data,'scratch'),CREATOROS_CACHE_DIR:path.join(data,'cache'),CREATOROS_BACKUPS_DIR:path.join(data,'backups')};
  for(const key of ['CREATOROS_DESKTOP','NODE_OPTIONS','NODE_PG_FORCE_NATIVE','PGHOST','PGPORT','PGUSER','PGDATABASE','PGPASSWORD','PGSERVICE','PGSERVICEFILE','HTTP_PROXY','HTTPS_PROXY','ALL_PROXY','http_proxy','https_proxy','all_proxy','__NEXT_PRIVATE_STANDALONE_CONFIG'])delete env[key];
  logFd=fs.openSync(path.join(run,'server.log'),'wx');
  server=spawn(process.execPath,[path.join(root,'docs/verification/t1246/driver/start-isolated-next.cjs')],{cwd:path.join(root,'frontend'),env,stdio:['ignore',logFd,logFd]});
  server.once('error',e=>record('server-spawn-error',{message:String(e)}));
  result.serverPid=server.pid;
  outer=setTimeout(()=>{record('outer-timeout',{budgetMs:3300000});process.exitCode=1;stop().catch(e=>record('cleanup-error',{message:String(e)}));},3300000);
  const req=createRequire(path.join(root,'frontend/package.json'));
  const {chromium,expect}=req('@playwright/test');
  const readinessEnd=Date.now()+300000;
  let ready=false;
  while(Date.now()<readinessEnd){
    if(server.exitCode!==null)throw Error(`Owned Next exited ${server.exitCode}`);
    try{const resp=await fetch(origin+'/accounts',{signal:AbortSignal.timeout(Math.min(120000,readinessEnd-Date.now()))});await resp.text();if(resp.ok){ready=true;break;}}catch(e){record('readiness-observation',{name:e.name});}
    await new Promise(resolve=>setTimeout(resolve,1000));
  }
  if(!ready)throw Error('Owned Next readiness did not complete within original 300s startup budget');
  const listenerPids=execFileSync('/usr/sbin/lsof',['-nP','-t',`-iTCP:${port}`,'-sTCP:LISTEN'],{encoding:'utf8'}).trim().split(/\s+/).map(Number);
  const parents=new Map(execFileSync('/bin/ps',['-axo','pid=,ppid='],{encoding:'utf8'}).trim().split('\n').map(line=>line.trim().split(/\s+/).map(Number)));
  function owned(pid){const seen=new Set();while(pid&&!seen.has(pid)){if(pid===server.pid)return true;seen.add(pid);pid=parents.get(pid);}return false;}
  if(!listenerPids.length||listenerPids.some(pid=>!owned(pid)))throw Error('Port listener is not the owned launcher descendant');
  result.listenerPids=listenerPids;
  browser=await chromium.launch({headless:true,timeout:120000});
  for(const mode of ['sidebar-close','direct-settings-close']){
    const context=await browser.newContext({locale:'zh-CN',timezoneId:'Asia/Shanghai',viewport:{width:1536,height:1024},reducedMotion:'reduce',serviceWorkers:'block'});
    await context.tracing.start({screenshots:true,snapshots:true,sources:true});
    await context.route('**/*',async route=>{const url=new URL(route.request().url());if(url.origin!==origin){result.externalAttempts.push({mode,url:safeUrl(url.href)});await route.abort('blockedbyclient');}else await route.continue();});
    await context.routeWebSocket('**/*',ws=>{const url=new URL(ws.url());if(url.hostname==='127.0.0.1'&&url.port===String(port))ws.connectToServer();else{result.externalAttempts.push({mode,url:safeUrl(url.href)});ws.close();}});
    await context.exposeBinding('__t1246HistoryEvidence',(_source,event)=>record('history',{mode,...event}));
    await context.addInitScript(()=>{
      function state(){const s=history.state;return {url:location.href,length:history.length,stateKeys:s&&typeof s==='object'?Object.keys(s):[],next:s?.__NA===true,idx:typeof s?.idx==='number'?s.idx:null};}
      function emit(event){try{const promise=window.__t1246HistoryEvidence(event);promise?.catch(()=>{});}catch{}}
      for(const name of ['pushState','replaceState','back','forward','go']){
        const original=history[name];
        history[name]=function(...args){emit({phase:'before',method:name,...state(),requestedUrl:typeof args[2]==='string'?args[2]:null,delta:name==='go'?args[0]:null});const result=Reflect.apply(original,this,args);emit({phase:'after',method:name,...state()});return result;};
      }
      addEventListener('popstate',()=>emit({phase:'event',method:'popstate',...state()}));
      emit({phase:'init',method:'document',...state()});
    });
    const page=await context.newPage();page.setDefaultTimeout(120000);page.setDefaultNavigationTimeout(120000);
    page.on('framenavigated',frame=>{if(frame===page.mainFrame())record('navigation',{mode,url:safeUrl(frame.url())});});
    page.on('pageerror',e=>record('page-error',{mode,message:e.message}));
    const item={mode,status:'diagnosis',steps:[]};result.cases.push(item);
    try{
      if(mode==='sidebar-close'){
        await page.goto(origin+'/accounts');item.steps.push('real /accounts');
        await page.getByRole('navigation',{name:'主要导航'}).getByRole('link',{name:'设置',exact:true}).click();
      }else await page.goto(origin+'/settings');
      await page.waitForURL(u=>u.pathname==='/settings',{timeout:120000});
      await expect(page.locator('[data-slot="settings-dialog"]')).toBeVisible({timeout:120000});
      record('checkpoint',{mode,point:'dialog-visible',snapshot:await page.evaluate(()=>({url:location.href,length:history.length,stateKeys:Object.keys(history.state??{})}))});
      await page.getByRole('navigation',{name:'设置分类导航'}).getByRole('tab',{name:'外观',exact:true}).click();
      await page.screenshot({path:path.join(run,mode+'-before-close.png'),timeout:120000,animations:'disabled'});
      await page.locator('[data-slot="dialog-close"]').click();item.steps.push('real close click');
      try{await page.waitForURL(u=>mode==='sidebar-close'?u.pathname==='/accounts':u.pathname==='/',{timeout:120000});item.expectedReturnObserved=true;}
      catch(e){item.expectedReturnObserved=false;item.returnObservationError=e.message;}
      item.finalURL=safeUrl(page.url());
      await page.screenshot({path:path.join(run,mode+'-after-close.png'),timeout:120000,animations:'disabled'});
      item.status='OBSERVED';
    }catch(e){item.status='DIAGNOSTIC_ERROR';item.error=e.stack??String(e);}
    finally{await context.tracing.stop({path:path.join(run,mode+'-trace.zip')});await context.close();}
  }
})().catch(e=>{result.error=e.stack??String(e);process.exitCode=1;}).finally(async()=>{
  try{await stop();}catch(e){result.cleanupError=e.stack??String(e);process.exitCode=1;}
  try{result.after=verify();}catch(e){result.afterError=e.stack??String(e);process.exitCode=1;}
  clearTimeout(outer);result.finishedAt=new Date().toISOString();result.exitCode=process.exitCode??0;
  if(fs.existsSync(run))fs.writeFileSync(path.join(run,'result.json'),JSON.stringify(result,null,2)+'\n');
  console.log(JSON.stringify({exitCode:result.exitCode,run,cases:result.cases.map(x=>({mode:x.mode,status:x.status,expectedReturnObserved:x.expectedReturnObserved,finalURL:x.finalURL})),error:result.error??null}));
});
