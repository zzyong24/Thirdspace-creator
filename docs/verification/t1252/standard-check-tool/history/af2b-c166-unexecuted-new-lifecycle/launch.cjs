'use strict';const ENTRY_CLOCK=performance.now();
const fs=require('node:fs'),path=require('node:path'),os=require('node:os'),cp=require('node:child_process'),crypto=require('node:crypto');
const root=fs.realpathSync(path.resolve(__dirname,'../../../..')),bindingFile=path.join(__dirname,'input-binding.json'),H=p=>crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex');
const REQUEST=120000,CLEANUP=2400000,PREP=240000,REPORT=120000,MARGIN=120000,CASE=420000,PER_CASE=1800000,MAX_CASES=300;
const phaseSlots={install:1800000,types:1800000,list:900000,scanner:8*600000+240000,build:1800000};
const checksMax=phaseSlots.types+phaseSlots.list+MAX_CASES*PER_CASE+3600000+phaseSlots.scanner+phaseSlots.build;
function outerFor(mode){return PREP+(mode==='install'?phaseSlots.install:checksMax)+CLEANUP+REPORT+MARGIN;}
function snapshot(){const text=cp.execFileSync('/bin/ps',['-axo','pid=,ppid=,pgid=,uid=,lstart=,command='],{encoding:'utf8',timeout:REQUEST,env:{PATH:'/usr/bin:/bin',LC_ALL:'C'}});return new Map(text.trim().split('\n').map(line=>{const m=line.trim().match(/^(\d+)\s+(\d+)\s+(\d+)\s+(\d+)\s+(.{24})\s+(.*)$/);if(!m)throw Error('PROCESS_IDENTITY_UNPARSEABLE');return [+m[1],{pid:+m[1],ppid:+m[2],pgid:+m[3],uid:+m[4],birth:m[5],command:m[6]}];}));}
function identity(a,b){return Boolean(a&&b&&a.pid===b.pid&&a.birth===b.birth&&a.uid===b.uid);}
function ownedChild(entry,actual,parent,actualParent){return identity(entry,actual)&&identity(parent,actualParent)&&actual.ppid===parent.pid&&entry.uid===parent.uid;}
function fullBudget(n){if(!Number.isSafeInteger(n)||n<1||n>MAX_CASES)throw Error('STRICT_ACTUAL_LIST_BODY_COUNT_REQUIRED');return n*PER_CASE+3600000;}
function write(p,value){fs.writeFileSync(p,JSON.stringify(value,null,2)+'\n',{flag:'wx',mode:0o600});}
async function run(){
 const entered=ENTRY_CLOCK,mode=process.argv[2];if(!['install','checks'].includes(mode))throw Error('EXPLICIT_MODE_REQUIRED');
 const deadline=entered+outerFor(mode),remaining=()=>deadline-performance.now(),children=[],owned=new Map(),proofErrors=[];let runRoot,binding,bindingSha,toolSha,self,scanner,timer,stopPromise,failure=null,expired=false,stopped=false;
 let rejectStop;const stopSignal=new Promise((_,reject)=>{rejectStop=reject;});stopSignal.catch(()=>{});
 const ensure=ms=>{if(stopped||expired||remaining()<ms)throw Error('COMPLETE_NEXT_PHASE_OUTER_REQUIRED');};
 const capture=()=>{const rows=snapshot(),liveSelf=rows.get(self.pid);if(!identity(self,liveSelf))throw Error('PARENT_BIRTH_UID_CHANGED');
  for(const c of children){const a=rows.get(c.child.pid);if(a&&!owned.has(a.pid)&&c.child.exitCode===null){if(!ownedChild(a,a,self,liveSelf)||a.pgid!==a.pid)throw Error('OWNED_ROOT_SPAWN_RELATION_REQUIRED');owned.set(a.pid,{...a,parent:self.pid});}}
  let changed=true;while(changed){changed=false;for(const a of rows.values()){if(owned.has(a.pid))continue;const p=owned.get(a.ppid);if(p&&identity(p,rows.get(p.pid))&&a.uid===p.uid){owned.set(a.pid,{...a,parent:p.pid});changed=true;}}}
  for(const c of children)for(const a of rows.values())if(a.pgid===c.child.pid&&!owned.has(a.pid))proofErrors.push({pid:a.pid,reason:'UNREGISTERED_OWNED_GROUP_MEMBER'});
  return rows;
 };
 const stop=()=>stopPromise??=(async()=>{stopped=true;rejectStop(Error('OWNED_RUN_STOPPED'));clearInterval(scanner);const start=performance.now();let rows;
  const snap=()=>{try{return snapshot();}catch(e){proofErrors.push({phase:'snapshot',reason:e.message});return new Map();}};
  try{rows=capture();}catch(e){proofErrors.push({phase:'capture',reason:e.message});rows=snap();}
  for(const sig of ['SIGTERM','SIGKILL']){
   // One snapshot per signal covers the complete registered set; parent birth/UID must still match.
   const live=snap();for(const e of [...owned.values()].sort((a,b)=>b.pid-a.pid)){const a=live.get(e.pid);if(!a)continue;const p=e.parent===self.pid?self:owned.get(e.parent);if(!ownedChild(e,a,p,live.get(e.parent))){proofErrors.push({pid:e.pid,reason:'SIGNAL_OWNERSHIP_UNCONFIRMED'});continue;}try{process.kill(e.pid,sig);}catch(error){if(error.code!=='ESRCH')proofErrors.push({pid:e.pid,reason:'SIGNAL_ERROR'});}}
   if(children.every(c=>c.done)&&![...owned.keys()].some(pid=>live.has(pid)))break;
   let t;await Promise.race([Promise.all(children.map(c=>c.closed.catch(()=>null))),new Promise(resolve=>{t=setTimeout(resolve,REQUEST);})]);clearTimeout(t);
  }
  const after=snap(),survivors=[];for(const e of owned.values())if(after.has(e.pid))survivors.push({pid:e.pid,registered:e,actual:after.get(e.pid)});
  for(const c of children){for(const a of after.values())if(a.pgid===c.child.pid&&!survivors.some(x=>x.pid===a.pid))survivors.push({pid:a.pid,reason:'GROUP_SURVIVOR'});if(!c.done)proofErrors.push({label:c.label,reason:'STDIO_LOG_CLOSE_UNCONFIRMED'});}
  const confirmed=!survivors.length&&!proofErrors.length;write(path.join(runRoot,'cleanup.json'),{elapsedMs:performance.now()-start,budgetMs:CLEANUP,confirmed,survivors,proofErrors});if(!confirmed)throw Error('OWNED_CLEANUP_UNCONFIRMED');
 })();
 const onStop=()=>{failure??=Error('INTERRUPTED');void stop().catch(e=>failure??=e);};
 const tick=()=>{if(remaining()<=0){expired=true;failure??=Error('OUTER_EXHAUSTED');void stop().catch(e=>failure??=e);}else timer=setTimeout(tick,Math.min(60000,remaining()));};tick();
 let outputs=[];
 try{
  if(process.platform!=='darwin'||process.env.CREATOROS_T1252_STANDARD_TOOL_REVIEWED!=='1'||process.env.CREATOROS_T1252_STANDARD_TOOL_SHA256!==H(__filename)||process.env.CREATOROS_T1252_STANDARD_BINDING_SHA256!==H(bindingFile))throw Error('EXACT_ROOT_STANDARD_TOOL_REVIEW_REQUIRED');
  binding=JSON.parse(fs.readFileSync(bindingFile,'utf8'));if(!binding.allowedModes?.includes(mode))throw Error('UNREVIEWED_STAGE_MODE_REJECTED');bindingSha=H(bindingFile);toolSha=H(__filename);
  if(process.execPath!==binding.node.path||H(process.execPath)!==binding.node.sha256||binding.outerInstallMs!==outerFor('install')||binding.outerChecksMaxMs!==outerFor('checks'))throw Error('FIXED_NODE_COMPLETE_BUDGET_REQUIRED');
  for(const x of binding.inputs){if(path.isAbsolute(x.path)||x.path.split('/').includes('..')||H(path.join(root,x.path))!==x.sha256)throw Error('BOUND_SOURCE_INPUT_CHANGED');}
  for(const x of binding.installedImplementationInputs??[])if(H(x.path)!==x.sha256)throw Error('ACTUAL_PACKAGE_MANAGER_IMPLEMENTATION_CHANGED');
  for(const x of binding.executables)if(fs.realpathSync(x.path)!==x.realpath||H(x.realpath)!==x.sha256)throw Error('BOUND_EXECUTABLE_CHANGED');
  // Current lock differs from archived preapply lock only by the exact direct importer stanza.
  const lock=fs.readFileSync(path.join(root,'pnpm-lock.yaml'),'utf8'),insert='      undici:\n        specifier: 7.27.2\n        version: 7.27.2\n';if(lock.split(insert).length!==2||crypto.createHash('sha256').update(lock.replace(insert,'')).digest('hex')!==binding.originalLockSha256)throw Error('ONLY_DIRECT_IMPORTER_LOCK_CHANGE_REQUIRED');
  self=snapshot().get(process.pid);if(!self||self.uid!==process.getuid())throw Error('OWN_PARENT_IDENTITY_REQUIRED');if(performance.now()-entered>PREP)throw Error('PREPARATION_SLOT_EXHAUSTED');
  runRoot=fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(),'creatoros-t1252-standard-')));fs.chmodSync(runRoot,0o700);write(path.join(runRoot,'marker.json'),{nonce:crypto.randomUUID(),root:runRoot,parent:self,mode});write(path.join(runRoot,'start.json'),{at:new Date().toISOString(),mode,root,runRoot,node:binding.node,toolSha256:toolSha,bindingSha256:bindingSha,outerMs:outerFor(mode),phaseSlots,perCaseMs:PER_CASE,testMs:CASE,hookMs:CASE,prepareElapsedMs:performance.now()-entered});console.log(JSON.stringify({runRoot,mode}));
  const env={PATH:path.dirname(process.execPath)+':/opt/homebrew/bin:/usr/bin:/bin',LC_ALL:'C',TMPDIR:runRoot,CI:'1',NO_COLOR:'1',PNPM_UPDATE_NOTIFIER:'false'};for(const n of ['HOME','CODEX_HOME'])if(process.env[n]!==undefined)env[n]=process.env[n];
  const phase=async(label,args,cwd,budget)=>{ensure(budget+CLEANUP+REPORT+MARGIN);const child=cp.spawn(binding.node.path,args,{cwd,env,detached:true,stdio:['ignore','pipe','pipe']}),c={label,child,done:false};children.push(c);const log=fs.createWriteStream(path.join(runRoot,label+'.log'),{flags:'wx',mode:0o600});let err;
   c.closed=new Promise((resolve,reject)=>{log.once('error',reject);child.once('error',e=>err=e.name);for(const stream of [child.stdout,child.stderr])stream.on('data',bytes=>log.write(bytes));child.once('close',(code,signal)=>{log.once('close',()=>{c.done=true;const receipt={label,code,signal,spawnError:err??null,stdioClosed:true,logClosed:true,at:new Date().toISOString()};write(path.join(runRoot,label+'-exit.json'),receipt);resolve(receipt);});log.end();});});capture();let t;let result;try{result=await Promise.race([c.closed,stopSignal,new Promise((_,reject)=>{t=setTimeout(()=>reject(Error(label+'_WATCHDOG_EXHAUSTED')),budget);})]);}finally{clearTimeout(t);}outputs.push(result);if(result.code!==0||result.signal||result.spawnError)throw Error(label+'_ACTUAL_NONZERO');return result;
  };
  process.once('SIGINT',onStop);process.once('SIGTERM',onStop);scanner=setInterval(()=>{try{capture();}catch(e){failure??=e;void stop().catch(e=>failure??=e);}},1000);
  const exe=name=>binding.executables.find(x=>x.name===name).realpath;
  if(mode==='install'){
   await phase('offline-install',[exe('pnpm'),'--filter','@creatoros/mcp-server','install','--offline','--frozen-lockfile','--ignore-scripts'],root,phaseSlots.install);
   const p=path.join(root,'mcp-server/node_modules/undici'),real=fs.realpathSync(p),pkg=JSON.parse(fs.readFileSync(path.join(real,'package.json'),'utf8'));if(!real.startsWith(root+'/node_modules/.pnpm/')||pkg.version!=='7.27.2')throw Error('DIRECT_FIXED_UNDICI_OWNED_RESOLUTION_REQUIRED');write(path.join(runRoot,'installed-undici.json'),{path:p,realpath:real,version:pkg.version,packageSha256:H(path.join(real,'package.json'))});
  }else{
   const direct=fs.realpathSync(path.join(root,'mcp-server/node_modules/undici'));if(!direct.startsWith(root+'/node_modules/.pnpm/')||JSON.parse(fs.readFileSync(path.join(direct,'package.json'),'utf8')).version!=='7.27.2')throw Error('DIRECT_FIXED_INSTALL_REQUIRED');
   await phase('standard-types',[exe('tsc'),'--noEmit','--project',path.join(root,'mcp-server/tsconfig.json')],root,phaseSlots.types);
   const listed=path.join(runRoot,'actual-list.json');await phase('mcp-list',[exe('vitest'),'list','--json='+listed,'--maxWorkers=1','--no-file-parallelism'],path.join(root,'mcp-server'),phaseSlots.list);
   const cases=JSON.parse(fs.readFileSync(listed,'utf8'));if(!Array.isArray(cases)||cases.some(c=>typeof c.name!=='string'||typeof c.file!=='string'))throw Error('ACTUAL_LIST_CASE_SHAPE_REQUIRED');const files=[...new Set(cases.map(c=>path.relative(root,c.file)))].sort();if(JSON.stringify(files)!==JSON.stringify(binding.testFiles))throw Error('FULL_EIGHT_ORIGINAL_TEST_FILE_INVENTORY_REQUIRED');const identities=cases.map(c=>c.file+'\0'+c.name);if(new Set(identities).size!==identities.length)throw Error('UNIQUE_ACTUAL_TEST_CASES_REQUIRED');const testBudget=fullBudget(cases.length);write(path.join(runRoot,'derived-test-budget.json'),{actualBodies:cases.length,testFiles:files,perBodyCompleteSerialMs:PER_CASE,suiteCollectionShutdownMarginMs:3600000,completeTestPhaseMs:testBudget,formula:'bodies*(test420000+fourEachHook720000+perBodyRemainingMargin660000)+3600000',completeOuterChecksMaxMs:outerFor('checks'),retry:0});
   const resultPath=path.join(runRoot,'mcp-result.json');await phase('all-mcp-original-and-new',[exe('vitest'),'run','--retry=0','--maxWorkers=1','--no-file-parallelism','--testTimeout=420000','--hookTimeout=180000','--reporter=json','--reporter=default','--outputFile.json='+resultPath],path.join(root,'mcp-server'),testBudget);
   const result=JSON.parse(fs.readFileSync(resultPath,'utf8'));if(result.numTotalTests!==cases.length||result.numPendingTests!==0||result.numFailedTests!==0)throw Error('ALL_LISTED_BODIES_NO_SKIP_OR_FAILURE_REQUIRED');
   await phase('scanner-all-original-and-new',['--test','--test-concurrency=1','--test-timeout=600000',path.join(root,'tools/timeout-policy/check.test.mjs')],root,phaseSlots.scanner);
   const bundle=path.join(runRoot,'creatoros.cjs');await phase('real-package-cli-build',[path.join(root,'mcp-server/scripts/build-runtime.mjs'),bundle],root,phaseSlots.build);write(path.join(runRoot,'bundle.json'),{path:bundle,sha256:H(bundle),buildScriptSha256:H(path.join(root,'mcp-server/scripts/build-runtime.mjs')),node:binding.node,packagedRuntimeFormat:'creatoros.cjs original build-runtime node25',actualAllMcpBodies:cases.length,noAppExecuted:true,noOfficialModelExecuted:true});
  }
 }catch(e){failure??=e;}
 finally{
  clearInterval(scanner);process.removeListener('SIGINT',onStop);process.removeListener('SIGTERM',onStop);if(runRoot)try{await stop();}catch(e){failure??=e;}let after=[];try{after=(binding?.inputs??[]).map(x=>({path:x.path,same:H(path.join(root,x.path))===x.sha256}));if(after.some(x=>!x.same)||bindingSha!==H(bindingFile)||toolSha!==H(__filename)||binding?.node.sha256!==H(process.execPath))failure??=Error('INPUT_TOOL_NODE_DRIFT');}catch(e){failure??=e;}clearTimeout(timer);if(runRoot){write(path.join(runRoot,'final.json'),{at:new Date().toISOString(),mode,status:failure||expired?'failed':'actual_stage_completed',error:failure?.message??null,expired,elapsedMs:performance.now()-entered,outputs,inputAfter:after,installationOrStandardStageOnly:true,officialModelOrAppNotRun:true,runRoot});console.log(JSON.stringify({runRoot,status:failure||expired?'failed':'actual_stage_completed',error:failure?.message??null}));}else console.error(JSON.stringify({status:'startup_failed',error:failure?.message}));if(failure||expired)process.exitCode=1;
 }
}
module.exports={identity,ownedChild,fullBudget,outerFor};if(require.main===module)run().catch(e=>{console.error(JSON.stringify({status:'uncaught_failed',error:e.name}));process.exitCode=1;});
