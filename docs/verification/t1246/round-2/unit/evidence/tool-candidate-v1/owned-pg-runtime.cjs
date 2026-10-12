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
async function run(file,args,options={}){
 const started=Date.now();return await new Promise((resolve,reject)=>{
  const child=cp.spawn(file,args,{env:cleanEnv(),stdio:['ignore','pipe','pipe'],...options});let stdout='',stderr='',exhausted=false;child.stdout?.on('data',d=>stdout+=d);child.stderr?.on('data',d=>stderr+=d);
  const timer=setTimeout(()=>{exhausted=true;child.kill('SIGTERM');},options.budgetMs??300000);
  child.once('error',e=>{clearTimeout(timer);reject(e);});child.once('close',(code,signal)=>{clearTimeout(timer);const receipt={file,args,code,signal,budgetExhausted:exhausted,elapsedMs:Date.now()-started,stdout,stderr};if(code===0&&!exhausted)resolve(receipt);else reject(Object.assign(Error('测试工具失败: '+file),{receipt}));});
 });
}
const allocate=()=>new Promise((resolve,reject)=>{const server=net.createServer();server.once('error',reject);server.listen(0,'127.0.0.1',()=>{const port=server.address().port;server.close(error=>error?reject(error):resolve(port));});});
async function start({workspace,evidenceRoot}){
 const nonce=crypto.randomBytes(16).toString('hex'),root=fs.mkdtempSync(path.join(fs.realpathSync(os.tmpdir()),'t1246-owned-pg-'));fs.chmodSync(root,0o700);
 const dataDir=path.join(root,'data'),registryDir=path.join(root,'databases');fs.mkdirSync(registryDir,{mode:0o700});const markerPath=path.join(root,'owner.json'),port=await allocate(),adminRole=`t1246_${nonce.slice(0,12)}`,database=`creatoros_test_${nonce.slice(0,12)}`;
 const binaries={initdb:fs.realpathSync('/opt/homebrew/bin/initdb'),pg_ctl:fs.realpathSync('/opt/homebrew/bin/pg_ctl'),postgres:fs.realpathSync('/opt/homebrew/bin/postgres')};
 const out=path.join(evidenceRoot,nonce);fs.mkdirSync(out,{recursive:true});const preparation={task:'T-1246',nonce,root,dataDir,registryDir,port,adminRole,database,binaries,uid:process.getuid(),workspace,startedAt:new Date().toISOString(),nativeFlagAbsent:true};fs.writeFileSync(path.join(out,'preparation.json'),JSON.stringify(preparation,null,2));
 let m;
 try{
  const init=await run(binaries.initdb,['-D',dataDir,'--username',adminRole,'--auth-local=trust','--auth-host=trust','--encoding=UTF8','--no-locale']);fs.writeFileSync(path.join(out,'initdb.json'),JSON.stringify(init,null,2));
  const startup=await run(binaries.pg_ctl,['-D',dataDir,'-l',path.join(root,'postgres.log'),'-w','-t','180','-o',`-h 127.0.0.1 -p ${port} -k ${root}`,'start'],{budgetMs:360000});fs.writeFileSync(path.join(out,'startup.json'),JSON.stringify(startup,null,2));
  const lines=fs.readFileSync(path.join(dataDir,'postmaster.pid'),'utf8').split('\n');m={version:1,task:'T-1246',nonce,root,dataDir,registryDir,uid:process.getuid(),pid:Number(lines[0]),startedUnix:Number(lines[2]),processBirth:ps(Number(lines[0]),'lstart'),postgresBinary:binaries.postgres,port,adminRole,managementDatabase:'postgres'};
  fs.writeFileSync(markerPath,JSON.stringify(m,null,2),{mode:0o600,flag:'wx'});verify(markerPath,nonce);
  const {createRequire}=require('node:module'),{Pool}=createRequire(path.join(workspace,'backend/package.json'))('pg');const adminUrl=`postgresql://${adminRole}@127.0.0.1:${port}/postgres`,pool=new Pool({connectionString:adminUrl,connectionTimeoutMillis:180000});
  try{const result=await pool.query("SELECT current_user AS role,current_database() AS database,inet_server_port() AS port,current_setting('data_directory') AS data_dir");const row=result.rows[0];if(row.role!==adminRole||row.database!=='postgres'||Number(row.port)!==port||row.data_dir!==dataDir)failure('真实管理服务器身份不符');fs.writeFileSync(path.join(out,'server-identity.json'),JSON.stringify(row,null,2));
   await pool.query(`CREATE DATABASE ${database}`);fs.writeFileSync(path.join(registryDir,database+'.json'),JSON.stringify({nonce,name:database,state:'created'}),{flag:'wx',mode:0o600});
  }finally{await pool.end();}
  const url=`postgresql://${adminRole}@127.0.0.1:${port}/${database}`;
  const env={...cleanEnv(),CREATOROS_OWNED_PG_MARKER:markerPath,CREATOROS_OWNED_PG_NONCE:nonce,CREATOROS_TEST_POSTGRES_URL:adminUrl,CREATOROS_ISOLATED_PG_URL:adminUrl,TEST_DATABASE_URL:url,DATABASE_URL:url,PGHOST:'127.0.0.1',PGPORT:String(port),PGUSER:adminRole,PGDATABASE:database,PGSSLMODE:'disable',PGCONNECT_TIMEOUT:'180'};
  fs.writeFileSync(path.join(out,'owned-environment.json'),JSON.stringify({nonce,markerPath,marker:m,urls:{adminUrl,testUrl:url},nativeFlagAbsent:!Object.hasOwn(env,'NODE_PG_FORCE_NATIVE'),pgServiceAbsent:!Object.hasOwn(env,'PGSERVICE')&&!Object.hasOwn(env,'PGSERVICEFILE'),firstPortNotReused:port!==50028},null,2));
  return {nonce,root,out,markerPath,env,binaries,marker:m};
 }catch(error){fs.writeFileSync(path.join(out,'startup-failure.json'),JSON.stringify({message:error.message,receipt:error.receipt??null,markerAvailable:!!m,rootRetained:true},null,2));if(m)await stop({nonce,root,out,markerPath,binaries,marker:m});throw error;}
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
module.exports={cleanEnv,verify,start,stop,run,installSocketGuard,sha};
if(process.env.T1246_OWNED_PG_PRELOAD==='1')installSocketGuard();
