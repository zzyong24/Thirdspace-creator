/** T1355/T1354 隔离验收宿主。只使用全新私有 PostgreSQL 与合成平台页面。 */
import {createServer} from 'node:http';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {createRequire} from 'node:module';
import {randomUUID,createHash} from 'node:crypto';
import {dirname,join,resolve,sep} from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {mkdir,readFile,writeFile,appendFile,readdir,lstat,realpath,rename,rm,chmod} from 'node:fs/promises';
import {createRuntimeDb,type Db} from '../../../../backend/src/db.ts';
import {createIdentityRepository,ensureLocalUser} from '../../../../backend/src/modules/identity/index.ts';
import {createAccountGroupService,createAccountGroupTransport,createPlatformAccountService,createPlatformAccountTransport,createAccountBindingService,createAccountBindingTransport,createAccountBindingPreparer,createAccountBindingCommitter,createBrowserProfileAuthority,createLocalPlatformAccountBindingStage,type AccountBindingStagePort} from '../../../../backend/src/modules/platform-account/index.ts';
import {createHostBrowserProfileLifecycle} from '../../../../backend/src/modules/execution/index.ts';
import {ENDPOINTS,type RequestContext,type PlatformAccountCapabilitiesResource} from '../../../../contract/src/index.ts';

const runFile=promisify(execFile),repo=resolve(dirname(fileURLToPath(import.meta.url)),'../../../..');
const requireFrontend=createRequire(join(repo,'frontend/package.json'));
if(!process.env.T1355_FIXTURE_ROOT)throw Error('T1355_FIXTURE_ROOT_REQUIRED');
const requestedRoot=resolve(process.env.T1355_FIXTURE_ROOT),root=await realpath(requestedRoot),rootStat=await lstat(requestedRoot);
if(rootStat.isSymbolicLink()||!rootStat.isDirectory()||rootStat.uid!==process.getuid?.()||(await readdir(root)).length)throw Error('FIXTURE_ROOT_MUST_BE_NEW_EMPTY_OWNED_DIRECTORY');
await chmod(root,0o700);
function port(name:string){const n=Number(process.env[name]);if(!Number.isInteger(n)||n<1024||n>65535||[5432,55422].includes(n))throw Error(name+'_INVALID');return n;}
const pgPort=port('T1355_PG_PORT'),hostPort=port('T1355_HOST_PORT');if(pgPort===hostPort)throw Error('FIXTURE_PORTS_MUST_DIFFER');
const pgBin='/opt/homebrew/bin',dataDir=join(root,'pgdata'),socketDir=join(root,'socket'),pgLog=join(root,'postgres.log');
const databaseURL=`postgresql://t1355_fixture@127.0.0.1:${pgPort}/creatoros_t1355`;
const owner={task:'T1355',nonce:randomUUID(),root,dataDir,pgPort,hostPort,helperPid:process.pid};
await writeFile(join(root,'owner.json'),JSON.stringify(owner,null,2)+'\n',{flag:'wx',mode:0o600});
const childEnv={...process.env};for(const key of Object.keys(childEnv))if(key.startsWith('PG')||key==='DATABASE_URL'||key==='NODE_PG_FORCE_NATIVE')delete childEnv[key];
async function pgCommand(bin:string,args:string[]){return runFile(join(pgBin,bin),args,{env:childEnv,timeout:240000,maxBuffer:4*1024*1024});}
const now=()=>new Date().toISOString(),nextId=(prefix:string)=>`${prefix}-t1355-${randomUUID()}`;
const platforms=['douyin','xiaohongshu','kuaishou','wechatOfficial','wechatVideo'] as const;
type Platform=typeof platforms[number];
type Release={outcome:'success'|'failed';accountHandle?:string;navigationRace?:boolean};
type StageEntry={runId:string;platform:Platform;stagingKey:string;directory?:string;phase:string;release?:Release;resolve?:(value:Release)=>void;reject?:(error:unknown)=>void};
const stages=new Map<string,StageEntry>(),runIds:string[]=[],runGroups=new Map<string,string>(),hostCalls:Array<Record<string,unknown>>=[];
const event=(kind:string,fields:Record<string,unknown>={})=>hostCalls.push({kind,...fields,at:now()});
const capabilities:PlatformAccountCapabilitiesResource[]=platforms.map(platform=>({platform,bind:{available:true,method:'qr',reason:'隔离受控身份宿主'},collect:{available:false,reason:'验收宿主不装配采集'},publish:{available:false,reason:'验收宿主不装配发布'},draft:{available:false,reason:'验收宿主不装配草稿'},manual:{available:false,reason:'验收只走真实扫码服务'}}));
let runtime:Awaited<ReturnType<typeof createRuntimeDb>>|undefined,binding:ReturnType<typeof createAccountBindingService>|undefined;
let pgPid:number|undefined,pgStarted=false,ready=false,stopping=false,startResponses=0,drain:Promise<void>|undefined;
const background=new AbortController();let timer:ReturnType<typeof setInterval>|undefined;
let currentGroupId='',currentGroupName='绑定验收当前组',userId='',fillerGroupIds:string[]=[],seedAccountIds:string[]=[];
let server:ReturnType<typeof createServer>|undefined;

async function ownedPg(){
 const lines=(await readFile(join(dataDir,'postmaster.pid'),'utf8')).split('\n');
 if(Number(lines[0])!==pgPid||lines[1]!==dataDir||Number(lines[3])!==pgPort||lines[5]!=='127.0.0.1')throw Error('PRIVATE_PG_IDENTITY_MISMATCH');
 const {stdout}=await runFile('/bin/ps',['-p',String(pgPid),'-o','command='],{timeout:180000});
 if(!stdout.includes(dataDir)||!stdout.includes('postgres'))throw Error('PRIVATE_PG_PROCESS_MISMATCH');
}
async function shutdown(reason:string){
 if(stopping)return;stopping=true;ready=false;if(timer)clearInterval(timer);background.abort(Error('fixture stopping'));
 const failures:string[]=[];
 try{await binding?.stop();await drain;}catch{failures.push('binding.stop');}
 try{if(server){server.closeAllConnections();await new Promise<void>((done,reject)=>server!.close(error=>error?reject(error):done()));}}catch{failures.push('http.close');}
 try{await runtime?.pool.end();}catch{failures.push('pool.end');}
 if(pgStarted)try{await ownedPg();await pgCommand('pg_ctl',['-D',dataDir,'-w','-t','180','stop','-m','fast']);pgStarted=false;}catch{failures.push('private-pg.stop');}
 await writeFile(join(root,'STOPPED.json'),JSON.stringify({reason,at:now(),helperPid:process.pid,pgPid,failures,originalRootRetained:true},null,2)+'\n',{mode:0o600});
 process.exitCode=failures.length?1:0;
}
for(const signal of ['SIGTERM','SIGINT'] as const)process.once(signal,()=>{void shutdown(signal).then(()=>{process.exit(process.exitCode??0);});});

async function waitRelease(entry:StageEntry,signal:AbortSignal){
 signal.throwIfAborted();entry.phase='login';event('login-gate',{runId:entry.runId,platform:entry.platform});
 let value:Release,removeAbort=()=>{};
 try{value=await new Promise<Release>((done,reject)=>{const onAbort=()=>reject(signal.reason);removeAbort=()=>signal.removeEventListener('abort',onAbort);signal.addEventListener('abort',onAbort,{once:true});entry.resolve=done;entry.reject=reject;if(signal.aborted)onAbort();});}
 finally{removeAbort();delete entry.resolve;delete entry.reject;}
 entry.release=value;signal.throwIfAborted();
 if(value.outcome==='failed')throw Object.assign(Error('受控平台本次未完成身份核验'),{code:'FIXTURE_IDENTITY_FAILED'});
 return value;
}
const escapeHtml=(s:string)=>s.replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]!));
let wechatFactories:Promise<{createWechatBrowserSource:Function;createVerifiedWechatDomWitnesses:Function}>|undefined;
async function officialLogin(entry:StageEntry,controls:{signal:AbortSignal;onStopped:()=>Promise<void>;onStopUnconfirmed:(retry:()=>Promise<void>)=>void}){
 // 窄bridge禁keepNames，避免tsx注入__name污染真实Page.evaluate闭包。
 wechatFactories??=(async()=>{const {build}=requireFrontend('esbuild');const outfile=join(root,'wechat-bridge.mjs');await build({stdin:{contents:`export {createWechatBrowserSource} from ${JSON.stringify(join(repo,'ai-worker/src/runtime/platform/wechat-browser-source.ts'))};export {createVerifiedWechatDomWitnesses} from ${JSON.stringify(join(repo,'ai-worker/src/runtime/platform/wechat-dom-witness.ts'))};`,resolveDir:repo,sourcefile:'t1355-wechat-bridge.ts'},outfile,bundle:true,platform:'node',format:'esm',packages:'external',keepNames:false,alias:{'@creatoros/contract/timeout-policy':join(repo,'contract/src/timeout-policy.ts')},logLevel:'silent'});return import(pathToFileURL(outfile).href);})();
 const {createWechatBrowserSource,createVerifiedWechatDomWitnesses}=await wechatFactories;
 const {chromium}=requireFrontend('@playwright/test');const browser=await chromium.launch({headless:true,timeout:120000,args:['--disable-background-networking','--host-resolver-rules=MAP * ~NOTFOUND, EXCLUDE localhost']});
 let stopped=false,context:any;const stoppedOnce=async()=>{if(!stopped){await controls.onStopped();stopped=true;event('profile-stopped',{runId:entry.runId});}};
 try{
  context=await browser.newContext({serviceWorkers:'block'});const page=await context.newPage();let fieldsReady=!entry.release?.navigationRace,attemptedRace=false,contextLosses=0,navigations=0;
  const stableId='wx'+createHash('sha256').update(entry.runId).digest('hex').slice(0,20),handle=entry.release?.accountHandle??'受控合成公众号';
  await context.route('**/*',async(route:any)=>{const url=new URL(route.request().url());if(url.origin!=='https://mp.weixin.qq.com'){event('blocked-external-request',{runId:entry.runId});await route.abort();return;}
   const fields=`<li class="weui-desktop-setting__item"><span class="weui-desktop-setting__item__label">AppID</span><span class="weui-desktop-setting__item__info">${stableId}</span></li><li class="weui-desktop-setting__item"><span class="weui-desktop-setting__item__label">名称</span><span class="weui-desktop-setting__item__info">${escapeHtml(handle)}</span></li>`;
   await route.fulfill({contentType:'text/html; charset=utf-8',body:'<!doctype html><meta charset="utf-8"><body>'+(url.pathname==='/cgi-bin/settingpage'?(fieldsReady?fields:'<p>字段尚未就绪</p>'):'<a href="/cgi-bin/settingpage">账号设置</a>')+'</body>'});event('synthetic-official-request-fulfilled',{runId:entry.runId});
  });
  page.on('framenavigated',(frame:any)=>{if(frame===page.mainFrame())navigations++;});const rawEvaluate=page.evaluate.bind(page),rawGoto=page.goto.bind(page);
  const protectedPage=new Proxy(page,{get(target,key){if(key==='evaluate')return async(fn:any,arg:unknown)=>{if(entry.release?.navigationRace&&!attemptedRace){attemptedRace=true;fieldsReady=true;const navigation=rawGoto('https://mp.weixin.qq.com/cgi-bin/settingpage?synthetic-navigation=1',{waitUntil:'domcontentloaded',timeout:120000});try{return await rawEvaluate(fn,arg);}catch(error){if(error instanceof Error&&error.message.includes('Execution context was destroyed'))contextLosses++;throw error;}finally{await navigation;}}return rawEvaluate(fn,arg);};const value=Reflect.get(target,key,target);return typeof value==='function'?value.bind(target):value;}});
  const protectedContext=new Proxy(context,{get(target,key){if(key==='pages')return()=>[protectedPage];if(key==='close')return async()=>{await target.close();await stoppedOnce();};const value=Reflect.get(target,key,target);return typeof value==='function'?value.bind(target):value;}});
  const source=createWechatBrowserSource({...createVerifiedWechatDomWitnesses(),openProfile:async()=>{event('official-profile-open',{runId:entry.runId});return protectedContext;}});
  const identity=await source.login('wechatOfficial',entry.directory,{signal:controls.signal,deadlineAt:new Date(Date.now()+2400000).toISOString(),onStopped:stoppedOnce,onStopUnconfirmed:controls.onStopUnconfirmed,onDiagnostic:(e:any)=>event('official-diagnostic',{runId:entry.runId,platform:e.platform,stage:e.stage,code:e.code,exceptionName:e.exceptionName})});
  event('official-identity',{runId:entry.runId,contextLosses,navigations,source:identity.source,platformIdentity:identity.platformIdentity});return identity;
 }finally{try{await context?.close();await browser.close();await stoppedOnce();}catch(error){controls.onStopUnconfirmed(async()=>{await context?.close();await browser.close();await stoppedOnce();});throw error;}}
}

try{
 await mkdir(socketDir,{mode:0o700});await pgCommand('initdb',['-D',dataDir,'--username=t1355_fixture','--auth-local=trust','--auth-host=trust','--encoding=UTF8','--no-locale']);
 // macOS临时根可能超过Unix socket的103字节限制；本夹具仅TCP loopback，不创建共享socket。
 await appendFile(join(dataDir,'postgresql.auto.conf'),"\nunix_socket_directories = ''\n");
 await pgCommand('pg_ctl',['-D',dataDir,'-l',pgLog,'-o',`-h 127.0.0.1 -p ${pgPort}`,'-w','-t','180','start']);pgStarted=true;pgPid=Number((await readFile(join(dataDir,'postmaster.pid'),'utf8')).split('\n')[0]);await ownedPg();
 await pgCommand('createdb',['--host=127.0.0.1',`--port=${pgPort}`,'--username=t1355_fixture','--maintenance-db=postgres','creatoros_t1355']);
 runtime=await createRuntimeDb({connectionString:databaseURL});const {db,pool}=runtime;
 const identity=await ensureLocalUser(createIdentityRepository(db,{now,nextId}),{now,nextId});userId=identity.id;
 const baseCtx:RequestContext={userId,accountId:null,requestId:'t1355-fixture-seed',source:'user'};
 const groups=createAccountGroupService({db,now,nextId}),accounts=createPlatformAccountService({db,now,nextId,bindingCapabilities:async()=>capabilities});
 const current=await groups.create(baseCtx,{name:currentGroupName,idempotencyKey:'t1355-current'});currentGroupId=current.id;
 const filler=await groups.create(baseCtx,{name:'分页隔离组',idempotencyKey:'t1355-filler'});fillerGroupIds=[filler.id];
 // 合成未来时钟只用于filler，让真实DESC分页中的新绑定账号位于101+；不伪造meta。
 const fillerStamp=new Date(Date.now()+366*86400000).toISOString(),fillerService=createPlatformAccountService({db,now:()=>fillerStamp,nextId});
 for(let i=0;i<100;i++){const account=await fillerService.createAccount({...baseCtx,groupId:filler.id},{platform:'douyin',accountHandle:`分页既有账号${String(i+1).padStart(3,'0')}`,externalAccountId:`t1355-filler-${i}`});seedAccountIds.push(account.id);}
 const authority=createBrowserProfileAuthority(db,join(root,'douyin-profiles'),{localPlatformRoot:join(root,'local-profiles')});
 const lifecycle=createHostBrowserProfileLifecycle(db,{resolveProfile:(dir,signal)=>authority.resolveProfile(dir,signal),hostInstanceId:owner.nonce,waitTimeoutMs:240000});
 const adoptions=new Map<string,{targetDir:string;userId:string;runId:string;backup:string|null}>();
 const inside=(value:string)=>{if(!resolve(value).startsWith(root+sep))throw Error('PROFILE_OUTSIDE_FIXTURE');};
 const profileFiles={
  async prepareAdoption(source:string,target:string,who:{userId:string;runId:string}){inside(source);inside(target);const backup=target+'.before-'+who.runId;let previous=false;try{await lstat(target);await rename(target,backup);previous=true;}catch(error){if((error as NodeJS.ErrnoException).code!=='ENOENT')throw error;}await rename(source,target);adoptions.set(source,{...who,targetDir:target,backup:previous?backup:null});event('profile-adopted',{runId:who.runId});return {rollbackProfile:async()=>{await rename(target,source);if(previous)await rename(backup,target);adoptions.delete(source);},finalizeProfile:async()=>{if(previous)await rm(backup,{recursive:true});adoptions.delete(source);}};},
  async readAdoption(source:string){return adoptions.get(source)??null;},
  async rollbackAdoption(source:string){const a=adoptions.get(source);if(!a)return;await rename(a.targetDir,source);if(a.backup)await rename(a.backup,a.targetDir);adoptions.delete(source);},
  async discardStaging(source:string){inside(source);await rm(source,{recursive:true,force:true});},
 };
 function localStage(platform:Exclude<Platform,'douyin'>):AccountBindingStagePort{
  const inner=createLocalPlatformAccountBindingStage({db,authority,lifecycle,now,nextId,platform,scopes:[],profileFiles,commitAuthorization:async()=>{/* 本验收不创建采集授权或任务。 */},loadLogin:async()=>async(directory,controls)=>{
   const entry=[...stages.values()].find(item=>item.directory===directory);if(!entry)throw Error('HOST_STAGE_NOT_OWNED');let release:Release;
   try{release=await waitRelease(entry,controls.signal);}catch(error){await controls.onStopped();event('profile-stopped',{runId:entry.runId});throw error;}
   if(platform==='wechatOfficial')return officialLogin(entry,controls);
   try{return {platformIdentity:`synthetic-${platform}-${entry.runId}`,displayName:release.accountHandle??`合成${platform}账号`,source:platform+':/synthetic-account'};}finally{await controls.onStopped();event('profile-stopped',{runId:entry.runId});}
  }});
  return {...inner,async createStaging(ctx,runId){const result=await inner.createStaging(ctx,runId),entry:StageEntry={runId,platform,stagingKey:result.stagingKey,phase:'created'};entry.directory=(await authority.authorizeBindingStaging(ctx,runId,result.stagingKey)).authDir;await mkdir(entry.directory,{recursive:true,mode:0o700});await writeFile(join(entry.directory,'fixture-profile.json'),JSON.stringify({synthetic:true,runId,platform}),{mode:0o600,flag:'wx'});stages.set(runId,entry);event('stage-created',{runId,platform});return result;},async prepareCommit(ctx,input){const entry=stages.get([...stages.values()].find(s=>s.stagingKey===input.stagingKey)!.runId)!;entry.phase='prepareCommit';event('prepareCommit',{runId:entry.runId});await inner.prepareCommit!(ctx,input);},async commit(ctx,input,tx){const result=await inner.commit(ctx,input,tx);event('commit',{runId:[...stages.values()].find(s=>s.stagingKey===input.stagingKey)?.runId,accountId:result.accountId});return result;}};
 }
 const douyinPrepare=createAccountBindingPreparer({db,now,nextId,platform:'douyin'}),prepared=new Map<string,Awaited<ReturnType<typeof douyinPrepare>>>();
 const douyinCommit=createAccountBindingCommitter({platform:'douyin',now,nextId,prepareProfile:async()=>({rollbackProfile:async()=>{},finalizeProfile:async()=>{}})});
 const douyin:AccountBindingStagePort={async createStaging(_ctx,runId){const stagingKey=nextId('stage');stages.set(runId,{runId,platform:'douyin',stagingKey,phase:'created'});event('stage-created',{runId,platform:'douyin'});return {stagingKey};},async login(_ctx,{stagingKey,signal}){await waitRelease([...stages.values()].find(s=>s.stagingKey===stagingKey)!,signal);return true;},async identity(_ctx,{stagingKey}){const e=[...stages.values()].find(s=>s.stagingKey===stagingKey)!;return {externalAccountId:'synthetic-douyin-'+e.runId,accountHandle:e.release?.accountHandle??'合成抖音账号'};},async prepareCommit(ctx,input){prepared.set(input.stagingKey,await douyinPrepare(ctx,input.identity));event('prepareCommit',{runId:[...stages.values()].find(s=>s.stagingKey===input.stagingKey)?.runId});},async commit(ctx,input,tx){const result=await douyinCommit(ctx,{...input,prepared:prepared.get(input.stagingKey)!},tx);event('commit',{runId:[...stages.values()].find(s=>s.stagingKey===input.stagingKey)?.runId,accountId:result.accountId});return result;},async discard(_ctx,{runId}){event('discard',{runId});}};
 binding=createAccountBindingService({db,now,nextId,stage:douyin,localStages:{xiaohongshu:localStage('xiaohongshu'),kuaishou:localStage('kuaishou'),wechatOfficial:localStage('wechatOfficial'),wechatVideo:localStage('wechatVideo')},capabilities:async()=>capabilities});
 const groupTransport=createAccountGroupTransport(()=>groups),accountTransport=createPlatformAccountTransport(()=>accounts),bindingTransport=createAccountBindingTransport(()=>binding!);
 const allowed=new Map(Object.values(ENDPOINTS).filter(e=>['accounts.bind.start','accounts.bind.status','accounts.bind.cancel','accountGroups.list','accountGroups.get','accountGroups.create','accountGroups.update','accountGroups.archive','accountGroups.restore','accounts.list','accounts.get','accounts.bindingCapabilities','accounts.collectionPlanReadiness'].includes(e.id)).map(e=>[e.id,e]));
 function kick(){if(stopping||drain||startResponses)return;drain=binding!.drainAccountBindingQueue({signal:background.signal,shouldStop:()=>stopping}).catch(()=>{event('drain-error');}).finally(()=>{drain=undefined;});}
 async function state(){const ctx={...baseCtx,groupId:currentGroupId},all=await accounts.listAccounts(ctx,{limit:10000,offset:0});const runs=await Promise.all(runIds.map(id=>binding!.status({...ctx,groupId:runGroups.get(id)??currentGroupId},id)));const counts=await pool.query('SELECT (SELECT count(*)::int FROM platform_collection_runs) AS collection_runs,(SELECT count(*)::int FROM ai_tasks) AS ai_tasks,(SELECT count(*)::int FROM scheduled_job) AS scheduled_jobs');return {userId,currentGroupId,currentGroupName,fillerGroupIds,accountIds:all.rows.map(a=>a.id),runIds:[...runIds],hostCalls:[...hostCalls],hostCallCount:hostCalls.length,stage:[...stages.values()].some(s=>s.resolve)?'waiting_verification':runs.at(-1)?.status??'idle',runs,stageDetails:[...stages.values()].map(s=>({runId:s.runId,platform:s.platform,stage:s.phase,pending:Boolean(s.resolve)})),collectionSubmissions:counts.rows[0].collection_runs,aiTaskCount:counts.rows[0].ai_tasks,scheduledJobCount:counts.rows[0].scheduled_jobs,networkObservation:{scope:'official synthetic BrowserContext route requests only',syntheticOfficialFulfilled:hostCalls.filter(e=>e.kind==='synthetic-official-request-fulfilled').length,unexpectedOriginsBlocked:hostCalls.filter(e=>e.kind==='blocked-external-request').length},configuration:{externalHostAdaptersInstalled:false,collectionAdapterInstalled:false,onBoundInstalled:false},fillerClock:fillerStamp};}
 const json=(response:import('node:http').ServerResponse,status:number,body:unknown)=>{response.writeHead(status,{'content-type':'application/json; charset=utf-8','cache-control':'no-store'});response.end(JSON.stringify(body));};
 server=createServer(async(request,response)=>{
  let isStart=false;
  try{
   if(request.method==='GET'&&request.url==='/health'){const databaseReady=ready&&await pool.query('SELECT 1 AS ready').then(()=>true,()=>false);json(response,databaseReady?200:503,{ready:databaseReady});return;}
   if(request.method==='GET'&&request.url==='/state'){json(response,200,await state());return;}
   const chunks:Buffer[]=[];let size=0;for await(const part of request){size+=part.length;if(size>1024*1024)throw Error('FIXTURE_BODY_TOO_LARGE');chunks.push(Buffer.from(part));}const body=JSON.parse(Buffer.concat(chunks).toString('utf8')||'{}');
   if(request.method==='POST'&&request.url==='/control/release'){
    const pending=[...stages.values()].filter(s=>s.resolve),entry=body.runId?stages.get(body.runId):pending.length===1?pending[0]:undefined;
    if(!entry?.resolve||!['success','failed'].includes(body.outcome))throw Object.assign(Error('本run尚未到登录门，或释放目标不唯一'),{code:'ConflictError'});
    if(body.accountHandle!==undefined&&(typeof body.accountHandle!=='string'||!body.accountHandle.trim()||body.accountHandle.length>200))throw Error('FIXTURE_HANDLE_INVALID');
    const release:Release={outcome:body.outcome,accountHandle:body.accountHandle,navigationRace:body.navigationRace===true};entry.phase='released';event('release',{runId:entry.runId,outcome:release.outcome,navigationRace:release.navigationRace});entry.resolve(release);json(response,200,{released:entry.runId});return;
   }
   if(request.method==='POST'&&request.url==='/rpc'){
    const endpoint=allowed.get(body.id);if(!endpoint){json(response,404,{error:{code:'UnsupportedOperationError',message:'验收宿主未装配此操作'}});return;}
    const scope=body.scope??{},ctx:RequestContext={userId,requestId:nextId('req'),source:'user',groupId:typeof scope.groupId==='string'?scope.groupId:currentGroupId,accountId:typeof scope.accountId==='string'?scope.accountId:null};
    const transport=endpoint.id.startsWith('accounts.bind.')?bindingTransport:endpoint.id.startsWith('accountGroups.')?groupTransport:accountTransport;
    isStart=endpoint.id==='accounts.bind.start';if(isStart)startResponses++;
    const envelope=await transport.request(endpoint,body.input??{},ctx);
    if(isStart){const value=(envelope as {data:{runId:string;groupId:string}}).data,id=value.runId;if(!runIds.includes(id))runIds.push(id);runGroups.set(id,value.groupId);event('start-receipt',{runId:id});}
    json(response,200,envelope);return;
   }
   json(response,404,{error:{code:'NOT_FOUND',message:'验收入口不存在'}});
  }catch(error){const code=(error as {code?:string})?.code??(error instanceof SyntaxError?'ValidationError':'FIXTURE_ERROR');const status=code==='OwnershipError'?404:code==='ConflictError'?409:code==='AuthenticationError'?401:code==='ValidationError'?400:500;json(response,status,{error:{code,message:error instanceof Error?error.message:'验收请求未完成'}});}
  finally{if(isStart){startResponses--;setImmediate(kick);}}
 });
 await new Promise<void>((done,reject)=>{server!.once('error',reject);server!.listen(hostPort,'127.0.0.1',done);});
 ready=true;timer=setInterval(kick,1000);const initial=await state();
 await writeFile(join(root,'ready.json'),JSON.stringify({...owner,pgPid,databaseURL,userId,currentGroupId,currentGroupName,fillerGroupIds,seedAccountIds,hostBaseURL:`http://127.0.0.1:${hostPort}`,readyAt:now()},null,2)+'\n',{mode:0o600,flag:'wx'});
 await writeFile(join(root,'manifest-safe.json'),JSON.stringify({...initial,owner,pgPid,readyAt:now(),safety:{onBoundInstalled:false,collectionAuthorizationInstalled:false,externalPlatformOriginRequestsFulfilledLocally:true}},null,2)+'\n',{mode:0o600,flag:'wx'});
 console.info(JSON.stringify({ready:true,readyFile:join(root,'ready.json'),safeManifest:join(root,'manifest-safe.json'),helperPid:process.pid,pgPid,hostPort,pgPort}));
}catch(error){await writeFile(join(root,'START_FAILED.json'),JSON.stringify({at:now(),errorName:error instanceof Error?error.name:'Error',message:error instanceof Error?error.message:'fixture startup failed'},null,2)+'\n',{mode:0o600});await shutdown('startup-failed');throw error;}
