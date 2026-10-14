// 测试专用：先证明本轮临时实例归属，再连接；不为生产提供数据库路由。
import {Pool as PgPool, type PoolConfig, type PoolClient, type QueryResult} from 'pg';
import {readFileSync, realpathSync, lstatSync, writeFileSync, unlinkSync, existsSync} from 'node:fs';
import {join, resolve, dirname, sep} from 'node:path';
import {tmpdir} from 'node:os';
import {execFileSync} from 'node:child_process';

export type OwnedPostgresMarker={version:1;task:'T-1246';nonce:string;root:string;dataDir:string;registryDir:string;uid:number;pid:number;startedUnix:number;processBirth:string;postgresBinary:string;port:number;adminRole:string;managementDatabase:'postgres'};
const fail=(reason:string):never=>{throw new Error(`T1246_ENV_NOT_OWNED_PG: ${reason}`);};
const identifier=(value:string)=>/^[a-z][a-z0-9_]{0,62}$/.test(value);
const command=(args:string[])=>execFileSync('/bin/ps',args,{encoding:'utf8',env:{PATH:'/usr/bin:/bin',LC_ALL:'C'},timeout:180000}).trim();
function plain(path:string,kind:'file'|'directory',uid:number){
 const stat=lstatSync(path);if(stat.isSymbolicLink()||stat.uid!==uid||(kind==='file'?!stat.isFile():!stat.isDirectory()))fail('非本轮普通路径');
 if(realpathSync(path)!==resolve(path))fail('路径含符号链接');
 return stat;
}
export function readOwnedPostgresMarker():OwnedPostgresMarker{
 try{
  const path=process.env.CREATOROS_OWNED_PG_MARKER,nonce=process.env.CREATOROS_OWNED_PG_NONCE;
  if(!path||!nonce||! /^[a-f0-9]{32}$/.test(nonce))fail('缺少本轮 marker/nonce');
  const uid=process.getuid?.();if(uid===undefined)fail('无法证明执行用户');
  plain(path!,'file',uid!);const m=JSON.parse(readFileSync(path!,'utf8')) as OwnedPostgresMarker;
  const temporaryRoot=realpathSync(tmpdir());
  if(m.version!==1||m.task!=='T-1246'||m.nonce!==nonce||m.uid!==uid||!m.root.startsWith(temporaryRoot+sep+'t1246-owned-pg-')||dirname(path!)!==m.root||m.dataDir!==join(m.root,'data')||m.registryDir!==join(m.root,'databases'))fail('marker 不属于本轮临时根');
  const root=plain(m.root,'directory',uid!);if((root.mode&0o077)!==0)fail('临时根权限过宽');plain(m.dataDir,'directory',uid!);plain(m.registryDir,'directory',uid!);
  if(!Number.isInteger(m.port)||m.port<1024||m.port>65535||[5432,55422].includes(m.port)||!identifier(m.adminRole)||m.adminRole!==`t1246_${nonce!.slice(0,12)}`||m.managementDatabase!=='postgres'||!Number.isInteger(m.pid)||m.pid<=1)fail('管理身份或端口无效');
  const pidPath=join(m.dataDir,'postmaster.pid');plain(pidPath,'file',uid!);const lines=readFileSync(pidPath,'utf8').split('\n');
  if(Number(lines[0])!==m.pid||lines[1]!==m.dataDir||Number(lines[2])!==m.startedUnix||Number(lines[3])!==m.port||lines[5]!=='127.0.0.1')fail('postmaster.pid 与本轮身份不符');
  if(command(['-p',String(m.pid),'-o','lstart='])!==m.processBirth||Number(command(['-p',String(m.pid),'-o','uid=']))!==uid)fail('PID 出生时间/用户不符');
  const executable=command(['-p',String(m.pid),'-o','comm=']);if(realpathSync(executable)!==realpathSync(m.postgresBinary))fail('PID 并非本轮 PostgreSQL 二进制');
  const argv=command(['-p',String(m.pid),'-o','command=']);if(!argv.includes('postgres')||!argv.includes(m.dataDir))fail('进程未持有本轮 dataDir');
  return m;
 }catch(error){if(error instanceof Error&&error.message.startsWith('T1246_ENV_NOT_OWNED_PG'))throw error;return fail('归属文件/进程无法验证');}
}
function recordPath(m:OwnedPostgresMarker,name:string){if(!identifier(name)||name==='postgres'||name==='template0'||name==='template1')fail('测试数据库名无效');return join(m.registryDir,name+'.json');}
export function isOwnedPostgresDatabase(name:string):boolean{
 const m=readOwnedPostgresMarker();const path=recordPath(m,name);if(!existsSync(path))return false;plain(path,'file',m.uid);
 const record=JSON.parse(readFileSync(path,'utf8'));return record.nonce===m.nonce&&record.name===name&&record.state==='created';
}
export function assertOwnedPostgresUrl(value:string|undefined):URL{
 return validateOwnedPostgresUrl(value,readOwnedPostgresMarker());
}
export function validateOwnedPostgresUrl(value:string|undefined,m:OwnedPostgresMarker):URL{
 if(!value)fail('缺少显式测试 URL');let u:URL;try{u=new URL(value!);}catch{return fail('测试 URL 无效');}
 if(!['postgres:','postgresql:'].includes(u.protocol)||u.hostname!=='127.0.0.1'||Number(u.port)!==m.port||decodeURIComponent(u.username)!==m.adminRole||u.password||u.search||u.hash)fail('URL 未指向本轮明确管理身份');
 const database=decodeURIComponent(u.pathname.slice(1));if(database!==m.managementDatabase&&!isOwnedPostgresDatabase(database))fail('数据库未在本轮 CREATE 后登记');
 return u;
}
export function ownedPostgresCliEnv(value:string,inherited:NodeJS.ProcessEnv=process.env):NodeJS.ProcessEnv{
 const u=assertOwnedPostgresUrl(value),env={...inherited};for(const key of Object.keys(env))if(key.startsWith('PG')||key==='NODE_PG_FORCE_NATIVE')delete env[key];
 return {...env,PGHOST:u.hostname,PGPORT:u.port,PGUSER:decodeURIComponent(u.username),PGDATABASE:decodeURIComponent(u.pathname.slice(1)),PGSSLMODE:'disable',PGCONNECT_TIMEOUT:'180'};
}
export function requiredOwnedPostgresUrl():string{return assertOwnedPostgresUrl(process.env.CREATOROS_TEST_POSTGRES_URL??process.env.CREATOROS_ISOLATED_PG_URL).toString();}

// 保原 pg Pool API；仅管理连接的 CREATE/DROP 登记及归属验证由此测试夹具承担。
export class OwnedPostgresPool extends PgPool{
 private readonly ownedUrl:URL;
 private identity:Promise<void>|undefined;
 constructor(config:PoolConfig){
  const u=assertOwnedPostgresUrl(config.connectionString);super({...config,connectionTimeoutMillis:Math.max(config.connectionTimeoutMillis??0,180000)});this.ownedUrl=u;
  const baseQuery=super.query.bind(this),baseConnect=super.connect.bind(this);
  const verify=()=>this.identity??= (async()=>{
   assertOwnedPostgresUrl(this.ownedUrl.toString());const client=await baseConnect();
   try{const m=readOwnedPostgresMarker();const result=await client.query(`SELECT current_user AS role,current_database() AS database,inet_server_port() AS port,current_setting('data_directory') AS data_dir`);const row=result.rows[0];
    if(row?.role!==m.adminRole||row.database!==decodeURIComponent(this.ownedUrl.pathname.slice(1))||Number(row.port)!==m.port||row.data_dir!==m.dataDir)fail('真实服务器身份不符');
   }finally{client.release();}
  })();
  const execute=async(args:unknown[])=>{
   assertOwnedPostgresUrl(this.ownedUrl.toString());
   const input=args[0] as string|{text?:string},text=typeof input==='string'?input:input?.text??'';
   const management=/^\s*(CREATE|DROP)\s+DATABASE\b/i.test(text);
   const match=/^\s*(CREATE|DROP)\s+DATABASE\s+(?:IF EXISTS\s+)?(?:"([a-z][a-z0-9_]*)"|([a-z][a-z0-9_]*))\s*(?:WITH\s*\(FORCE\))?\s*;?\s*$/i.exec(text);
   let m:OwnedPostgresMarker|undefined,name:string|undefined;
   if(management){if(!match||this.ownedUrl.pathname!=='/postgres')fail('禁止未限定的数据库管理 SQL');m=readOwnedPostgresMarker();name=match![2]??match![3]!;recordPath(m,name);
    if(match![1]!.toUpperCase()==='DROP'&&!isOwnedPostgresDatabase(name))fail('禁止 DROP 未登记库');
    if(match![1]!.toUpperCase()==='CREATE'&&existsSync(recordPath(m,name)))fail('数据库名已登记，禁止复用');
   }
   await verify();const result=await (baseQuery as (...a:unknown[])=>Promise<QueryResult>)(...args);
   if(m&&name){if(match![1]!.toUpperCase()==='CREATE')writeFileSync(recordPath(m,name),JSON.stringify({nonce:m.nonce,name,state:'created'}),{flag:'wx',mode:0o600});else unlinkSync(recordPath(m,name));}
   return result;
  };
  this.query=((...args:unknown[])=>{const callback=typeof args.at(-1)==='function'?args.pop() as (error:unknown,result?:QueryResult)=>void:undefined;const promise=execute(args);if(callback){void promise.then(r=>callback(null,r),e=>callback(e));return;}return promise;}) as PgPool['query'];
  this.connect=((callback?: (error:Error|null,client?:PoolClient,release?:()=>void)=>void)=>{
   const promise=verify().then(()=>{assertOwnedPostgresUrl(this.ownedUrl.toString());return baseConnect();});
   if(callback){void promise.then(client=>callback(null,client,()=>client.release()),error=>callback(error));return;}return promise;
  }) as PgPool['connect'];
 }
}
