'use strict';
const fs=require('node:fs'),path=require('node:path'),os=require('node:os'),crypto=require('node:crypto');
const root=fs.realpathSync(path.resolve(__dirname,'../../../..'));
const helper=path.join(root,'docs/verification/t1246/round-2/unit/owned-pg-runtime.cjs');
const hash=p=>crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex');
const digest=value=>crypto.createHash('sha256').update(JSON.stringify(value)).digest('hex');
if(hash(helper)!=='393f88771f732e57959ce948a61104fe616c6090faa3e21808186a6df7df3dea')throw Error('REVIEWED_OWNED_PROCESS_HELPER_DRIFT');
const runtime=require(helper),phase=process.argv[2],group=process.argv[3],prepare=process.argv.includes('--prepare');
if(!['red','green','regression'].includes(phase)||!['scanner','clients','cdp','render','hosts','public','recovery'].includes(group))throw Error('EXACT_PHASE_AND_GROUP_REQUIRED');
const groups={scanner:['tools/timeout-policy/check.test.mjs'],clients:['frontend/src/server/workbench-native-client.test.ts','frontend/src/server/workbench-browser-client.test.ts'],cdp:['frontend/src/server/ingestion/douyin-cdp-comment-diagnosis.test.ts','frontend/src/server/ingestion/douyin-cdp-comment-diagnosis.integration.test.ts'],render:['frontend/src/server/workbench-artifact-render.test.ts','frontend/src/server/workbench-artifact-representation.test.ts'],hosts:['frontend/src/server/workbench-native-host.test.ts','frontend/src/server/workbench-browser-host.test.ts','frontend/src/server/workbench-artifact-host.test.ts'],public:['frontend/src/server/workbench-public.integration.test.ts'],recovery:['frontend/src/server/workbench-file-recovery.test.ts']};
const files=groups[group],spec=path.join(root,'docs/features/t1250-positive-timeout-consumer-closure.md');
if(hash(spec)!=='0c9468d57923af45971f54b3e3500ff82936e74aded1af9363ad37cfc477bcc4')throw Error('FORMAL_SPEC_CHANGED_REVIEW_REQUIRED');
function tree(dir){if(!fs.existsSync(path.join(root,dir)))return [];return fs.readdirSync(path.join(root,dir),{withFileTypes:true}).flatMap(e=>e.isDirectory()?tree(dir+'/'+e.name):e.isFile()?[dir+'/'+e.name]:[]);}
function inputs(){
 let paths=[...files,'frontend/vitest.config.ts','frontend/src/test/setup.ts','frontend/src/test/empty-module.ts','frontend/package.json','contract/package.json','backend/package.json','ai-worker/package.json','pnpm-lock.yaml','docs/verification/t1246/round-2/unit/owned-pg-runtime.cjs'];
 if(group==='scanner')paths.push('tools/timeout-policy/check.mjs','frontend/public/reference-editors/kuaitu/js/index.770609ce.js','frontend/public/reference-editors/kuaitu/native/native.js');
 else if(group==='clients')paths.push('frontend/src/server/workbench-native-client.ts','frontend/src/server/workbench-browser-client.ts','contract/src/timeout-policy.ts');
 else {
  paths.push(...['frontend/src/server','backend/src','contract/src','ai-worker/src','ai-worker/dist'].flatMap(tree).filter(p=>!/\.(test|spec|fixture)\./.test(p)&&/\.(?:ts|tsx|js|mjs|cjs|json)$/.test(p)));
  // createDb真实migrator读取这些SQL/journal，不能仅冻结TS调用者。
  paths.push(...tree('backend/drizzle').filter(p=>/\.(?:sql|json)$/.test(p)));
  if(group==='recovery')paths.push(...['mcp-server/src','mcp-server/tests/helpers'].flatMap(tree).filter(p=>/\.(?:ts|tsx|js|mjs|cjs|json)$/.test(p)));
 }
 return [...new Set(paths)].sort().map(p=>({path:p,sha256:hash(path.join(root,p))}));
}
const expected=inputs(),admission={approved:true,scope:'T1250-owned-focused-no-app-no-model-no-pg',sourceRoot:root,phase,group,toolSha256:hash(__filename),helperSha256:hash(helper),specSha256:hash(spec),selectedInputDigest:digest(expected)};
if(prepare){console.log(JSON.stringify({status:'PREPARE_ONLY_NO_CHILD',admission,selectedInputs:expected,nativeRustIsNotRuntimeInput:true,sharedBuild:false,actualRuns:0},null,2));return;}
const i=process.argv.indexOf('--review');if(i<0||!process.argv[i+1])throw Error('INDEPENDENT_BOUND_REVIEW_FILE_REQUIRED');const reviewPath=path.resolve(process.argv[i+1]),review=JSON.parse(fs.readFileSync(reviewPath,'utf8'));
for(const [key,value]of Object.entries(admission))if(review[key]!==value)throw Error('REVIEW_NOT_BOUND:'+key);
const tmp=fs.mkdtempSync(path.join(fs.realpathSync('/tmp'),'ct1250-'+phase+'-'+group+'-'));fs.chmodSync(tmp,0o700);
const out=path.join(root,'docs/verification/t1250/runs',path.basename(tmp));fs.mkdirSync(out,{recursive:true});const json=(name,value)=>fs.writeFileSync(path.join(out,name),JSON.stringify(value,null,2)+'\n');
const env=runtime.cleanEnv();for(const key of Object.keys(env))if(/^(CREATOROS_|GROWTH_|TAURI_|S3_|AWS_|OPENAI_|ANTHROPIC_|AZURE_|GOOGLE_API_|GEMINI_|DEEPSEEK_|REDIS_)/.test(key)||/(?:API_KEY|AUTH_TOKEN|SECRET|PASSWORD)$/.test(key))delete env[key];
const dirs={app:'CREATOROS_APP_DATA_DIR',db:'CREATOROS_DB_DIR',media:'CREATOROS_MEDIA_ROOT',browser:'CREATOROS_BROWSER_POOL_DIR',workbench:'CREATOROS_WORKBENCH_ROOT',backups:'CREATOROS_DATABASE_BACKUP_DIR',douyin:'CREATOROS_DOUYIN_AUTH_DIR',web:'CREATOROS_WEB_AUTH_DIR'};
for(const [name,key]of Object.entries(dirs)){const p=path.join(tmp,name);fs.mkdirSync(p);env[key]=p;}
Object.assign(env,{NODE_ENV:'test',CI:'1',TMPDIR:tmp,TMP:tmp,TEMP:tmp,T1246_OWNED_PG_PRELOAD:'1',NODE_OPTIONS:'--require '+helper});
if(env.HOME!==process.env.HOME||env.CODEX_HOME!==process.env.CODEX_HOME||Object.keys(env).some(k=>k.startsWith('PG')||['DATABASE_URL','TEST_DATABASE_URL','NODE_PG_FORCE_NATIVE'].includes(k)))throw Error('ENV_ISOLATION_INVALID');
const controller=new AbortController();let outerTimer,overallDeadline,outerExhausted=false;const records=[];
function startOuter(ms){if(!Number.isSafeInteger(ms)||ms<120000)throw Error('FINITE_FULL_OUTER_REQUIRED');overallDeadline=performance.now()+ms;const tick=()=>{if(performance.now()>=overallDeadline){outerExhausted=true;controller.abort(Error('T1250_OUTER_EXHAUSTED'));}else outerTimer=setTimeout(tick,Math.min(60000,overallDeadline-performance.now()));};tick();}
async function execute(label,args,cwd,budget){
 if(!Number.isSafeInteger(budget)||budget<120000||budget>2147483647)throw Error('FINITE_HELPER_TIMER_BUDGET_REQUIRED');
 const receipt=await runtime.boundedProcess(process.execPath,args,{cwd,env,log:path.join(out,label+'.log'),budgetMs:budget,signal:controller.signal});records.push({label,...receipt});json('children.json',records);
 if(!receipt.processClosed||receipt.remainingOwnedGroupMembers.length||receipt.spawnError||receipt.budgetExhausted)throw Object.assign(Error('OWNED_CHILD_NOT_COMPLETELY_CLOSED'),{receipt});return receipt;
}
(async()=>{
 json('binding.json',{...admission,reviewPath,reviewSha256:hash(reviewPath),files,selectedInputsBefore:expected,tmp,actualDataRoots:dirs,HOMEUnchanged:true,CODEX_HOMEUnchanged:true,sharedBuild:false,backendWriter:false,nativeApp:false,officialModel:false});
 let result,after,drift=[];
 try{
  if(group==='scanner'){
   const source=fs.readFileSync(path.join(root,files[0]),'utf8'),count=(source.match(/\btest\s*\(/g)||[]).length;if(!count)throw Error('SCANNER_CASE_COUNT_MISSING');
   const budget=count*120000+480000,total=budget+720000+runtime.GROUP_TERM_GRACE_MS+runtime.GROUP_KILL_GRACE_MS;
   json('budget.json',{declaredLiteralCases:count,actualTAPCountSeparate:true,caseMs:120000,childBudgetMs:budget,outerMs:total,psAndSourceReportReserveMs:720000,termGraceMs:runtime.GROUP_TERM_GRACE_MS,killGraceMs:runtime.GROUP_KILL_GRACE_MS,monotonicSegmentMs:60000});startOuter(total);
   result=await execute('tests',['--test','--test-timeout=120000',files[0]],root,budget);
  }else{
   const cli=path.join(root,'frontend/node_modules/vitest/vitest.mjs'),relative=files.map(p=>p.slice('frontend/'.length));const common=['--retry=0','--bail=0','--allowOnly=false','--no-file-parallelism','--maxWorkers=1','--maxConcurrency=1','--testTimeout=1800000','--hookTimeout=3000000','--teardownTimeout=120000'],selected=phase==='regression'?[]:['--testNamePattern=T1250'];
   const collectBudget=1800000;startOuter(collectBudget+720000+runtime.GROUP_TERM_GRACE_MS+runtime.GROUP_KILL_GRACE_MS);
   const listPath=path.join(out,'list.json'),listed=await execute('list',[cli,'list',...relative,...selected,...common,'--json='+listPath],path.join(root,'frontend'),collectBudget);if(listed.code!==0)throw Error('ACTUAL_COLLECT_FAILED');
   const cases=JSON.parse(fs.readFileSync(listPath,'utf8'));if(!Array.isArray(cases)||!cases.length||cases.some(c=>!files.some(f=>path.join(root,f)===c.file)||typeof c.name!=='string'))throw Error('ACTUAL_CASE_INVENTORY_INVALID');
   const f=new Set(cases.map(c=>c.file)).size,n=cases.length,budget=n*(1800000+3000000*2)+f*3000000*2+120000*2+480000;
   clearTimeout(outerTimer);if(outerExhausted)throw Error('COLLECT_OUTER_EXHAUSTED');const total=budget+720000+runtime.GROUP_TERM_GRACE_MS+runtime.GROUP_KILL_GRACE_MS;startOuter(total);
   json('budget.json',{actualCollectedCases:n,actualFiles:f,bodyMs:1800000,perCaseBeforeAfterHooksMs:6000000,perFileBeforeAfterAllMs:6000000,poolStartTeardownMs:240000,childCleanupReportMs:480000,collectPhaseMs:collectBudget,executionPhaseOuterMs:total,fullSerialDeclaredMs:collectBudget+720000+360000+total,psAndSourceReportReserveMs:720000,termGraceMs:runtime.GROUP_TERM_GRACE_MS,killGraceMs:runtime.GROUP_KILL_GRACE_MS,segmentsMaxMs:60000,noPersistentDeadlineChange:true});
   result=await execute('tests',[cli,'run',...relative,...selected,...common,'--reporter=default','--reporter=json','--outputFile.json='+path.join(out,'tests.json')],path.join(root,'frontend'),budget);
  }
 }catch(error){result=error.receipt??{code:null,error:String(error),status:'UNKNOWN_OR_PRECONDITION_FAILURE'};}
 finally{
  after=inputs();drift=after.filter((x,index)=>JSON.stringify(x)!==JSON.stringify(expected[index]));if(after.length!==expected.length)drift.push({inventoryChanged:true});
  json('result.json',{result,outerExhausted,sourceInputUnchanged:drift.length===0,selectedInputsAfter:after,sourceDrift:drift,records,notAppOrModelAcceptance:true,ownedTmpPreserved:true,evidence:out});clearTimeout(outerTimer);
 }
 console.log(JSON.stringify({out,code:result.code,outerExhausted,sourceInputUnchanged:drift.length===0}));process.exitCode=result.code===0&&!outerExhausted&&!drift.length?0:1;
})().catch(error=>{json('fatal.json',{error:String(error),tmp,noResultFabricated:true});clearTimeout(outerTimer);process.exitCode=1;});
