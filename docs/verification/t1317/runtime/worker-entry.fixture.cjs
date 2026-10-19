'use strict';
// TEST ONLY: load the unchanged pinned worker; replace only external Codex process I/O.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),cp=require('node:child_process');
const root=process.env.T1317_FIXTURE_ROOT;
if(!root||!root.includes('/docs/verification/t1317/runtime/cases/'))throw Error('T1317_OWNED_ROOT_REQUIRED');
const binding=JSON.parse(fs.readFileSync(path.resolve(__dirname,'WORKER_BINDING.json'),'utf8'));
const bytes=fs.readFileSync(binding.executionWorkerPath);
if(crypto.createHash('sha256').update(bytes).digest('hex')!==binding.sha256)throw Error('T1317_WORKER_DRIFT');
const log=x=>fs.appendFileSync(path.join(root,'process-boundary.ndjson'),JSON.stringify(x)+'\n');
const originalSpawn=cp.spawn;
cp.execFile=function(file,args,options,callback){
 if(typeof options==='function')callback=options;
 if(path.basename(file)!=='codex'||JSON.stringify(args)!=='["--version"]')throw Error('T1317_EXECFILE_FORBIDDEN');
 log({boundary:'synthetic-codex-version',actualExecutableStarted:false});
 queueMicrotask(()=>callback(null,'codex-cli 0.159.3\n',''));
 return {kill(){return true;}};
};
cp.spawn=function(file,args,options){
 if(path.basename(file)!=='codex'||args?.[0]!=='app-server')throw Error('T1317_SPAWN_FORBIDDEN');
 log({boundary:'synthetic-codex-rpc-child',actualExecutableStarted:false});
 return originalSpawn(process.execPath,[path.join(__dirname,'codex-cli.fixture.cjs'),root,...args],{...options,env:{...options.env,T1317_FIXTURE_ROOT:root}});
};
// The worker never inherits user's model credentials or auth home.
process.env.CODEX_HOME=path.join(root,'empty-codex-home');
for(const key of ['HTTP_PROXY','HTTPS_PROXY','ALL_PROXY'])delete process.env[key];
require(binding.executionWorkerPath);
