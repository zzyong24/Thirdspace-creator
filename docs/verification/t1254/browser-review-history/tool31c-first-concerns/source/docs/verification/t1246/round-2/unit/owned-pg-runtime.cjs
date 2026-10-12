'use strict';
// 本轮测试工具；导入不启动 PG。真实执行须由 run-unit 的独评回执准入。
const fs=require('node:fs'),path=require('node:path'),os=require('node:os'),crypto=require('node:crypto'),cp=require('node:child_process'),net=require('node:net');
const failure=reason=>{throw Error('T1246_ENV_NOT_OWNED_PG: '+reason);};
const sha=data=>crypto.createHash('sha256').update(data).digest('hex');
const ps=(pid,field)=>cp.execFileSync('/bin/ps',['-p',String(pid),'-o',field+'='],{encoding:'utf8',timeout:180000,env:{PATH:'/usr/bin:/bin',LC_ALL:'C'}}).trim();
function cleanEnv(input=process.env){const env={...input};for(const key of Object.keys(env))if(key.startsWith('PG')||['NODE_PG_FORCE_NATIVE','DATABASE_URL','TEST_DATABASE_URL','CREATOROS_TEST_POSTGRES_URL','CREATOROS_ISOLATED_PG_URL','CREATOROS_OWNED_PG_MARKER','CREATOROS_OWNED_PG_NONCE','NODE_OPTIONS'].includes(key))delete env[key];return env;}
function plain(file,kind,uid){const stat=fs.lstatSync(file);if(stat.isSymbolicLink()||stat.uid!==uid||!stat[kind==='directory'?'isDirectory':'isFile']()||fs.realpathSync(file)!==path.resolve(file))failure('路径/用户不符');return stat;}
function verify(markerPath,nonce){
 try{const uid=process.getuid();plain(markerPath,'file',uid);const m=JSON.parse(fs.readFileSync(markerPath,'utf8')),tmp=fs.realpathSync(os.tmpdir());
 if(m.version!==1||m.task!=='T-1246'||m.nonce!==nonce||! /^[a-f0-9]{32}$/.test(nonce)||m.uid!==uid||!m.root.startsWith(tmp+path.sep+'t1246-owned-pg-')||path.dirname(markerPath)!==m.root||m.dataDir!==path.join(m.root,'data')||m.registryDir!==path.join(m.root,'databases'))failure('不属于本轮临时根');
 if(plain(m.root,'directory',uid).mode&0o077)failure('临时根权限过宽');plain(m.dataDir,'directory',uid);plain(m.registryDir,'directory',uid);
 if(!Number.isInteger(m.port)||m.port<1024||m.port>65535||[5432,55422].includes(m.port)||m.adminRole!==`t1246_${nonce.slice(0,12)}`||m.managementDatabase!=='postgres'||!Number.isInteger(m.pid)||m.pid<=1)failure('端口/身份无效');
 const pidPath=path.join(m.dataDir,'postmaster.pid');plain(pidPath,'file',uid);const lines=fs.readFileSync(pidPath,'utf8').split('\n');
 if(Number(lines[0])!==m.pid||lines[1]!==m.dataDir||Number(lines[2])!==m.startedUnix||Number(lines[3])!==m.port||lines[5]!=='127.0.0.1')failure('postmaster.pid 不符');
 if(ps(m.pid,'lstart')!==m.processBirth||Number(ps(m.pid,'uid'))!==uid||fs.realpathSync(ps(m.pid,'comm'))!==fs.realpathSync(m.postgresBinary)||!ps(m.pid,'command').includes(m.dataDir))failure('真实 PostgreSQL PID/出生/目录不符');return m;
 }catch(e){if(e.message.startsWith('T1246_ENV_NOT_OWNED_PG'))throw e;failure('归属证据不可读');}
}
const GROUP_TERM_GRACE_MS=180000,GROUP_KILL_GRACE_MS=180000;
function processGroupMembers(group){
 const output=cp.execFileSync('/bin/ps',['-axo','pid=,pgid=,uid=,lstart=,command='],{encoding:'utf8',timeout:180000,env:{PATH:'/usr/bin:/bin',LC_ALL:'C'}});
 return output.split('\n').flatMap(line=>{const match=/^\s*(\d+)\s+(\d+)\s+(\d+)\s+(\w+\s+\w+\s+\d+\s+\d+:\d+:\d+\s+\d+)\s+(.*)$/.exec(line);return match&&Number(match[2])===group?[{pid:Number(match[1]),pgid:Number(match[2]),uid:Number(match[3]),birth:match[4],command:match[5]}]:[];});
}
function signalOwnedProcessGroup(identity,signal){
 if(!identity||identity.pgid!==identity.pid||identity.pid===process.pid)failure('子进程组未绑定，禁止信号');
 const members=processGroupMembers(identity.pgid);if(!members.length)return {signal,at:new Date().toISOString(),alreadyExited:true,members:[]};
 if(members.some(member=>member.uid!==identity.uid||!Number.isFinite(Date.parse(member.birth))||Date.parse(member.birth)<identity.startedAt-2000)||members.some(member=>member.pid===identity.pid&&member.birth!==identity.birth))failure('进程组归属/出生不符，禁止信号');
 process.kill(-identity.pgid,signal);return {signal,at:new Date().toISOString(),alreadyExited:false,members};
}
async function boundedProcess(file,args,options={}){
 const {budgetMs=300000,log,env=cleanEnv(),cwd,signal,persistentOwnedServer=false}=options;if(budgetMs<120000)throw Error('正执行预算不得短于120秒');
 const started=Date.now(),fd=log?fs.openSync(log,'wx'):null;let stdout='',stderr='',identity,closed=false,closeReceipt,resolveClosed;
 const closedPromise=new Promise(resolve=>resolveClosed=resolve),child=cp.spawn(file,args,{cwd,env,detached:true,stdio:['ignore',fd??'pipe',fd??'pipe']});
 child.stdout?.on('data',data=>stdout+=data);child.stderr?.on('data',data=>stderr+=data);
 child.once('error',error=>{closed=true;closeReceipt={code:null,signal:null,spawnError:error.message};resolveClosed(closeReceipt);});
 child.once('close',(code,signal)=>{closed=true;closeReceipt={code,signal};resolveClosed(closeReceipt);});
 try{identity={pid:child.pid,pgid:Number(ps(child.pid,'pgid')),uid:Number(ps(child.pid,'uid')),birth:ps(child.pid,'lstart'),startedAt:started};}catch(error){if(!closed)identity={pid:child.pid,startedAt:started,bindingError:error.message};}
 let deadlineTimer,abortListener;const deadline=new Promise(resolve=>{deadlineTimer=setTimeout(()=>resolve(null),budgetMs);abortListener=()=>resolve(null);if(signal?.aborted)resolve(null);else signal?.addEventListener('abort',abortListener,{once:true});});
 let result=await Promise.race([closedPromise,deadline]);clearTimeout(deadlineTimer);signal?.removeEventListener('abort',abortListener);const signals=[];let exhausted=result===null;
 async function finiteWait(ms){let timer;const value=await Promise.race([closedPromise,new Promise(resolve=>timer=setTimeout(()=>resolve(null),ms))]);clearTimeout(timer);return value;}
 async function waitGroupExit(ms){const until=Date.now()+ms;for(;;){if(!processGroupMembers(identity.pgid).length)return true;if(Date.now()>=until)return false;await new Promise(resolve=>setTimeout(resolve,100));}}
 if(exhausted){
  try{signals.push(signalOwnedProcessGroup(identity,'SIGTERM'));let ended=await Promise.all([finiteWait(GROUP_TERM_GRACE_MS),waitGroupExit(GROUP_TERM_GRACE_MS)]);result=ended[0];
   if(!result||!ended[1]){signals.push(signalOwnedProcessGroup(identity,'SIGKILL'));ended=await Promise.all([finiteWait(GROUP_KILL_GRACE_MS),waitGroupExit(GROUP_KILL_GRACE_MS)]);result=ended[0];}
  }catch(error){signals.push({ownershipRefusal:error.message,at:new Date().toISOString()});}
 }
 if(!exhausted&&!persistentOwnedServer&&identity?.pgid===identity?.pid&&processGroupMembers(identity.pgid).length){
  try{signals.push(signalOwnedProcessGroup(identity,'SIGTERM'));if(!await waitGroupExit(GROUP_TERM_GRACE_MS)){signals.push(signalOwnedProcessGroup(identity,'SIGKILL'));await waitGroupExit(GROUP_KILL_GRACE_MS);}}
  catch(error){signals.push({ownershipRefusal:error.message,at:new Date().toISOString()});}
 }
 const remaining=child.pid?processGroupMembers(child.pid):[];if(!closed){child.unref();child.stdout?.destroy();child.stderr?.destroy();}if(fd!==null)fs.closeSync(fd);
 return {file,args,cwd,log,pid:child.pid,identity,startedAt:new Date(started).toISOString(),endedAt:new Date().toISOString(),elapsedMs:Date.now()-started,budgetMs,deadlineAt:new Date(started+budgetMs).toISOString(),budgetExhausted:exhausted,termGraceMs:GROUP_TERM_GRACE_MS,killGraceMs:GROUP_KILL_GRACE_MS,signals,processClosed:closed,remainingOwnedGroupMembers:remaining,persistentOwnedServer,outerAbort:signal?.aborted===true,code:result?.code??null,signal:result?.signal??null,spawnError:result?.spawnError??null,stdout,stderr};
}
async function run(file,args,options={}){
 const receipt=await boundedProcess(file,args,options);
 if(receipt.code!==0||receipt.budgetExhausted||!receipt.processClosed||(!receipt.persistentOwnedServer&&receipt.remainingOwnedGroupMembers.length))throw Object.assign(Error('测试工具未完整退出: '+file),{receipt});return receipt;
}
const allocate=()=>new Promise((resolve,reject)=>{const server=net.createServer();server.once('error',reject);server.listen(0,'127.0.0.1',()=>{const port=server.address().port;server.close(error=>error?reject(error):resolve(port));});});
async function start({workspace,evidenceRoot,signal}){
 const nonce=crypto.randomBytes(16).toString('hex'),root=fs.mkdtempSync(path.join(fs.realpathSync(os.tmpdir()),'t1246-owned-pg-'));fs.chmodSync(root,0o700);
 const dataDir=path.join(root,'data'),registryDir=path.join(root,'databases');fs.mkdirSync(registryDir,{mode:0o700});const markerPath=path.join(root,'owner.json'),port=await allocate(),adminRole=`t1246_${nonce.slice(0,12)}`,database=`creatoros_test_${nonce.slice(0,12)}`;
 const binaries={initdb:fs.realpathSync('/opt/homebrew/bin/initdb'),pg_ctl:fs.realpathSync('/opt/homebrew/bin/pg_ctl'),postgres:fs.realpathSync('/opt/homebrew/bin/postgres')};
 const out=path.join(evidenceRoot,nonce);fs.mkdirSync(out,{recursive:true});const preparation={task:'T-1246',nonce,root,dataDir,registryDir,port,adminRole,database,binaries,uid:process.getuid(),workspace,startedAt:new Date().toISOString(),nativeFlagAbsent:true};fs.writeFileSync(path.join(out,'preparation.json'),JSON.stringify(preparation,null,2));
 let m;const startUnix=Math.floor(Date.now()/1000);
 try{
  const init=await run(binaries.initdb,['-D',dataDir,'--username',adminRole,'--auth-local=trust','--auth-host=trust','--encoding=UTF8','--no-locale'],{signal});fs.writeFileSync(path.join(out,'initdb.json'),JSON.stringify(init,null,2));
  const startup=await run(binaries.pg_ctl,['-D',dataDir,'-l',path.join(root,'postgres.log'),'-w','-t','180','-o',`-h 127.0.0.1 -p ${port} -k ${root}`,'start'],{budgetMs:360000,signal,persistentOwnedServer:true});fs.writeFileSync(path.join(out,'startup.json'),JSON.stringify(startup,null,2));
  const lines=fs.readFileSync(path.join(dataDir,'postmaster.pid'),'utf8').split('\n');m={version:1,task:'T-1246',nonce,root,dataDir,registryDir,uid:process.getuid(),pid:Number(lines[0]),startedUnix:Number(lines[2]),processBirth:ps(Number(lines[0]),'lstart'),postgresBinary:binaries.postgres,port,adminRole,managementDatabase:'postgres'};
  fs.writeFileSync(markerPath,JSON.stringify(m,null,2),{mode:0o600,flag:'wx'});verify(markerPath,nonce);
  const {createRequire}=require('node:module'),{Pool}=createRequire(path.join(workspace,'backend/package.json'))('pg');const adminUrl=`postgresql://${adminRole}@127.0.0.1:${port}/postgres`,pool=new Pool({connectionString:adminUrl,connectionTimeoutMillis:180000,query_timeout:180000});
  try{signal?.throwIfAborted();const result=await pool.query("SELECT current_user AS role,current_database() AS database,inet_server_port() AS port,current_setting('data_directory') AS data_dir");const row=result.rows[0];if(row.role!==adminRole||row.database!=='postgres'||Number(row.port)!==port||row.data_dir!==dataDir)failure('真实管理服务器身份不符');fs.writeFileSync(path.join(out,'server-identity.json'),JSON.stringify(row,null,2));
   signal?.throwIfAborted();await pool.query(`CREATE DATABASE ${database}`);signal?.throwIfAborted();fs.writeFileSync(path.join(registryDir,database+'.json'),JSON.stringify({nonce,name:database,state:'created'}),{flag:'wx',mode:0o600});
  }finally{await pool.end();}
  const url=`postgresql://${adminRole}@127.0.0.1:${port}/${database}`;
  const env={...cleanEnv(),CREATOROS_OWNED_PG_MARKER:markerPath,CREATOROS_OWNED_PG_NONCE:nonce,CREATOROS_TEST_POSTGRES_URL:adminUrl,CREATOROS_ISOLATED_PG_URL:adminUrl,TEST_DATABASE_URL:url,DATABASE_URL:url,PGHOST:'127.0.0.1',PGPORT:String(port),PGUSER:adminRole,PGDATABASE:database,PGSSLMODE:'disable',PGCONNECT_TIMEOUT:'180'};
  fs.writeFileSync(path.join(out,'owned-environment.json'),JSON.stringify({nonce,markerPath,marker:m,urls:{adminUrl,testUrl:url},nativeFlagAbsent:!Object.hasOwn(env,'NODE_PG_FORCE_NATIVE'),pgServiceAbsent:!Object.hasOwn(env,'PGSERVICE')&&!Object.hasOwn(env,'PGSERVICEFILE'),firstPortNotReused:port!==50028},null,2));
  return {nonce,root,out,markerPath,env,binaries,marker:m};
 }catch(error){
  let cleanup=null,cleanupRefusal=null;
  try{
   if(!m&&fs.existsSync(path.join(dataDir,'postmaster.pid'))){
    // 不借旧marker：仅本次新建根内真实postmaster；出生必须在本次启动窗口内。
    plain(root,'directory',process.getuid());plain(dataDir,'directory',process.getuid());const lines=fs.readFileSync(path.join(dataDir,'postmaster.pid'),'utf8').split('\n'),pid=Number(lines[0]);
    if(lines[1]!==dataDir||Number(lines[2])<startUnix-2||Number(lines[3])!==port||Number(ps(pid,'uid'))!==process.getuid()||fs.realpathSync(ps(pid,'comm'))!==binaries.postgres||!ps(pid,'command').includes(dataDir))failure('部分启动进程无法证明属于本次');
    m={version:1,task:'T-1246',nonce,root,dataDir,registryDir,uid:process.getuid(),pid,startedUnix:Number(lines[2]),processBirth:ps(pid,'lstart'),postgresBinary:binaries.postgres,port,adminRole,managementDatabase:'postgres'};
    if(fs.existsSync(markerPath)){if(JSON.parse(fs.readFileSync(markerPath,'utf8')).nonce!==nonce)failure('marker身份冲突');}else fs.writeFileSync(markerPath,JSON.stringify(m,null,2),{mode:0o600,flag:'wx'});
   }
   if(m){await stop({nonce,root,out,markerPath,binaries,marker:m});cleanup={ownedPostmasterStopped:true,rootRemoved:!fs.existsSync(root)};}
   else cleanup={postmasterPidAbsent:!fs.existsSync(path.join(dataDir,'postmaster.pid')),ownedInstanceNotStarted:true,rootRetained:true};
  }catch(cleanupError){cleanupRefusal=cleanupError.message;}
  fs.writeFileSync(path.join(out,'startup-failure.json'),JSON.stringify({message:error.message,receipt:error.receipt??null,markerAvailable:!!m,cleanup,cleanupRefusal,rootRetained:fs.existsSync(root),instanceStopped:cleanup?.ownedPostmasterStopped===true,instanceUnverified:cleanupRefusal!==null},null,2));throw error;
 }
}
async function stop(state){
 // 无前缀扫删；持有精确 marker 并核实际进程后，只停本轮 pg_ctl。
 const m=verify(state.markerPath,state.nonce);const receipt=await run(state.binaries.pg_ctl,['-D',m.dataDir,'-w','-t','180','-m','fast','stop'],{budgetMs:360000});
 if(fs.existsSync(path.join(m.dataDir,'postmaster.pid')))failure('本轮 postmaster 尚未退出，不删除临时根');
 // 进程退出后继续核根/marker 原字节及 nonce，不能用失效 PID 校验代替路径归属。
 if(JSON.parse(fs.readFileSync(state.markerPath,'utf8')).nonce!==state.nonce||fs.realpathSync(state.root)!==state.root||state.root!==m.root)failure('清理根身份改变');
 fs.writeFileSync(path.join(state.out,'stop-cleanup.json'),JSON.stringify({...receipt,nonce:state.nonce,pid:m.pid,exactRoot:state.root,postmasterPidAbsent:true,cleanupOwnedRoot:true},null,2));fs.rmSync(state.root,{recursive:true});
}
function installSocketGuard(){
 const original=net.Socket.prototype.connect;
 net.Socket.prototype.connect=function t1246OwnedPgConnect(...args){
  const value=args[0],options=typeof value==='object'?(Array.isArray(value)?value[0]:value):{port:value,host:typeof args[1]==='string'?args[1]:'localhost'};
  const host=options?.host??'localhost',port=Number(options?.port),local=['localhost','127.0.0.1','::1','[::1]'].includes(host);
  if(local&&[5432,55422].includes(port))failure('禁止默认或另任务端口 '+port);
  const marker=process.env.CREATOROS_OWNED_PG_MARKER,nonce=process.env.CREATOROS_OWNED_PG_NONCE;
  if(local&&marker&&nonce){const m=JSON.parse(fs.readFileSync(marker,'utf8'));if(port===m.port){if(host!=='127.0.0.1')failure('必须明确环回 IP');verify(marker,nonce);}}
  return original.apply(this,args);
 };
}
module.exports={cleanEnv,verify,start,stop,run,boundedProcess,signalOwnedProcessGroup,processGroupMembers,installSocketGuard,sha,GROUP_TERM_GRACE_MS,GROUP_KILL_GRACE_MS};
if(process.env.T1246_OWNED_PG_PRELOAD==='1')installSocketGuard();
