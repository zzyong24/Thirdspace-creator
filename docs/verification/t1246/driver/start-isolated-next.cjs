#!/usr/bin/env node
// Reuses T1238's real Next loadConfig + standalone-config mechanism.
// Does not edit next.config.ts, rebuild Worker, or reuse another server.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const {spawn,execFileSync}=require('node:child_process');
const root=path.resolve(__dirname,'../../../..'),frontend=path.join(root,'frontend');
const run=process.env.CREATOROS_T1246_RUN_DIR;
const frozen=process.env.CREATOROS_T1246_FROZEN_CANDIDATE;
let child, isolatedDistDir;
const metadata=['tsconfig.json','next-env.d.ts'].map(name=>({file:path.join(frontend,name),before:fs.existsSync(path.join(frontend,name))?fs.readFileSync(path.join(frontend,name),'utf8'):null,generated:null}));
let finished=false;
function cleanup(){
 if(finished)return;finished=true;
 const cleanupRecords=[];
 for(const item of metadata){
  if(!fs.existsSync(item.file))continue;
  const current=fs.readFileSync(item.file,'utf8');
  if(!isolatedDistDir||!current.includes(isolatedDistDir))continue;
  if(item.file.endsWith('tsconfig.json')){
   const parsed=JSON.parse(current);parsed.include=parsed.include.filter(x=>!x.startsWith(isolatedDistDir+'/'));
   const previous=item.before===null?null:JSON.parse(item.before);
   if(current===item.generated&&JSON.stringify(parsed)===JSON.stringify(previous))fs.writeFileSync(item.file,item.before);
   else fs.writeFileSync(item.file,JSON.stringify(parsed,null,2)+'\n');
  }else{
   const previousImport=item.before?.split('\n').find(line=>line.startsWith('import ')&&line.includes('/types/routes.d.ts'))??'';
   fs.writeFileSync(item.file,current.split('\n').map(line=>line.includes(isolatedDistDir+'/types/routes.d.ts')?previousImport:line).join('\n'));
  }
  cleanupRecords.push({file:item.file,removedOnlyRuntimePath:isolatedDistDir,preservedConcurrentOtherEdits:true});
 }
 if(run)fs.writeFileSync(path.join(run,'next-cleanup.json'),JSON.stringify({cleanupRecords,isolatedDistDir,preservedRuntimeCache:true},null,2)+'\n');
}
(async()=>{
 if(process.cwd()!==frontend)throw Error('Start only from frozen integration frontend.');
 if(!run||!path.isAbsolute(run)||!frozen)throw Error('Bind round output and frozen candidate; no default launch.');
 if(execFileSync('git',['rev-parse','HEAD'],{cwd:root,encoding:'utf8'}).trim()!==frozen)throw Error('Candidate SHA mismatch.');
 if(process.env.CREATOROS_T1246_PACKAGE_READY!=='1')throw Error('Root must explicitly confirm package complete before Next starts.');
 if(process.env.CREATOROS_DESKTOP==='1')throw Error('Desktop packaging environment cannot be used for isolated browser dev server.');
 const token=crypto.createHash('sha256').update(fs.realpathSync(run)+'\0'+frozen).digest('hex').slice(0,16);
 isolatedDistDir=path.join('.next','t1246-'+token);
 if(fs.existsSync(path.join(frontend,isolatedDistDir)))throw Error('This round Next cache already exists; use a fresh per-round output directory.');
 const loadConfig=require(path.join(frontend,'node_modules/next/dist/server/config.js')).default;
 const {PHASE_DEVELOPMENT_SERVER}=require(path.join(frontend,'node_modules/next/constants.js'));
 const config=await loadConfig(PHASE_DEVELOPMENT_SERVER,frontend);
 const isolatedConfig={...config,distDir:isolatedDistDir};
 const dist=path.join(root,'ai-worker/dist');
 const files=fs.readdirSync(dist).filter(x=>/\.(?:cjs|mjs|js)$/.test(x)).map(name=>({file:name,sha256:crypto.createHash('sha256').update(fs.readFileSync(path.join(dist,name))).digest('hex')}));
 const buildSource=fs.readFileSync(path.join(root,'ai-worker/scripts/build.mjs'),'utf8');
 const required=[...buildSource.matchAll(/\.\.\/dist\/([^"']+\.(?:cjs|mjs|js))/g)].map(match=>match[1]);
 if(!required.length||required.some(name=>!files.some(file=>file.file===name)))throw Error('Frozen Worker dist entries required by current real build.mjs are missing: '+required.filter(name=>!files.some(file=>file.file===name)).join(','));
 fs.writeFileSync(path.join(run,'next-launch.json'),JSON.stringify({frozen,isolatedDistDir,nextConfigUnmodified:true,workerBuildDuringLaunch:false,workerDistFiles:files,isolatedData:{db:process.env.PGLITE_DATA_DIR,media:process.env.CREATOROS_MEDIA_ROOT,authWeb:process.env.CREATOROS_WEB_AUTH_DIR}},null,2)+'\n');
 const port=process.env.CREATOROS_TEST_PORT;
 if(!port||!/^\d+$/.test(port))throw Error('Bind original Playwright test port explicitly before starting.');
 child=spawn(process.execPath,[path.join(frontend,'node_modules/next/dist/bin/next'),'dev','--hostname','127.0.0.1','--port',port],{cwd:frontend,stdio:['ignore','pipe','pipe'],env:{...process.env,__NEXT_PRIVATE_STANDALONE_CONFIG:JSON.stringify(isolatedConfig)}});
 let gotMetadata=false, startupOutput="";
 for(const [stream,out]of [[child.stdout,process.stdout],[child.stderr,process.stderr]])stream.on('data',bytes=>{out.write(bytes);startupOutput+=bytes.toString();if(!gotMetadata&&startupOutput.includes('SIDECAR_STARTUP_VERIFIED')){gotMetadata=true;for(const item of metadata)item.generated=fs.existsSync(item.file)?fs.readFileSync(item.file,'utf8'):null;}});
 child.once('error',e=>{console.error(e);cleanup();process.exitCode=1;});
 child.once('exit',(code,signal)=>{cleanup();process.exitCode=signal?1:code??1;});
})().catch(e=>{console.error(e);cleanup();process.exitCode=1;});
for(const signal of ['SIGTERM','SIGINT'])process.once(signal,()=>{if(child&&child.exitCode===null)child.kill(signal);else{cleanup();process.exitCode=1;}});
