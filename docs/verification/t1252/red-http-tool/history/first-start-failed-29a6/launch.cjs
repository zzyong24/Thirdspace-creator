'use strict';
const fs=require('node:fs'),path=require('node:path'),os=require('node:os'),crypto=require('node:crypto'),cp=require('node:child_process');
const REQUEST=120000,PREP=240000,CASE=780000,CLEANUP=1200000,REPORT=120000,OUTER=3240000;
const root=fs.realpathSync(path.resolve(__dirname,'../../../..')),tool=__filename,bindingFile=path.join(__dirname,'input-binding.json');
const hash=p=>crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex');
const write=(p,v)=>fs.writeFileSync(p,JSON.stringify(v,null,2)+'\n',{flag:'wx',mode:0o600});
function snapshot(){const s=cp.execFileSync('/bin/ps',['-axo','pid=,ppid=,uid=,lstart=,command='],{encoding:'utf8',timeout:REQUEST,env:{PATH:'/usr/bin:/bin',LC_ALL:'C'}});return new Map(s.trim().split('\n').map(line=>{const m=line.trim().match(/^(\d+)\s+(\d+)\s+(\d+)\s+(.{24})\s+(.*)$/);if(!m)throw Error('PROCESS_IDENTITY_UNPARSEABLE');return [+m[1],{pid:+m[1],ppid:+m[2],uid:+m[3],birth:m[4],command:m[5]}];}));}
function exactOwned(entry,actual,parent,currentParent){return Boolean(entry&&actual&&parent&&currentParent&&actual.pid===entry.pid&&actual.birth===entry.birth&&actual.uid===entry.uid&&actual.ppid===parent.pid&&currentParent.birth===parent.birth&&currentParent.uid===parent.uid&&entry.uid===parent.uid);}
async function run(){
 const entered=performance.now(),deadline=entered+OUTER;let runRoot,scanner,outerTimer,stopPromise,stopped=false,expired=false,failure=null;const children=[];const remaining=()=>deadline-performance.now();
 const ensure=ms=>{if(expired||remaining()<ms)throw Error('COMPLETE_OUTER_REMAINING_REQUIRED');};
 let stop=async()=>{};const tick=()=>{if(remaining()<=0){expired=true;void stop().catch(e=>{failure??=e;});}else outerTimer=setTimeout(tick,Math.min(60000,remaining()));};tick();
 let resolveStopped;const stoppedSignal=new Promise(resolve=>{resolveStopped=resolve;});
 const onStop=()=>{failure??=Error('OWNED_RUN_INTERRUPTED');void stop().catch(e=>{failure??=e;});};
 let self,binding,initialTool,initialBinding,inputs;
 try{
  if(process.platform!=='darwin'||process.env.CREATOROS_T1252_RED_TOOL_REVIEWED!=='1'||process.env.CREATOROS_T1252_RED_TOOL_SHA256!==hash(tool)||process.env.CREATOROS_T1252_RED_BINDING_SHA256!==hash(bindingFile))throw Error('EXACT_ROOT_RED_TOOL_REVIEW_REQUIRED');
  binding=JSON.parse(fs.readFileSync(bindingFile,'utf8'));if(!Array.isArray(binding.inputs)||new Set(binding.inputs.map(x=>x.path)).size!==binding.inputs.length||binding.inputs.some(x=>typeof x.path!=='string'||path.isAbsolute(x.path)||x.path.split('/').includes('..')||!/^[a-f0-9]{64}$/.test(x.sha256)))throw Error('STRICT_REVIEWED_INPUT_INVENTORY_REQUIRED');if(process.execPath!==binding.nodePath||hash(process.execPath)!==binding.nodeSha256||binding.outerMs!==OUTER||binding.caseMs!==CASE||binding.cleanupMs!==CLEANUP)throw Error('ACTUAL_NODE_BUDGET_BINDING_REQUIRED');
  initialTool=hash(tool);initialBinding=hash(bindingFile);inputs=binding.inputs.map(x=>({path:x.path,sha256:hash(path.join(root,x.path)),expected:x.sha256}));if(inputs.some(x=>x.sha256!==x.expected))throw Error('EXACT_INPUT_BYTES_REQUIRED');
  if(performance.now()-entered>=PREP)throw Error('PREPARATION_BUDGET_EXHAUSTED');ensure(2*CASE+CLEANUP+REPORT);self=snapshot().get(process.pid);if(!self||self.uid!==process.getuid())throw Error('OWN_PARENT_BIRTH_UID_REQUIRED');if(performance.now()-entered>=PREP)throw Error('PREPARATION_BUDGET_EXHAUSTED');
  const nonce=crypto.randomBytes(12).toString('hex');runRoot=fs.mkdtempSync(path.join(os.tmpdir(),'creatoros-t1252-red-'));fs.chmodSync(runRoot,0o700);write(path.join(runRoot,'marker.json'),{nonce,pid:process.pid,birth:self.birth,uid:self.uid,root:runRoot,role:'t1252-red-protocol-only'});
  write(path.join(runRoot,'start.json'),{at:new Date().toISOString(),nodePath:process.execPath,nodeSha256:binding.nodeSha256,toolSha256:initialTool,bindingSha256:initialBinding,inputs,nonce,runRoot,outerMs:OUTER,caseMs:CASE,cleanupMs:CLEANUP,preparationElapsedMs:performance.now()-entered,noApp:true,noModel:true,noPG:true});
  const env={PATH:'/usr/bin:/bin',LC_ALL:'C',TMPDIR:runRoot};for(const n of ['HOME','CODEX_HOME'])if(process.env[n]!==undefined)env[n]=process.env[n];
  const proofErrors=[],survivors=[];
  const capture=()=>{const rows=snapshot(),parent=rows.get(self.pid);for(const c of children){const actual=rows.get(c.child.pid);if(c.entry){if(actual&&c.child.exitCode===null&&!exactOwned(c.entry,actual,self,parent))proofErrors.push({label:c.label,reason:'OWN_CHILD_IDENTITY_CHANGED'});}else if(actual&&c.child.exitCode===null&&actual.ppid===self.pid&&actual.uid===self.uid&&parent?.birth===self.birth&&parent.uid===self.uid)c.entry=actual;}return rows;};
  stop=()=>stopPromise??=(async()=>{
   stopped=true;resolveStopped();if(scanner)clearInterval(scanner);const start=performance.now(),cleanDeadline=start+CLEANUP;
   const cleanupSnapshot=()=>{try{return snapshot();}catch(e){proofErrors.push({phase:'snapshot',reason:e.message});return new Map();}};let rows;try{rows=capture();}catch(e){proofErrors.push({phase:'capture',reason:e.message});rows=new Map();}
   for(const signal of ['SIGTERM','SIGKILL']){
    for(const c of children){const current=cleanupSnapshot(),actual=current.get(c.child.pid);if(c.child.exitCode!==null||!actual)continue;if(!exactOwned(c.entry,actual,self,current.get(self.pid))){proofErrors.push({label:c.label,reason:'SIGNAL_OWNERSHIP_UNPROVEN'});continue;}c.child.kill(signal);}
    if(children.every(c=>c.done))break;
    const phase=Math.min(REQUEST,cleanDeadline-performance.now());if(phase<=0)break;let waitTimer;try{await Promise.race([Promise.all(children.map(c=>c.closed)),new Promise(resolve=>{waitTimer=setTimeout(resolve,phase);})]);}finally{clearTimeout(waitTimer);}
   }
   rows=cleanupSnapshot();for(const c of children){const actual=rows.get(c.child.pid);if(c.child.exitCode===null&&actual)survivors.push({pid:c.child.pid,label:c.label});if(!c.done)proofErrors.push({label:c.label,reason:'STDIO_LOG_CLOSE_UNCONFIRMED'});}
   write(path.join(runRoot,'cleanup.json'),{elapsedMs:performance.now()-start,budgetMs:CLEANUP,confirmed:!survivors.length&&!proofErrors.length,survivors,proofErrors,children:children.map(c=>({label:c.label,pid:c.child.pid,registered:c.entry??null,closed:c.done}))});if(survivors.length||proofErrors.length)throw Error('OWNED_CLEANUP_UNCONFIRMED');
  })();
  process.once('SIGTERM',onStop);process.once('SIGINT',onStop);scanner=setInterval(()=>{try{capture();}catch(e){failure??=e;void stop().catch(e=>{failure??=e;});}},1000);
  for(const [index,label] of ['headers','body'].entries()){
   if(stopped)throw Error('NO_NEW_PHASE_AFTER_STOP');ensure((2-index)*CASE+CLEANUP+REPORT);
   const child=cp.spawn(binding.nodePath,[path.join(__dirname,'protocol-red.cjs'),label,runRoot,nonce],{cwd:runRoot,env,stdio:['ignore','pipe','pipe']});const c={label,child,entry:null,done:false};children.push(c);const log=fs.createWriteStream(path.join(runRoot,label+'.log'),{flags:'wx',mode:0o600});for(const s of [child.stdout,child.stderr])s.on('data',bytes=>log.write(bytes));let spawnError;
   c.closed=new Promise((resolve,reject)=>{log.once('error',reject);child.once('error',e=>spawnError=e.name);child.once('close',(code,signal)=>{const result={label,pid:child.pid,code,signal,spawnError:spawnError??null,stdioClosed:true,closeAt:new Date().toISOString()};log.once('close',()=>{c.done=true;result.logClosedAt=new Date().toISOString();write(path.join(runRoot,label+'-exit.json'),result);resolve(result);});log.end();});});capture();
   let timer;let result;try{result=await Promise.race([c.closed,stoppedSignal.then(()=>{throw Error('OWNED_RUN_STOPPED');}),new Promise((_,reject)=>{timer=setTimeout(()=>reject(Error('CASE_WATCHDOG_EXHAUSTED')),CASE);})]);}finally{clearTimeout(timer);}
   if(result.code!==1||result.signal||result.spawnError)throw Error('EXPECTED_ACTUAL_RED_NONZERO_REQUIRED');const observed=JSON.parse(fs.readFileSync(path.join(runRoot,label+'-actual-red.json'),'utf8'));if(!observed.actualBaselineFailure)throw Error('ACTUAL_300_SECOND_BASELINE_FAILURE_REQUIRED');
  }
 }catch(e){failure??=e;}
 finally{
  if(scanner)clearInterval(scanner);process.removeListener('SIGTERM',onStop);process.removeListener('SIGINT',onStop);
  try{await stop();}catch(e){failure??=e;}
  let afterError=null,after=[];try{after=(inputs??[]).map(x=>({path:x.path,same:hash(path.join(root,x.path))===x.sha256}));if(after.some(x=>!x.same)||initialTool!==hash(tool)||initialBinding!==hash(bindingFile)||binding?.nodeSha256!==hash(process.execPath))failure??=Error('INPUT_TOOL_NODE_DRIFT');}catch(e){afterError=e.message;failure??=e;}
  clearTimeout(outerTimer);if(runRoot){write(path.join(runRoot,'final.json'),{at:new Date().toISOString(),status:failure||expired?'failed':'actual_baseline_two_failures_collected',error:failure?.message??null,expired,elapsedMs:performance.now()-entered,afterError,inputAfter:after,productTestsPassed:0,productTestsFailed:failure?null:2,notImplementationPass:true,noApp:true,noPG:true,noModel:true,runRoot});console.log(JSON.stringify({runRoot,status:failure||expired?'failed':'actual_baseline_two_failures_collected',error:failure?.message??null}));}
  else console.error(JSON.stringify({status:'startup_failed',error:failure?.message??'NO_OWNED_RUN_ROOT'}));if(failure||expired)process.exitCode=1;
 }
}
module.exports={exactOwned};
if(require.main===module)run().catch(e=>{console.error(JSON.stringify({status:'uncaught_failed',error:e.name}));process.exitCode=1;});
