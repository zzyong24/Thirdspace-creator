// 仅供锁定的HyperFrames公共CLI测试使用；原生能力未证实前不允许执行CLI。
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import net from 'node:net';
import {spawn,execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';

const repo=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../..');
const sandbox='/usr/bin/sandbox-exec';
const expectedCliSha='1250669d951c4a462b7e4b5d574256f61978797ba3b941cc8491d620e3ef925b';
// 新测试工具也服从现有静态守卫；正常close立即结束，不会等待用尽清理上限。
const cleanupGraceMs=120000,settlementMarginMs=120000;
const fail=message=>{throw Error(`HYPERFRAMES_ISOLATION_UNPROVEN: ${message}`);};
const q=value=>JSON.stringify(value);
const sha=value=>createHash('sha256').update(value).digest('hex');
function plainOwned(directory){
 const stat=fs.lstatSync(directory);
 if(!stat.isDirectory()||stat.isSymbolicLink()||stat.uid!==process.getuid()||fs.realpathSync(directory)!==directory||(stat.mode&0o077))fail('临时根身份/权限不符');
}
function nativeLibraries(node){
 const files=new Set(),pending=[{file:node,inherited:[]}];
 while(pending.length){
  const {file,inherited}=pending.pop();if(files.has(file))continue;files.add(file);
  const commandOptions={encoding:'utf8',env:{PATH:'/usr/bin:/bin',LC_ALL:'C'},timeout:120000};
  const expand=value=>value.replace(/^@loader_path(?=\/|$)/,path.dirname(file)).replace(/^@executable_path(?=\/|$)/,path.dirname(node));
  const commands=execFileSync('/usr/bin/otool',['-l',file],commandOptions);
  const ownRpaths=[...commands.matchAll(/cmd LC_RPATH\s+cmdsize \d+\s+path (.+?) \(offset \d+\)/g)].map(match=>path.resolve(expand(match[1])));
  const rpaths=[...new Set([...ownRpaths,...inherited])];
  const result=execFileSync('/usr/bin/otool',['-L',file],{encoding:'utf8',env:{PATH:'/usr/bin:/bin',LC_ALL:'C'},timeout:120000});
  for(const line of result.split('\n').slice(1)){
   let name=line.trim().split(' (')[0];
   if(!name)continue;
   if(name.startsWith('/usr/lib/')||name.startsWith('/System/Library/'))continue;
   if(name.startsWith('@rpath/'))name=rpaths.map(directory=>path.join(directory,name.slice(7))).find(candidate=>fs.existsSync(candidate))??name;
   else name=expand(name);
   if(!path.isAbsolute(name)||!fs.existsSync(name))fail(`无法解析Node原生依赖：${name}`);
   name=fs.realpathSync(name);if(!files.has(name))pending.push({file:name,inherited:rpaths});
  }
 }
 return [...files];
}
function processGroup(pid){
 const text=execFileSync('/bin/ps',['-axo','pid=,pgid=,uid=,lstart='],{encoding:'utf8',env:{PATH:'/usr/bin:/bin',LC_ALL:'C'},timeout:120000});
 return text.split('\n').flatMap(line=>{
  const match=/^\s*(\d+)\s+(\d+)\s+(\d+)\s+(.+?)\s*$/.exec(line);
  return match&&Number(match[2])===pid?[{pid:Number(match[1]),pgid:Number(match[2]),uid:Number(match[3]),birth:match[4]}]:[];
 });
}
async function execute(profile,node,args,{cwd,env,timeoutMs=120000,signal}){
 if(!Number.isSafeInteger(timeoutMs)||timeoutMs<120000)fail('执行预算须至少120秒');
 if(signal?.aborted)throw Error('HYPERFRAMES_ISOLATION_INCOMPLETE: 已取消');
 const started=Date.now();
 return await new Promise((resolve,reject)=>{
  const child=spawn(sandbox,['-f',profile,node,...args],{cwd,env,detached:true,stdio:['ignore','pipe','pipe']});
  const birth=processGroup(child.pid).find(row=>row.pid===child.pid)?.birth;
  let stdout='',stderr='',reason=null,killTimer,settlementTimer,finished=false;
  const kill=signal=>{
   const members=processGroup(child.pid);
   if(members.length&&(!birth||members.some(row=>row.uid!==process.getuid()||!Number.isFinite(Date.parse(row.birth))||Date.parse(row.birth)<started-2000||(row.pid===child.pid&&row.birth!==birth))))fail('子进程组归属/出生时间不符，拒绝清理');
   if(members.length)try{process.kill(-child.pid,signal);}catch(error){if(error.code!=='ESRCH')throw error;}
  };
  const finish=(error,result)=>{
   if(finished)return;finished=true;clearTimeout(timer);clearTimeout(killTimer);clearTimeout(settlementTimer);signal?.removeEventListener('abort',abort);
   if(error)reject(error);else resolve(result);
  };
  const stop=cause=>{
   if(reason||finished)return;reason=cause;
   try{kill('SIGTERM');}catch(error){child.unref();child.stdout.destroy();child.stderr.destroy();finish(error);return;}
   killTimer=setTimeout(()=>{
    try{kill('SIGKILL');}catch(error){finish(error);return;}
    settlementTimer=setTimeout(()=>{child.stdout.destroy();child.stderr.destroy();child.unref();finish(Error('HYPERFRAMES_ISOLATION_INCOMPLETE: 清理未在预算内结束'));},settlementMarginMs);
   },cleanupGraceMs);
  };
  const abort=()=>stop('已取消');
  const timer=setTimeout(()=>stop('执行超时'),timeoutMs);
  signal?.addEventListener('abort',abort,{once:true});if(signal?.aborted)abort();
  child.stdout.on('data',data=>stdout+=data);child.stderr.on('data',data=>stderr+=data);
  child.once('error',error=>finish(error));
  child.once('close',(status,signal)=>{
   try{
    const remaining=processGroup(child.pid);
    if(remaining.length){kill('SIGKILL');return finish(Error('HYPERFRAMES_ISOLATION_INCOMPLETE: 子进程组未收尾'));}
    if(reason||signal){const error=Error(`HYPERFRAMES_ISOLATION_INCOMPLETE: ${reason??signal}`);error.receipt={status,signal,reason,pid:child.pid,remainingOwnedProcesses:0};return finish(error);}
    finish(null,{status,signal,stdout,stderr,durationMs:Date.now()-started,pid:child.pid,remainingOwnedProcesses:0});
   }catch(error){finish(error);}
  });
 });
}

export async function createHyperframesIsolation(cli,{platform=process.platform,sandboxPath=sandbox}={}){
 if(platform!=='darwin'||sandboxPath!==sandbox||!fs.existsSync(sandbox))fail('当前宿主没有已确认的macOS原生隔离入口');
 const expected=fs.realpathSync(path.join(repo,'frontend/node_modules/hyperframes/dist/cli.js'));
 if(fs.realpathSync(cli)!==expected||sha(fs.readFileSync(expected))!==expectedCliSha)fail('CLI身份/版本锁定不符');
 const node=fs.realpathSync(process.execPath),libraries=nativeLibraries(node);
 const root=fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(),'creatoros-hyperframes-isolated-')));
 fs.chmodSync(root,0o700);plainOwned(root);
 const dirs=Object.fromEntries(['home','work','tmp','config','cache','data'].map(name=>{const dir=path.join(root,name);fs.mkdirSync(dir,{mode:0o700});return [name,dir];}));
 const opensslConfig=path.join(dirs.config,'openssl.cnf');fs.writeFileSync(opensslConfig,'# 本轮隔离测试空配置，不读取宿主配置。\n',{mode:0o600});
 const env={PATH:'/usr/bin:/bin',LANG:'C',LC_ALL:'C',HOME:dirs.home,TMPDIR:dirs.tmp,XDG_CONFIG_HOME:dirs.config,XDG_CACHE_HOME:dirs.cache,XDG_DATA_HOME:dirs.data,OPENSSL_CONF:opensslConfig,OPENSSL_CONF_INCLUDE:dirs.config,HYPERFRAMES_NO_TELEMETRY:'1',HYPERFRAMES_NO_AUTO_INSTALL:'1',HYPERFRAMES_NO_UPDATE_CHECK:'1'};
 const dependencies=fs.realpathSync(path.join(repo,'node_modules/.pnpm'));
 const profileText=[
  '(version 1)','(deny default)','(deny network*)',
  `(allow process-exec (literal ${q(node)}))`,'(deny process-fork)','(allow sysctl-read)',
  '(allow file-read-metadata)',
  `(allow file-read* (subpath "/System/Library") (subpath "/usr/lib") (subpath ${q(dependencies)}) (subpath ${q(path.dirname(node))}) ${libraries.map(file=>`(literal ${q(file)})`).join(' ')})`,
  // 系统原生profile把读取与可执行映射分开授权；仅现有系统范围及解析出的Node/dylib文件。
  `(allow file-map-executable (subpath "/System/Library") (subpath "/usr/lib") ${libraries.map(file=>`(literal ${q(file)})`).join(' ')})`,
  // 本机dyld-support.sb：OS共享缓存位于Cryptex；libignition还需open("/")作为openat根。
  '(allow file-read* file-map-executable (subpath "/System/Cryptexes/OS") (subpath "/System/Volumes/Preboot/Cryptexes/OS"))',
  '(allow file-read* (literal "/") (literal "/System") (literal "/System/Cryptexes") (literal "/System/Volumes") (literal "/System/Volumes/Preboot") (literal "/System/Volumes/Preboot/Cryptexes"))',
  `(allow file-read* (literal ${q(path.join(repo,'package.json'))}) (literal ${q(path.join(repo,'frontend/package.json'))}) (literal "/private/etc/localtime") (literal "/dev/random") (literal "/dev/urandom") (literal "/dev/null"))`,
  `(allow file-read* file-write* (subpath ${q(root)}))`,'(allow file-write* (literal "/dev/null"))',
 ].join('\n')+'\n';
 const profile=path.join(root,'cli.sb');fs.writeFileSync(profile,profileText,{mode:0o600});
 let proved=false,disposed=false,active=false;
 const proof={schema:'hyperframes-cli-isolation/v1',root,cwd:dirs.work,home:dirs.home,node,cli:expected,cliSha256:expectedCliSha,profile:profileText,environment:env,libraries,verified:false};
 const raw=(args,options={})=>execute(profile,node,args,{...options,cwd:dirs.work,env});
 const dispose=()=>{if(disposed)return;if(active)fail('仍有在途子进程，拒绝删除会话根');plainOwned(root);fs.rmSync(root,{recursive:true,force:true});disposed=true;};
 try{
  // 所有负探针目标都是本轮合成canary；父进程从不把用户凭据放入子环境。
  const outside=fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(),'creatoros-hyperframes-canary-')));
  fs.chmodSync(outside,0o700);const secret=path.join(outside,'synthetic-sensitive.txt');fs.writeFileSync(secret,'synthetic-canary',{mode:0o600});
  const server=net.createServer(socket=>{connections++;socket.destroy();});let connections=0;
  try{
   await new Promise((ok,bad)=>{server.once('error',bad);server.listen(0,'127.0.0.1',ok);});
   const port=server.address().port;
   const body=`const fs=require('node:fs'),net=require('node:net'),cp=require('node:child_process');
    const denied=fn=>{try{fn();return false}catch(e){return ['EPERM','EACCES'].includes(e.code)}};
    fs.writeFileSync(${q(path.join(dirs.work,'allowed.txt'))},'allowed');
    const readDenied=denied(()=>fs.readFileSync(${q(secret)}));
    const writeDenied=denied(()=>fs.writeFileSync(${q(path.join(outside,'forbidden.txt'))},'forbidden'));
    const socket=net.connect({host:'127.0.0.1',port:${port}});
    socket.setTimeout(2000,()=>{socket.destroy();process.exitCode=1});
    socket.once('connect',()=>{socket.destroy();process.exitCode=1});
    socket.once('error',e=>{if(!['EPERM','EACCES'].includes(e.code)){console.error(e.code);process.exitCode=1;return}
     const child=cp.spawnSync(process.execPath,['-e','process.exit(0)'],{env:process.env,encoding:'utf8'});
     const detached=cp.spawnSync(process.execPath,['-e','process.exit(0)'],{env:process.env,encoding:'utf8',detached:true});
     const refused=r=>r.status===null&&['EPERM','EACCES'].includes(r.error?.code);
     console.log(JSON.stringify({readDenied,writeDenied,networkDenied:true,forkDenied:refused(child),detachedSetsidDenied:refused(detached),home:require('node:os').homedir(),cwd:process.cwd(),parentSecretsAbsent:!process.env.NODE_OPTIONS&&!process.env.OPENAI_API_KEY&&!process.env.CREATOROS_BASE_URL}));
     if(!readDenied||!writeDenied||!refused(child)||!refused(detached))process.exitCode=1;
    });`;
   const result=await raw(['-e',body]);
   if(result.status!==0||result.signal)fail(`合成能力探针失败：${JSON.stringify({status:result.status,signal:result.signal,stdout:result.stdout.slice(0,2000),stderr:result.stderr.slice(0,2000)})}`);
   const observed=JSON.parse(result.stdout.trim());
   if(!observed.readDenied||!observed.writeDenied||!observed.networkDenied||!observed.forkDenied||!observed.detachedSetsidDenied||!observed.parentSecretsAbsent||observed.home!==dirs.home||observed.cwd!==dirs.work||connections!==0||fs.existsSync(path.join(outside,'forbidden.txt')))fail('合成能力断言不完整');
   proof.probe={...observed,connections,durationMs:result.durationMs};proof.verified=true;proved=true;
  }finally{
   server.closeAllConnections?.();await new Promise(resolve=>server.close(()=>resolve()));
   plainOwned(outside);fs.rmSync(outside,{recursive:true,force:true});
  }
 }catch(error){dispose();throw error;}
 return {root,work:dirs.work,proof,dispose,async run(args,options){if(!proved||disposed||active)fail('会话未证实、已销毁或有在途子进程');plainOwned(root);active=true;try{return await raw(args,options);}finally{active=false;}}};
}
