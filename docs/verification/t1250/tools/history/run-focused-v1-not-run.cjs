'use strict';
const fs=require('node:fs'),path=require('node:path'),os=require('node:os'),cp=require('node:child_process'),crypto=require('node:crypto');
const root=fs.realpathSync(path.resolve(__dirname,'../../../..'));
const helper=path.join(root,'docs/verification/t1246/round-2/browser-original/driver/launch.cjs');
const hash=p=>crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex');
if(hash(helper)!=='6b7d9b532eab7eeca9a71db3fd04c2d3032d9737c93b94f93aa3d0a534c5e15b')throw Error('REVIEWED_CHILD_HELPER_DRIFT');
const {childClosure,processSnapshot,signalOwned}=require(helper);
const phase=process.argv[2],group=process.argv[3];
if(!['red','green','regression'].includes(phase)||!['scanner','clients','cdp','render','hosts','public'].includes(group))throw Error('EXACT_PHASE_AND_GROUP_REQUIRED');
if(process.env.CREATOROS_T1250_REVIEWED_TOOL_SHA256!==hash(__filename))throw Error('INDEPENDENT_TOOL_REVIEW_REQUIRED');
const groups={scanner:['tools/timeout-policy/check.test.mjs'],clients:['frontend/src/server/workbench-native-client.test.ts','frontend/src/server/workbench-browser-client.test.ts'],cdp:['frontend/src/server/ingestion/douyin-cdp-comment-diagnosis.test.ts','frontend/src/server/ingestion/douyin-cdp-comment-diagnosis.integration.test.ts'],render:['frontend/src/server/workbench-artifact-render.test.ts','frontend/src/server/workbench-artifact-representation.test.ts'],hosts:['frontend/src/server/workbench-native-host.test.ts','frontend/src/server/workbench-browser-host.test.ts','frontend/src/server/workbench-artifact-host.test.ts'],public:['frontend/src/server/workbench-public.integration.test.ts']};
const files=groups[group],tmp=fs.mkdtempSync(path.join(fs.realpathSync(os.tmpdir()),'creatoros-t1250-'+phase+'-'+group+'-'));
const out=path.join(root,'docs/verification/t1250/runs',path.basename(tmp));fs.mkdirSync(out,{recursive:true});
const json=(name,value)=>fs.writeFileSync(path.join(out,name),JSON.stringify(value,null,2)+'\n');
const env={...process.env};for(const key of Object.keys(env))if(/^(CREATOROS_|GROWTH_|TAURI_|PGLITE_|PGHOST$|PGPORT$|PGUSER$|PGDATABASE$|PGPASSWORD$|DATABASE_URL$|OPENAI_|ANTHROPIC_|GEMINI_|GOOGLE_API_KEY$|DEEPSEEK_|REDIS_|AWS_|AZURE_)/.test(key))delete env[key];
Object.assign(env,{NODE_ENV:'test',TMPDIR:tmp,TMP:tmp,TEMP:tmp,CREATOROS_APP_DATA_DIR:path.join(tmp,'app'),CREATOROS_DATA_DIR:path.join(tmp,'data'),PGLITE_DATA_DIR:path.join(tmp,'pglite'),CREATOROS_AUTH_DIR:path.join(tmp,'auth'),CREATOROS_MEDIA_DIR:path.join(tmp,'media'),CREATOROS_ACTIVATION_DIR:path.join(tmp,'activation'),CREATOROS_CLI_ACCESS_FILE:path.join(tmp,'cli-access.json'),CREATOROS_CLI_ACTIVITY_FILE:path.join(tmp,'cli-activity.ndjson')});
const owned=new Map(),childRecords=[];let current,interrupted=false;
const capture=()=>{const rows=processSnapshot();let changed=true;while(changed){changed=false;for(const row of rows.values()){const parent=owned.get(row.ppid);if(!owned.has(row.pid)&&parent&&rows.get(parent.pid)?.birth===parent.birth&&row.uid===process.getuid()){owned.set(row.pid,row);changed=true;}}}return rows;};
const emit=(name,budget,extra={})=>json(name,{...extra,budgetMs:budget,at:new Date().toISOString(),ownedRoot:tmp});
async function cleanup(){
 let rows;try{rows=capture();}catch(error){json('cleanup.json',{complete:false,reason:String(error),noForeignSignal:true});return false;}
 const sent=[];for(const entry of [...owned.values()].reverse())sent.push({pid:entry.pid,...signalOwned(entry,'SIGTERM',rows)});
 const until=performance.now()+120000;while(performance.now()<until){rows=capture();if(![...owned.values()].some(e=>rows.get(e.pid)?.birth===e.birth)){json('cleanup.json',{complete:true,sent,ownedRemaining:[],noForeignSignal:true});return true;}await new Promise(r=>setTimeout(r,250));}
 json('cleanup.json',{complete:false,status:'UNKNOWN_OWNED_SHUTDOWN',sent,ownedRemaining:[...owned.values()].filter(e=>rows.get(e.pid)?.birth===e.birth),noForeignSignal:true});return false;
}
async function execute(label,args,cwd,budget){
 if(!Number.isSafeInteger(budget)||budget<120000)throw Error('FINITE_POSITIVE_FULL_BUDGET_REQUIRED');
 const log=fs.createWriteStream(path.join(out,label+'.log'));const child=cp.spawn(process.execPath,args,{cwd,env,shell:false,stdio:['ignore','pipe','pipe']});current=child;
 child.stdout.pipe(log,{end:false});child.stderr.pipe(log,{end:false});const closed=childClosure(child,log,r=>{childRecords.push({label,pid:child.pid,...r});json('children.json',childRecords);});
 const rows=processSnapshot(),birth=rows.get(child.pid);if(!birth||birth.uid!==process.getuid()||birth.ppid!==process.pid)throw Error('OWNED_CHILD_BIRTH_UNPROVEN');owned.set(child.pid,birth);
 const scan=setInterval(()=>{try{capture();}catch(error){json('capture-error.json',{error:String(error),noUnprovenSignals:true});}},5000);scan.unref();
 const deadline=performance.now()+budget;let timer;const expired=new Promise((_,reject)=>{const tick=()=>{if(performance.now()>=deadline){interrupted=true;emit(label+'-timeout.json',budget,{status:'unknown',noResultFabricated:true});void cleanup().then(()=>reject(Error('REAL_DEADLINE_EXHAUSTED')));return;}timer=setTimeout(tick,Math.min(60000,deadline-performance.now()));};tick();});
 try{return await Promise.race([closed,expired]);}finally{clearTimeout(timer);clearInterval(scan);current=undefined;}
}
const writeSet=JSON.parse(fs.readFileSync(path.join(root,'docs/verification/t1250/PRE_IMPLEMENTATION_BINDING_CHECK.json'),'utf8'))['24SourceChecks'].map(x=>x.path);
const sourceSnapshot=()=>writeSet.map(p=>({path:p,sha256:hash(path.join(root,p))}));
(async()=>{
 json('binding.json',{phase,group,toolSha256:hash(__filename),helperSha256:hash(helper),specSha256:hash(path.join(root,'docs/features/t1250-positive-timeout-consumer-closure.md')),files,sourceBefore:sourceSnapshot(),tmp,HOMEUnchanged:env.HOME===process.env.HOME,CODEX_HOMEUnchanged:env.CODEX_HOME===process.env.CODEX_HOME,sharedBuild:false,backendWriter:false,nativeApp:false,officialModel:false});
 let result;
 try{
  if(group==='scanner'){
   const source=fs.readFileSync(path.join(root,files[0]),'utf8'),count=(source.match(/\btest\s*\(/g)||[]).length;if(!count)throw Error('SCANNER_CASE_COUNT_MISSING');
   const budget=count*120000+480000;emit('budget.json',budget,{caseCountSource:'current literal test declarations, actual TAP count reported separately',declaredCases:count,caseMs:120000,cleanupAndReportMs:480000});
   result=await execute('tests',['--test','--test-timeout=120000',files[0]],root,budget);
  }else{
   const cli=path.join(root,'frontend/node_modules/vitest/vitest.mjs'),relative=files.map(p=>p.slice('frontend/'.length));
   const common=['--retry=0','--bail=0','--no-file-parallelism','--maxWorkers=1','--testTimeout=1800000','--hookTimeout=3000000','--teardownTimeout=120000'];
   const selected=phase==='regression'?[]:['--testNamePattern=T1250'];
   const listPath=path.join(out,'list.json');const listed=await execute('list',[cli,'list',...relative,...selected,...common,'--json='+listPath],path.join(root,'frontend'),1800000);
   if(listed.code!==0)throw Error('ACTUAL_COLLECT_FAILED');const cases=JSON.parse(fs.readFileSync(listPath,'utf8'));if(!Array.isArray(cases)||!cases.length||cases.some(c=>!files.some(f=>path.join(root,f)===c.file)||typeof c.name!=='string'))throw Error('ACTUAL_CASE_INVENTORY_INVALID');
   const f=new Set(cases.map(c=>c.file)).size,n=cases.length,budget=n*(1800000+3000000*2)+f*3000000*2+120000*2+480000;
   emit('budget.json',budget,{actualCollectedCases:n,actualFiles:f,bodyMs:1800000,perCaseBeforeAfterHooksMs:6000000,perFileBeforeAfterAllMs:6000000,poolStartTeardownMs:240000,cleanupReportMs:480000,segmentsMaxMs:60000,noPersistentDeadlineChange:true});
   result=await execute('tests',[cli,'run',...relative,...selected,...common,'--reporter=default','--reporter=json','--outputFile.json='+path.join(out,'tests.json')],path.join(root,'frontend'),budget);
  }
 }catch(error){result={code:null,error:String(error),status:'UNKNOWN_OR_PRECONDITION_FAILURE'};}
 const clean=await cleanup();json('result.json',{result,cleanupComplete:clean,interrupted,sourceAfter:sourceSnapshot(),notAppOrModelAcceptance:true,ownedTmpPreserved:true,evidence:out});
 console.log(JSON.stringify({out,result,cleanupComplete:clean}));process.exitCode=result.code===0&&clean?0:1;
})().catch(error=>{json('fatal.json',{error:String(error),tmp,noResultFabricated:true});process.exitCode=1;});
