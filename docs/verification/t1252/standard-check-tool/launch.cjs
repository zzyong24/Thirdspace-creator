'use strict';const entryClock=performance.now();
const fs=require('node:fs'),path=require('node:path'),os=require('node:os'),crypto=require('node:crypto');
const root=fs.realpathSync(path.resolve(__dirname,'../../../..')),tool=__filename,bindingFile=path.join(__dirname,'input-binding.json');
const hash=p=>crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex');
const PREP=240000,INSTALL=1800000,HELPER_CLEANUP=2160000,AFTER=600000,MARGIN=120000,OUTER=PREP+INSTALL+HELPER_CLEANUP+AFTER+MARGIN;
const deadline=entryClock+OUTER,controller=new AbortController();let outerTimer,expired=false;
const onStop=()=>controller.abort(Error("OWNED_INSTALL_INTERRUPTED"));process.once("SIGINT",onStop);process.once("SIGTERM",onStop);
function tick(){if(performance.now()>=deadline){expired=true;controller.abort(Error('INSTALL_FULL_OUTER_EXHAUSTED'));}else outerTimer=setTimeout(tick,Math.min(60000,deadline-performance.now()));}tick();
const json=(file,value)=>fs.writeFileSync(file,JSON.stringify(value,null,2)+'\n',{flag:'wx',mode:0o600});
async function run(){
 let binding,initialTool,initialBinding,runRoot,result,failure=null,after=[];
 try{
  if(process.argv[2]!=='install'||process.platform!=='darwin'||process.env.CREATOROS_T1252_STANDARD_TOOL_REVIEWED!=='1'||process.env.CREATOROS_T1252_STANDARD_TOOL_SHA256!==hash(tool)||process.env.CREATOROS_T1252_STANDARD_BINDING_SHA256!==hash(bindingFile))throw Error('EXACT_ROOT_INSTALL_ONLY_REVIEW_REQUIRED');
  binding=JSON.parse(fs.readFileSync(bindingFile,'utf8'));initialBinding=hash(bindingFile);initialTool=hash(tool);
  if(process.execPath!==binding.node.path||hash(process.execPath)!==binding.node.sha256||binding.outerInstallMs!==OUTER||JSON.stringify(binding.allowedModes)!=='["install"]')throw Error('FIXED_NODE_FULL_INSTALL_ONLY_BINDING_REQUIRED');
  if(!Array.isArray(binding.inputs)||new Set(binding.inputs.map(x=>x.path)).size!==binding.inputs.length)throw Error('UNIQUE_INPUT_INVENTORY_REQUIRED');
  for(const x of binding.inputs){if(typeof x.path!=='string'||path.isAbsolute(x.path)||x.path.split('/').includes('..')||hash(path.join(root,x.path))!==x.sha256)throw Error('SOURCE_INPUT_CHANGED');}
  for(const x of binding.executables)if(fs.realpathSync(x.path)!==x.realpath||hash(x.realpath)!==x.sha256)throw Error('PNPM_EXECUTABLE_CHANGED');
  for(const x of binding.installedImplementationInputs)if(hash(x.path)!==x.sha256)throw Error('PNPM_FULL_IMPLEMENTATION_CHANGED');
  const helper=path.join(root,binding.helper.path);if(hash(helper)!==binding.helper.sha256||binding.helper.sha256!=='393f88771f732e57959ce948a61104fe616c6090faa3e21808186a6df7df3dea')throw Error('ACTUAL_REVIEWED_BOUNDED_PROCESS_HELPER_REQUIRED');
  const runtime=require(helper);
  const lock=fs.readFileSync(path.join(root,'pnpm-lock.yaml'),'utf8'),insert='      undici:\n        specifier: 7.27.2\n        version: 7.27.2\n';if(lock.split(insert).length!==2||crypto.createHash('sha256').update(lock.replace(insert,'')).digest('hex')!==binding.originalLockSha256)throw Error('EXACT_DIRECT_IMPORTER_ONLY_LOCK_CHANGE_REQUIRED');
  if(controller.signal.aborted||performance.now()-entryClock>PREP||deadline-performance.now()<INSTALL+HELPER_CLEANUP+AFTER+MARGIN)throw Error('FULL_INSTALL_AND_CLEANUP_REMAINING_REQUIRED');
  runRoot=fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(),'creatoros-t1252-install-')));fs.chmodSync(runRoot,0o700);json(path.join(runRoot,'marker.json'),{root:runRoot,nonce:crypto.randomUUID(),pid:process.pid,mode:'install-only-no-service'});
  const env=runtime.cleanEnv();for(const k of Object.keys(env))if(/^(CREATOROS_|GROWTH_|TAURI_|S3_|AWS_|OPENAI_|ANTHROPIC_|AZURE_|GOOGLE_API_|GEMINI_|DEEPSEEK_|REDIS_)/.test(k)||/(?:API_KEY|AUTH_TOKEN|SECRET|PASSWORD)$/.test(k))delete env[k];
  Object.assign(env,{PATH:path.dirname(binding.node.path)+':/opt/homebrew/bin:/usr/bin:/bin',CI:'1',TMPDIR:runRoot,TMP:runRoot,TEMP:runRoot,PNPM_UPDATE_NOTIFIER:'false',NO_COLOR:'1'});
  if(env.HOME!==process.env.HOME||env.CODEX_HOME!==process.env.CODEX_HOME||Object.keys(env).some(k=>k.startsWith('PG')||['DATABASE_URL','TEST_DATABASE_URL','NODE_PG_FORCE_NATIVE'].includes(k)))throw Error('NO_CREDENTIAL_OR_FOREIGN_PG_ENV_REQUIRED');
  const pnpm=binding.executables.find(x=>x.name==='pnpm').realpath,args=[pnpm,'--filter','@creatoros/mcp-server','install','--offline','--frozen-lockfile','--ignore-scripts'];
  json(path.join(runRoot,'start.json'),{at:new Date().toISOString(),root,runRoot,toolSha256:initialTool,bindingSha256:initialBinding,node:binding.node,helper:binding.helper,args,installMs:INSTALL,helperCleanupReserveMs:HELPER_CLEANUP,prepareMs:PREP,afterMs:AFTER,marginMs:MARGIN,outerMs:OUTER,entryElapsedMs:performance.now()-entryClock,HOMEUnchanged:true,CODEX_HOMEUnchanged:true,noService:true,noModel:true,noApp:true});console.log(JSON.stringify({runRoot,stage:'install'}));
  result=await runtime.boundedProcess(binding.node.path,args,{cwd:root,env,log:path.join(runRoot,'offline-install.log'),budgetMs:INSTALL,signal:controller.signal});json(path.join(runRoot,'install-receipt.json'),result);
  if(result.code!==0||result.spawnError||result.budgetExhausted||!result.processClosed||result.remainingOwnedGroupMembers.length||expired)throw Error('INSTALL_OR_OWNED_CLEANUP_ACTUAL_FAILURE');
  const direct=path.join(root,'mcp-server/node_modules/undici'),resolved=fs.realpathSync(direct),p=path.join(resolved,'package.json'),pkg=JSON.parse(fs.readFileSync(p,'utf8'));
  if(!resolved.startsWith(root+'/node_modules/.pnpm/')||pkg.version!=='7.27.2')throw Error('ACTUAL_OWNED_DIRECT_7_27_2_REQUIRED');
  json(path.join(runRoot,'installed-undici.json'),{path:direct,realpath:resolved,version:pkg.version,packageSha256:hash(p),standardTypesOrRuntimeNotYetRun:true});
 }catch(e){failure??=e;}
 finally{
  try{after=(binding?.inputs??[]).map(x=>({path:x.path,same:hash(path.join(root,x.path))===x.sha256}));if(after.some(x=>!x.same)||initialTool!==hash(tool)||initialBinding!==hash(bindingFile)||binding?.node.sha256!==hash(process.execPath))failure??=Error('INSTALL_BOUND_INPUT_DRIFT');for(const x of binding?.installedImplementationInputs??[])if(hash(x.path)!==x.sha256)throw Error('PNPM_IMPLEMENTATION_AFTER_DRIFT');}catch(e){failure??=e;}
  process.removeListener("SIGINT",onStop);process.removeListener("SIGTERM",onStop);if(performance.now()>=deadline)expired=true;clearTimeout(outerTimer);if(runRoot){json(path.join(runRoot,'final.json'),{at:new Date().toISOString(),status:failure||expired?'failed':'actual_offline_install_completed',error:failure?.message??null,expired,elapsedMs:performance.now()-entryClock,receipt:result??null,inputsAfter:after,actualTestsRun:0,actualBuildsRun:0,officialModelOrAppNotRun:true,runRoot});console.log(JSON.stringify({runRoot,status:failure||expired?'failed':'actual_offline_install_completed',error:failure?.message??null}));}else console.error(JSON.stringify({status:'startup_failed',error:failure?.message}));if(failure||expired)process.exitCode=1;
 }
}
if(require.main===module)run().catch(e=>{clearTimeout(outerTimer);console.error(JSON.stringify({status:'uncaught_failed',error:e.name}));process.exitCode=1;});
