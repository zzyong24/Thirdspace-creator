#!/usr/bin/env node
'use strict';
// Diagnostic-only orchestration. Product, original test assertions and inherited execution budgets are unchanged.
const fs=require('node:fs'),path=require('node:path'),os=require('node:os'),net=require('node:net'),crypto=require('node:crypto');
const {spawn,execFileSync}=require('node:child_process');const {performance}=require('node:perf_hooks');
const root=path.resolve(__dirname,'../../../..'),frontend=path.join(root,'frontend'),tool=__dirname;
const frozen='533224f334c43cdb81a344424e420cad93784dd1',port=61349;
const hash=f=>crypto.createHash('sha256').update(fs.readFileSync(f)).digest('hex');
const json=f=>JSON.parse(fs.readFileSync(f,'utf8'));const write=(f,v)=>fs.writeFileSync(f,JSON.stringify(v,null,2)+'\n');
const binding=json(path.join(tool,'private-source-binding.json'));
const manifest=json(path.join(root,'docs/verification/t1246/driver/manifest.json'));
const sources=json(path.join(root,'docs/verification/t1246/source-inventory-before.json'));
const packageReceipt=json(path.join(root,'docs/verification/t1246/package-first/RESULT.json'));
const productPaths=['backend/src','backend/drizzle','contract/src','ai-worker/src','ai-worker/scripts','ai-worker/vendor','frontend/src','frontend/lib','frontend/next.config.ts','frontend/package.json','backend/package.json','contract/package.json','ai-worker/package.json','package.json','pnpm-lock.yaml'];
const privateFiles=['private-source-binding.json','injection.txt','playwright.config.ts','launch.cjs'];
let runner=null,runDir=null,childGroup=null;const observedOwned=new Map();
function files(dir){return fs.readdirSync(dir,{withFileTypes:true}).flatMap(x=>x.isDirectory()?files(path.join(dir,x.name)):[path.join(dir,x.name)]).sort();}
function inventory(){
 const errors=[],items=[];function check(file,expected,family){const actual=hash(file);items.push({path:path.relative(root,file),sha256:actual,expected,family});if(actual!==expected)errors.push(family+': '+file);}
 if(execFileSync('git',['rev-parse','HEAD'],{cwd:root,encoding:'utf8'}).trim()!==frozen)errors.push('HEAD');
 const dirty=execFileSync('git',['status','--porcelain','--',...productPaths],{cwd:root,encoding:'utf8'}).trim();if(dirty)errors.push('productDirty: '+dirty);
 for(const x of [...sources.other_changes,...sources.same_as_codex])check(path.join(root,x.path),x.sha256,'product253');
 for(const x of packageReceipt.worker_bundles)check(path.join(root,'ai-worker/dist',x.file),x.sha256,'worker11');
 for(const [dir,expected,family]of [['frontend/tests',manifest.allOriginalTestFiles,'original100'],[manifest.generatedTestRoot,manifest.allGeneratedTestFiles,'generated100']]){
  const actualNames=files(path.join(root,dir)).map(f=>path.relative(path.join(root,dir),f));
  if(JSON.stringify(actualNames)!==JSON.stringify(expected.map(x=>x.file).sort()))errors.push('inventory: '+family);
  for(const x of expected)check(path.join(root,dir,x.file),x.sha256,family);
 }
 check(path.join(frontend,'playwright.config.ts'),manifest.configOriginalSha256,'originalConfig');
 for(const x of manifest.driverFiles)check(path.join(root,'docs/verification/t1246/driver',x.file),x.sha256,'driver8');
 const injection=fs.readFileSync(path.join(tool,'injection.txt'),'utf8');
 for(const x of binding.sourceFiles){
  const f=path.join(binding.testTree,x.path),source=path.join(root,x.sourcePath);check(source,x.sourceSHA256,'privateOriginal');check(f,x.privateSHA256,'private3');
  const text=fs.readFileSync(f,'utf8'),original=fs.readFileSync(source,'utf8');
  const restored=x.onlyDifference==='none'?text:text.replace(injection,'');
  if(restored!==original)errors.push('inverse: '+x.path);
  if(x.onlyDifference!=='none'&&text.split(injection).length!==2)errors.push('injectionMultiplicity: '+x.path);
 }
 if(files(binding.testTree).length!==3)errors.push('private3 inventory');
 const counts={};for(const x of items)counts[x.family]=(counts[x.family]??0)+1;
 return {at:new Date().toISOString(),frozen,productDirty:dirty,counts,items,errors,toolFiles:privateFiles.map(file=>({file,sha256:hash(path.join(tool,file))})),node:{path:process.execPath,sha256:hash(process.execPath),version:process.version}};
}
function assertSnapshot(s){if(s.errors.length)throw Error('Preflight drift: '+s.errors.join('; '));if(s.counts.product253!==253||s.counts.worker11!==11||s.counts.original100!==100||s.counts.driver8!==8)throw Error('Inventory family count mismatch');}
async function freePort(){const s=net.createServer();await new Promise((ok,no)=>{s.once('error',no);s.listen(port,'127.0.0.1',ok)});await new Promise(ok=>s.close(ok));}
function sanitized(data){
 // Explicit non-secret allowlist. HOME and CODEX_HOME preserve original values; no auth is copied. Task data/TMP/app/auth/cache/database are owned.
 const env={};for(const k of ['LANG','LC_ALL','LC_CTYPE','TERM','TZ','SYSTEMROOT','SystemRoot','DISPLAY','HOME','CODEX_HOME','USER','LOGNAME','SHELL'])if(process.env[k])env[k]=process.env[k];
 Object.assign(env,{PATH:[path.dirname(process.execPath),'/usr/bin','/bin','/usr/sbin','/sbin'].join(path.delimiter),TMPDIR:path.join(data,'scratch'),TMP:path.join(data,'scratch'),TEMP:path.join(data,'scratch'),XDG_CONFIG_HOME:path.join(data,'test-config'),XDG_CACHE_HOME:path.join(data,'cache'),XDG_DATA_HOME:path.join(data,'test-data'),DATABASE_URL:'',PGLITE_DATA_DIR:path.join(data,'pglite'),CREATOROS_DB_DIR:path.join(data,'pglite'),CREATOROS_APP_DATA_DIR:path.join(data,'app'),CREATOROS_MEDIA_ROOT:path.join(data,'media'),CREATOROS_DOUYIN_AUTH_DIR:path.join(data,'auth-douyin'),CREATOROS_WEB_AUTH_DIR:path.join(data,'auth-web'),CREATOROS_CACHE_DIR:path.join(data,'cache'),CREATOROS_BACKUP_DIR:path.join(data,'backups'),CREATOROS_DISABLE_SCHEDULER:'1',CREATOROS_DEV_MODE:'1',CREATOROS_PLAYWRIGHT_DATA_ROOT:data,CREATOROS_TEST_PORT:String(port),CREATOROS_T1246_RUN_DIR:runDir,CREATOROS_T1246_FROZEN_CANDIDATE:frozen,CREATOROS_T1246_PACKAGE_READY:'1',CREATOROS_T1246_PACKAGE_SHA256:packageReceipt.dmg_sha256,NO_PROXY:'127.0.0.1,localhost',no_proxy:'127.0.0.1,localhost'});
 const cache=path.join(os.homedir(),'Library/Caches/ms-playwright');if(!fs.existsSync(cache))throw Error('Reviewed installed Chromium cache absent');env.PLAYWRIGHT_BROWSERS_PATH=cache;
 return env;
}
function processTable(){return execFileSync('/bin/ps',['-axo','pid=,ppid=,pgid=,lstart=,command='],{encoding:'utf8'}).split('\n').map(line=>{const m=line.match(/^\s*(\d+)\s+(\d+)\s+(\d+)\s+(\S+\s+\S+\s+\d+\s+\d+:\d+:\d+\s+\d+)\s+(.*)$/);return m?{pid:+m[1],ppid:+m[2],pgid:+m[3],start:m[4],command:m[5]}:null}).filter(Boolean);}
function refreshOwned(){const rows=processTable();let changed=true;while(changed){changed=false;for(const x of rows){const old=observedOwned.get(x.pid);if(old&&old.start===x.start)continue;const parent=rows.find(p=>p.pid===x.ppid),trustedParent=parent&&observedOwned.get(parent.pid);if((x.pid===childGroup&&observedOwned.size===0)||(trustedParent&&trustedParent.start===parent.start)){observedOwned.set(x.pid,x);changed=true;}}}return rows.filter(x=>observedOwned.get(x.pid)?.start===x.start);}
function groupMembers(){return refreshOwned();}
function listenerPids(){try{return execFileSync('/usr/sbin/lsof',['-nP','-t','-iTCP:'+port,'-sTCP:LISTEN'],{encoding:'utf8'}).trim().split(/\s+/).filter(Boolean).map(Number);}catch(e){if(e.status===1)return [];throw e;}}
function signalOwned(sig){const members=refreshOwned();for(const member of members.reverse()){try{process.kill(member.pid,sig);}catch(e){if(e.code!=='ESRCH')throw e;}}return members;}
async function runChild(args,env,logName,deadlineMs){
 const stdout=fs.createWriteStream(path.join(runDir,logName));const start=performance.now();let timer,expiryCleanupTimer,expired=false;
 runner=spawn(process.execPath,args,{cwd:frontend,env,detached:true,stdio:['ignore','pipe','pipe']});childGroup=runner.pid;refreshOwned();const ownershipPoll=setInterval(()=>{try{refreshOwned();}catch(e){fs.appendFileSync(path.join(runDir,'ownership-observation-errors.log'),e.stack+'\n');}},500);
 write(path.join(runDir,'process-'+logName+'.json'),{pid:runner.pid,pgid:childGroup,argv:args,deadlineMs,at:new Date().toISOString()});
 runner.stdout.on('data',b=>{stdout.write(b);process.stdout.write(b)});runner.stderr.on('data',b=>{stdout.write(b);process.stderr.write(b)});
 // Segments never shorten the monotonic real deadline, and each timer stays below signed32.
 function tick(){const remaining=deadlineMs-(performance.now()-start);if(remaining<=0){expired=true;write(path.join(runDir,'actual-deadline-expired.json'),{elapsedMs:performance.now()-start,deadlineMs,ownedMembers:signalOwned('SIGTERM')});expiryCleanupTimer=setTimeout(()=>{write(path.join(runDir,'deadline-cleanup-expired.json'),{elapsedMs:performance.now()-start,ownedMembers:signalOwned('SIGKILL')});},binding.budgetComponentsMs.launcherOwnedCleanup);return;}timer=setTimeout(tick,Math.min(60000,remaining));}
 tick();const result=await new Promise((ok,no)=>{runner.once('error',no);runner.once('close',(code,signal)=>ok({code,signal,expired,durationMs:performance.now()-start}));});clearTimeout(timer);clearTimeout(expiryCleanupTimer);clearInterval(ownershipPoll);await new Promise(ok=>stdout.end(ok));runner=null;return result;
}
async function cleanup(){
 const before={members:groupMembers(),listeners:listenerPids()};
 // The runner normally stops its own server/browser. Only this detached process group may be signalled.
 if(before.members.length)signalOwned('SIGTERM');
 const deadline=performance.now()+binding.budgetComponentsMs.launcherOwnedCleanup;
 while(groupMembers().length&&performance.now()<deadline)await new Promise(ok=>setTimeout(ok,250));
 let killed=[];if(groupMembers().length){killed=signalOwned('SIGKILL');await new Promise(ok=>setTimeout(ok,250));}
 const after={members:groupMembers(),listeners:listenerPids()};
 const receipt={before,after,killed,ownedRunnerProcessGroup:childGroup,observedOwnedProcesses:[...observedOwned.values()],ownershipMethod:"Observed live PPID lineage from spawned runner; before every signal recheck PID birth time",foreignProcessesNeverSignalled:true,ownedDataPreserved:true};write(path.join(runDir,'cleanup.json'),receipt);return receipt;
}
(async()=>{
 const phase=process.argv[2];if(!['list','execute'].includes(phase))throw Error('Use list or execute RUN_DIR.');
 if(packageReceipt.candidate!==frozen||packageReceipt.package_exit!==0||packageReceipt.installed||packageReceipt.app_launched)throw Error('Package receipt gate mismatch');
 if(fs.readdirSync(frontend).some(name=>/^\.env(?:\.|$)/.test(name)))throw Error('Local .env files present; do not expose credentials to this diagnostic');
 if(phase==='list'){
  runDir=path.join(root,'docs/verification/t1246/settings-full-history-runs',new Date().toISOString().replace(/[:.]/g,'-'));fs.mkdirSync(runDir,{recursive:true});
  const data=fs.mkdtempSync(path.join(os.tmpdir(),'creatoros-playwright-t1246-settings-full-'));
  for(const d of ['pglite','media','auth-douyin','auth-web','app','scratch','cache','backups','test-config','test-data'])fs.mkdirSync(path.join(data,d),{recursive:true});
  write(path.join(runDir,'ownership.json'),{createdBy:'settings-full-history-tool/launch.cjs',frozen,dataRoot:fs.realpathSync(data),runDir:fs.realpathSync(runDir),port,createdAt:new Date().toISOString(),packageReceiptSHA256:hash(path.join(root,'docs/verification/t1246/package-first/RESULT.json')),packageSHA256:packageReceipt.dmg_sha256});
 }else{
  runDir=fs.realpathSync(process.argv[3]||'');const rel=path.relative(path.join(root,'docs/verification/t1246/settings-full-history-runs'),runDir);if(!rel||rel.startsWith('..')||path.isAbsolute(rel))throw Error('Execution output outside owned diagnostic runs');
  if(process.env.CREATOROS_T1246_SETTINGS_REVIEW_APPROVED_SHA!==hash(__filename))throw Error('Independent static review binding absent/wrong; do not self-approve');
  if(fs.existsSync(path.join(runDir,'execution-start.json')))throw Error('Never overwrite a previous execution; create another list/prepared round');
 }
 const ownership=json(path.join(runDir,'ownership.json'));if(ownership.frozen!==frozen||ownership.port!==port||!fs.realpathSync(ownership.dataRoot).startsWith(fs.realpathSync(os.tmpdir())+path.sep+'creatoros-playwright-'))throw Error('Owned temporary root mismatch');
 const before=inventory();assertSnapshot(before);write(path.join(runDir,phase+'-before.json'),before);
 if(phase==='execute'){
  const prepared=json(path.join(runDir,'list-before.json'));if(JSON.stringify(prepared.toolFiles)!==JSON.stringify(before.toolFiles)||JSON.stringify(prepared.node)!==JSON.stringify(before.node))throw Error('Tool/runtime changed since listing and review');
  const list=json(path.join(runDir,'selected-tests.json'));if(list.count!==2)throw Error('Exact two cases were not listed');await freePort();
  write(path.join(runDir,'execution-start.json'),{at:new Date().toISOString(),privateToolSHA256:hash(__filename),bindingSHA256:hash(path.join(tool,'private-source-binding.json')),budgets:binding,independentReviewBoundByToolSHA256:process.env.CREATOROS_T1246_SETTINGS_REVIEW_APPROVED_SHA});
 }
 const env=sanitized(ownership.dataRoot);env.CREATOROS_T1246_SETTINGS_PHASE=phase;write(path.join(runDir,'environment-'+phase+'.json'),env);
 const cli=path.join(fs.realpathSync(path.join(frontend,'node_modules/@playwright/test')),'cli.js');
 const args=[cli,'test','--config',path.join(tool,'playwright.config.ts'),'--project','e2e','--grep','renders the settings structure|外观主题与密度',...(phase==='list'?['--list']:[])];
 const result=await runChild(args,env,phase+'.log',phase==='list'?300000:binding.launcherOuterMs);
 if(phase==='list'){
  const report=json(path.join(runDir,'list-results.json')),tests=[];function visit(suites){for(const suite of suites??[]){for(const spec of suite.specs??[])for(const t of spec.tests??[])tests.push({id:spec.id,title:spec.title,file:spec.file,line:spec.line,project:t.projectName,timeout:t.timeout});visit(suite.suites);}}visit(report.suites);
  if(result.code!==0||tests.length!==2||tests.some(t=>t.project!=='e2e'))throw Error('Exact two-case listing failed');write(path.join(runDir,'selected-tests.json'),{count:tests.length,tests,notExecuted:true});
 }
 const cleanupReceipt=await cleanup();const after=inventory();if(JSON.stringify(before.toolFiles)!==JSON.stringify(after.toolFiles))after.errors.push('Private tool SHA drift during phase');if(JSON.stringify(before.node)!==JSON.stringify(after.node))after.errors.push('Node runtime drift during phase');write(path.join(runDir,phase+'-after.json'),after);
 write(path.join(runDir,phase+'-result.json'),{...result,runDir,cleanup:cleanupReceipt,afterInventoryErrors:after.errors,phase,notProductAcceptance:phase==='list',finishedAt:new Date().toISOString()});
 if(after.errors.length||cleanupReceipt.after.members.length||cleanupReceipt.after.listeners.length)process.exitCode=2;else process.exitCode=result.code??1;
 console.log('T1246_SETTINGS_FULL_RUN_DIR='+runDir);
})().catch(async e=>{console.error(e.stack);if(runDir){write(path.join(runDir,'launcher-error.json'),{at:new Date().toISOString(),error:e.stack});try{await cleanup();write(path.join(runDir,'error-after.json'),inventory());}catch(c){console.error(c);}}process.exitCode=1;});
