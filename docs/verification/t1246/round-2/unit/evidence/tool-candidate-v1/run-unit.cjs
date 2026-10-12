'use strict';
// 首轮不覆盖；工具独评绑定后，每次 fresh nonce、一次执行、不重试、不 bail。
const fs=require('node:fs'),path=require('node:path'),cp=require('node:child_process');
const runtime=require('./owned-pg-runtime.cjs'),source=require('./verify-source.cjs'),root=path.resolve(__dirname,'../../../../..');
const index=process.argv.indexOf('--review'),reviewPath=index<0?null:process.argv[index+1],execute=process.argv.includes('--execute');
async function main(){
 const binding=source.verify();if(!execute){console.log(JSON.stringify({status:'reviewable_only_no_pg_started',toolManifestSha256:binding.toolManifestSha256,sourceSnapshotDigest:binding.sourceSnapshotDigest,runtimeRoot:root,reviewContract:{approved:true,scope:'owned-pg-unit',toolManifestSha256:binding.toolManifestSha256,sourceSnapshotDigest:binding.sourceSnapshotDigest,runtimeRoot:root,runtimeDistExclusive:true}},null,2));return;}
 if(!reviewPath)throw Error('T1246_OWNED_TOOL_REVIEW_REQUIRED');const reviewBytes=fs.readFileSync(reviewPath),review=JSON.parse(reviewBytes);
 if(review.approved!==true||review.scope!=='owned-pg-unit'||review.toolManifestSha256!==binding.toolManifestSha256||review.sourceSnapshotDigest!==binding.sourceSnapshotDigest||review.runtimeRoot!==root||review.runtimeDistExclusive!==true)throw Error('T1246_OWNED_TOOL_REVIEW_NOT_BOUND');
 const packages=['contract','ai-worker','backend','frontend'];let state;const results=[];let overall=0;
 try{
  state=await runtime.start({workspace:root,evidenceRoot:path.join(__dirname,'evidence')});fs.writeFileSync(path.join(state.out,'source-before.json'),JSON.stringify(binding,null,2));fs.writeFileSync(path.join(state.out,'review-binding.json'),JSON.stringify({...review,reviewSha256:runtime.sha(reviewBytes)},null,2));
  const env={...state.env};for(const key of Object.keys(env))if(/^(CREATOROS_|S3_|AWS_|OPENAI_|ANTHROPIC_|AZURE_OPENAI_|GOOGLE_API_)/.test(key)||key==='PGLITE_DATA_DIR')delete env[key];
  Object.assign(env,{CREATOROS_OWNED_PG_MARKER:state.markerPath,CREATOROS_OWNED_PG_NONCE:state.nonce,CREATOROS_TEST_POSTGRES_URL:state.env.CREATOROS_TEST_POSTGRES_URL,CREATOROS_ISOLATED_PG_URL:state.env.CREATOROS_ISOLATED_PG_URL});
  const dirs={app:'CREATOROS_APP_DATA_DIR',db:'CREATOROS_DB_DIR',media:'CREATOROS_MEDIA_ROOT',browser:'CREATOROS_BROWSER_POOL_DIR',workbench:'CREATOROS_WORKBENCH_ROOT',backups:'CREATOROS_DATABASE_BACKUP_DIR',douyin:'CREATOROS_DOUYIN_AUTH_DIR',web:'CREATOROS_WEB_AUTH_DIR'};
  for(const [name,key]of Object.entries(dirs)){const directory=path.join(state.root,'test-runtime',name);fs.mkdirSync(directory,{recursive:true});env[key]=directory;}
  Object.assign(env,{NODE_ENV:'test',CI:'1',T1246_OWNED_PG_PRELOAD:'1',NODE_OPTIONS:'--require '+path.join(__dirname,'owned-pg-runtime.cjs')});
  if(Object.hasOwn(env,'NODE_PG_FORCE_NATIVE')||Object.hasOwn(env,'PGSERVICE')||Object.hasOwn(env,'PGSERVICEFILE'))throw Error('T1246_NATIVE_OR_SERVICE_NOT_CLEARED');
  const native=JSON.parse(cp.execFileSync(process.execPath,['-e',"console.log(JSON.stringify({nativeAbsent:!Object.hasOwn(process.env,'NODE_PG_FORCE_NATIVE'),serviceAbsent:!Object.hasOwn(process.env,'PGSERVICE')&&!Object.hasOwn(process.env,'PGSERVICEFILE'),preloadBound:require('node:net').Socket.prototype.connect.name==='t1246OwnedPgConnect',marker:process.env.CREATOROS_OWNED_PG_MARKER}))"],{cwd:root,env,encoding:'utf8',timeout:180000}));if(!native.nativeAbsent||!native.serviceAbsent||!native.preloadBound)throw Error('T1246_PRELOAD_BINDING_FAILED');fs.writeFileSync(path.join(state.out,'native-binding.json'),JSON.stringify(native,null,2));
  const build=await runtime.run('pnpm',['--filter','@creatoros/ai-worker','build'],{cwd:root,env,budgetMs:1800000});fs.writeFileSync(path.join(state.out,'worker-build.json'),JSON.stringify(build,null,2));
  const dist=cp.execFileSync('rg',['--files','ai-worker/dist'],{cwd:root,encoding:'utf8',timeout:180000}).trim().split('\n').sort().map(file=>({file,sha256:runtime.sha(fs.readFileSync(path.join(root,file)))}));fs.writeFileSync(path.join(state.out,'worker-dist-source.json'),JSON.stringify(dist,null,2));
  for(const pkg of packages){
   const cli=fs.realpathSync(path.join(root,pkg,'node_modules/vitest/vitest.mjs')),result=path.join(state.out,pkg+'.json'),log=path.join(state.out,pkg+'.log');
   const args=[cli,'run','--testTimeout=180000','--hookTimeout=180000','--teardownTimeout=180000','--retry=0','--bail=0','--allowOnly=false','--no-file-parallelism','--maxWorkers=2','--maxConcurrency=1','--reporter=default','--reporter=json','--outputFile.json='+result];
   const record=await processRun(process.execPath,args,{cwd:path.join(root,pkg),env,log,budgetMs:12*60*60*1000});record.package=pkg;results.push(record);overall||=record.code!==0?1:0;fs.writeFileSync(path.join(state.out,pkg+'-exit.json'),JSON.stringify(record,null,2));
  }
  for(const pkg of packages){
   if(pkg==='frontend'){const generated=await processRun('pnpm',['exec','next','typegen'],{cwd:path.join(root,pkg),env,log:path.join(state.out,'frontend-typegen.log'),budgetMs:1800000});results.push({package:pkg,kind:'typegen',...generated});overall||=generated.code!==0?1:0;}
   const record=await processRun('pnpm',['exec','tsc','--noEmit'],{cwd:path.join(root,pkg),env,log:path.join(state.out,pkg+'-typecheck.log'),budgetMs:1800000});results.push({package:pkg,kind:'typecheck',...record});overall||=record.code!==0?1:0;
  }
  const after=source.snapshot();fs.writeFileSync(path.join(state.out,'source-after.json'),JSON.stringify(after,null,2));if(after.sourceSnapshotDigest!==binding.sourceSnapshotDigest){overall=1;fs.writeFileSync(path.join(state.out,'source-drift.json'),JSON.stringify({before:binding.sourceSnapshotDigest,after:after.sourceSnapshotDigest,pass:false},null,2));}
 }catch(error){overall=1;if(state)fs.writeFileSync(path.join(state.out,'runner-error.json'),JSON.stringify({message:error.message,receipt:error.receipt??null},null,2));else throw error;}
 finally{if(state){try{await runtime.stop(state);}catch(error){overall=1;fs.writeFileSync(path.join(state.out,'cleanup-failure.json'),JSON.stringify({message:error.message,ownedRootRetained:state.root},null,2));}fs.writeFileSync(path.join(state.out,'summary.json'),JSON.stringify({task:'T-1246',nonce:state.nonce,results,exitCode:overall,retry:0,firstEvidencePreserved:true,nativeAppAcceptance:false},null,2));}}
 process.exitCode=overall;
}
async function processRun(file,args,{cwd,env,log,budgetMs}){
 const fd=fs.openSync(log,'wx'),started=Date.now();return await new Promise((resolve,reject)=>{const child=cp.spawn(file,args,{cwd,env,stdio:['ignore',fd,fd]});let exhausted=false;const timer=setTimeout(()=>{exhausted=true;child.kill('SIGTERM');},budgetMs);child.once('error',e=>{clearTimeout(timer);fs.closeSync(fd);reject(e);});child.once('close',(code,signal)=>{clearTimeout(timer);fs.closeSync(fd);resolve({file,args,cwd,log,pid:child.pid,startedAt:new Date(started).toISOString(),endedAt:new Date().toISOString(),elapsedMs:Date.now()-started,code,signal,budgetMs,budgetExhausted:exhausted});});});
}
main().catch(error=>{console.error(error.stack);process.exitCode=1;});
