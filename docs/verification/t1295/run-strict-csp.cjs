'use strict';
// T1295 双视口静态 CSP/native 验证；不启动 Next，不请求 binding.baseURL。
const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),os=require('node:os');
const cp=require('node:child_process'),crypto=require('node:crypto'),net=require('node:net');
const {createRequire}=require('node:module');
const sha=b=>crypto.createHash('sha256').update(b).digest('hex');
const write=(p,v)=>fs.writeFileSync(p,JSON.stringify(v,null,2)+'\n',{mode:0o600});
const pinned={
 'frontend/tests/e2e/t1295-desktop-csp-wasm-video.spec.ts':'b9076cfa97b08dcdbeabf1ffa9b414c76589a136df9a05b4d7be305bde0d7919',
 'frontend/scripts/desktop/desktop-csp.mjs':'8e5aa8dc7e6f5ebb5495075d268eb5dc61fc9816e38ebf5c7cdc5a22c68e4279',
 'frontend/public/reference-editors/opencut-classic/native/native.js':'bf28451b8c59619b22e8a5f4654ece823db5dfcbd2368fa89c0c49b38b6dff90',
 'frontend/public/reference-editors/opencut-classic/native/native.css':'070add8a681da90be5b41225354d2527fb720dff7fd21de2782638d8898f815c',
 'reference-editors/opencut-classic/native/native.js':'bf28451b8c59619b22e8a5f4654ece823db5dfcbd2368fa89c0c49b38b6dff90',
 'docs/verification/t1295/browser/v3-native-ui-candidate/owned-normal-binding.json':'6b3fd721983773f163940877c60215469aefc09a6078a9a295896f0c3cd822e6',
};
const viewports=[{name:'desktop',width:1536,height:1024},{name:'compact',width:640,height:450}];
const title='T1295 release CSP page-origin WASM42 + JS eval/Function禁用 + 真实native预览导出';
const alive=pid=>{try{process.kill(pid,0);return true;}catch(e){if(e.code==='ESRCH')return false;throw e;}};
const read=p=>JSON.parse(fs.readFileSync(p,'utf8'));
function checkSource(root){const actual={};for(const [file,hash]of Object.entries(pinned)){actual[file]=sha(fs.readFileSync(path.join(root,file)));assert.equal(actual[file],hash,'绑定漂移: '+file);}return actual;}
function portClosed(origin){return new Promise((resolve,reject)=>{const u=new URL(origin);assert.equal(u.hostname,'127.0.0.1');const s=net.connect({host:'127.0.0.1',port:Number(u.port)});s.setTimeout(2000);s.once('connect',()=>{s.destroy();resolve(false);});s.once('error',e=>{s.destroy();if(e.code==='ECONNREFUSED')resolve(true);else reject(e);});s.once('timeout',()=>{s.destroy();reject(Error('owned listener 关闭状态未确认'));});});}
function collect(suites,out=[]){for(const s of suites||[]){for(const spec of s.specs||[])for(const t of spec.tests||[])out.push({title:spec.title,...t});collect(s.suites,out);}return out;}
async function closure(dir,childPid){
 const result={driverPid:childPid,driverAlive:alive(childPid),browserProcesses:[],temporaryRemoved:false};
 assert.equal(result.driverAlive,false);
 const closed=read(path.join(dir,'closed.json')),server=read(path.join(dir,'server.json'));
 assert.equal(closed.browserConnected,false);assert.equal(closed.serverListening,false);assert.equal(closed.serverClosed,true);
 result.workerPid=closed.pid;result.workerAlive=alive(closed.pid);assert.equal(result.workerAlive,false);
 result.serverOrigin=server.origin;result.listenerClosed=await portClosed(server.origin);assert.equal(result.listenerClosed,true);
 const processes=read(path.join(dir,'browser-processes.json'));
 for(const p of processes.processInfo||[]){assert(Number.isInteger(p.id)&&p.id>0);result.browserProcesses.push({pid:p.id,alive:alive(p.id),type:p.type});}
 assert(result.browserProcesses.length>0);assert(result.browserProcesses.every(p=>!p.alive),'browser PID 尚未闭合；不杀进程、不清临时目录');
 const owner=read(path.join(dir,'owner.json')),temp=fs.realpathSync(owner.ownedRoot);
 assert.equal(owner.task,'T-1295');assert.equal(owner.uid,process.getuid());assert.equal(owner.sourceRoot,sourceRoot);
 assert.equal(temp,fs.realpathSync(closed.ownedRoot));
 assert.equal(path.dirname(temp),fs.realpathSync('/tmp'));assert(path.basename(temp).startsWith('t1295-csp-'));
 assert.equal(fs.lstatSync(temp).uid,process.getuid());assert(fs.lstatSync(temp).isDirectory());
 const marker=read(path.join(temp,'owner.json'));assert.deepEqual(marker,owner);
 const entries=fs.readdirSync(temp).sort();assert.deepEqual(entries,['owner.json','source.mp4']);
 const mediaPath=path.join(temp,'source.mp4');assert(fs.lstatSync(mediaPath).isFile()&&!fs.lstatSync(mediaPath).isSymbolicLink());
 assert.equal(sha(fs.readFileSync(mediaPath)),read(path.join(dir,'binding.json')).sourceClip.sha256);
 result.temporaryRoot=temp;result.removedBytes=fs.statSync(mediaPath).size+fs.statSync(path.join(temp,'owner.json')).size;
 fs.unlinkSync(mediaPath);fs.unlinkSync(path.join(temp,'owner.json'));fs.rmdirSync(temp);result.temporaryRemoved=!fs.existsSync(temp);
 return result;
}
let sourceRoot,batchRoot;
async function main(){
 assert.equal(process.argv.length,4,'用法: node run-strict-csp.cjs <sourceRoot> <explicitOwnedBinding>');
 sourceRoot=fs.realpathSync(process.argv[2]);const bindingPath=fs.realpathSync(process.argv[3]);
 assert.equal(bindingPath,path.join(sourceRoot,'docs/verification/t1295/browser/v3-native-ui-candidate/owned-normal-binding.json'));
 const initial=checkSource(sourceRoot),binding=read(bindingPath),marker=path.join(binding.ownedRoot,'owner.json');
 assert.equal(binding.sourceRoot,sourceRoot);assert.equal(binding.uid,process.getuid());assert.equal(new URL(binding.baseURL).hostname,'127.0.0.1');
 assert.equal(fs.statSync(binding.ownedRoot).uid,process.getuid());assert.equal(sha(fs.readFileSync(marker)),binding.markerSha256);
 assert.equal(read(marker).task,'T-1294');
 const nonce=crypto.randomBytes(8).toString('hex'),batch=path.join(sourceRoot,'docs/verification/t1295/browser/runs','strict-csp-'+nonce);
 fs.mkdirSync(batch,{mode:0o700});batchRoot=batch;const config=path.join(__dirname,'playwright.strict-csp.config.cjs');
 const cli=createRequire(path.join(sourceRoot,'frontend/package.json')).resolve('@playwright/test/cli');
 const summary={task:'T-1295',mode:'current',state:'RUNNING',sourceRoot,bindingPath,bindingSHA256:sha(fs.readFileSync(bindingPath)),markerSHA256:sha(fs.readFileSync(marker)),
  initial,configSHA256:sha(fs.readFileSync(config)),runnerSHA256:sha(fs.readFileSync(__filename)),at:new Date().toISOString(),
  staticOnly:true,nextOnlineRequired:false,publicBusinessRequestsPlanned:0,modelsSubmitted:0,rootAppStopped:false,viewports:[]};
 write(path.join(batch,'summary.json'),summary);console.log(JSON.stringify({batch,viewports}));
 let interrupted=false,active;
 const interrupt=signal=>{interrupted=true;if(active)active.kill(signal);};
 const onInt=()=>interrupt('SIGINT'),onTerm=()=>interrupt('SIGTERM');
 process.on('SIGINT',onInt);process.on('SIGTERM',onTerm);
 try{
  for(const viewport of viewports){
   if(interrupted)break;
   const dir=path.join(batch,viewport.name);fs.mkdirSync(dir,{mode:0o700});
   // 固定文件名在独占 root 中使用；两个 project 必须分开调用，不能用同一个 root。
   const ownConfig=path.join(dir,'config-used.cjs');fs.copyFileSync(config,ownConfig);
   fs.copyFileSync(path.join(sourceRoot,'frontend/tests/e2e/t1295-desktop-csp-wasm-video.spec.ts'),path.join(dir,'formal-used.spec.ts'));
   const env={PATH:process.env.PATH,HOME:process.env.HOME,LANG:'en_US.UTF-8',TZ:'Asia/Shanghai',NO_PROXY:'127.0.0.1,localhost',no_proxy:'127.0.0.1,localhost',
    CI:'1',NEXT_TELEMETRY_DISABLED:'1',TMPDIR:'/tmp',T1295_SOURCE_ROOT:sourceRoot,T1295_POLICY_MODE:'current',T1295_SERVICE_BINDING:bindingPath,
    T1295_EVIDENCE_ROOT:dir,T1295_BROWSER_CHANNEL:'chrome',T1295_STRICT_PROJECT:viewport.name};
   const args=[cli,'test','--config',ownConfig,'--project',viewport.name,'--workers=1','--retries=0','--grep','page-origin'];
   const receipt={viewport,evidenceRoot:dir,args,envKeys:Object.keys(env),startedAt:new Date().toISOString()};
   write(path.join(dir,'invocation.json'),receipt);
   const log=fs.createWriteStream(path.join(dir,'run.log'),{mode:0o600});
   const exit=await new Promise(resolve=>{
    active=cp.spawn(process.execPath,args,{cwd:sourceRoot,env,stdio:['ignore','pipe','pipe']});
    active.stdout.pipe(log,{end:false});active.stderr.pipe(log,{end:false});active.stdout.pipe(process.stdout);active.stderr.pipe(process.stderr);
    const pid=active.pid;active.once('error',error=>{receipt.spawnError=error.message;});
    active.once('close',(code,signal)=>{active=undefined;log.end(()=>resolve({code,signal,pid,at:new Date().toISOString()}));});
   });
   write(path.join(dir,'exit.json'),exit);Object.assign(receipt,{exit,status:'FAIL'});
   try{
    // 即使断言 FAIL，也先核真实退出和清理；不自动重跑、不杀不明进程。
    receipt.closure=await closure(dir,exit.pid);write(path.join(dir,'resource-closure.json'),receipt.closure);
    assert.equal(exit.code,0);assert.equal(exit.signal,null);
    const tests=collect(read(path.join(dir,'playwright.json')).suites);assert.equal(tests.length,1);
    const t=tests[0];assert.equal(t.title,title);assert.equal(t.projectName,viewport.name);assert.equal(t.expectedStatus,'passed');
    assert.equal(t.results.length,1);assert.equal(t.results[0].status,'passed');assert.equal(t.results[0].retry,0);
    const requests=read(path.join(dir,'closed.json')).networkRequests;
    assert(requests.every(r=>r.method==='GET'&&!r.path.startsWith('/api/')),'静态链意外公共请求');
    receipt.status='PASS';
   }catch(error){receipt.error=String(error.stack||error);}
   receipt.sourceAfter=checkSource(sourceRoot);summary.viewports.push(receipt);write(path.join(batch,'summary.json'),summary);
  }
 }finally{process.removeListener('SIGINT',onInt);process.removeListener('SIGTERM',onTerm);}
 summary.finishedAt=new Date().toISOString();summary.interrupted=interrupted;
 summary.state=summary.viewports.length===2&&summary.viewports.every(v=>v.status==='PASS')&&!interrupted?'PASS':'FAIL';
 summary.final=checkSource(sourceRoot);write(path.join(batch,'summary.json'),summary);
 console.log(JSON.stringify({batch,state:summary.state,viewports:summary.viewports.map(v=>({name:v.viewport.name,status:v.status,evidenceRoot:v.evidenceRoot}))}));
 process.exitCode=summary.state==='PASS'?0:1;
}
main().catch(error=>{if(batchRoot)write(path.join(batchRoot,'fatal.json'),{status:'FAIL',at:new Date().toISOString(),error:String(error.stack||error)});console.error(error.stack||error);process.exitCode=1;});
