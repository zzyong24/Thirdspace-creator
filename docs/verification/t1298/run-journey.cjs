"use strict";
// 显式strict验收：只创建新owned库/媒体/任务，不读取用户App数据，不重试旧任务。
const fs=require('node:fs'),path=require('node:path'),cp=require('node:child_process'),{createRequire}=require('node:module');
const root=fs.realpathSync(path.resolve(__dirname,'../../..')),driver=path.join(__dirname,'browser/driver');
const waitExit=child=>new Promise(resolve=>{child.once('close',(code,signal)=>resolve({code,signal}));});
async function main(){
 const prepared=JSON.parse(cp.execFileSync(process.execPath,[path.join(driver,'prepare.cjs'),'--prepare',root],{cwd:root,encoding:'utf8',timeout:300000,maxBuffer:16*1024*1024}));
 const binding=JSON.parse(fs.readFileSync(prepared.bindingPath,'utf8')),out=binding.evidenceRoot;
 const save=(name,value)=>fs.writeFileSync(path.join(out,name+'.json'),JSON.stringify(value,null,2)+'\n',{mode:0o600});
 console.log(JSON.stringify({task:'T-1298',binding:prepared.bindingPath,ownedRoot:binding.ownedRoot}));
 const env={...process.env,T1298_BINDING:prepared.bindingPath,CI:'1'},launcher=cp.spawn(process.execPath,[path.join(driver,'launch-next.cjs'),prepared.bindingPath],{cwd:root,env,stdio:['ignore','pipe','pipe']});
 const launcherExit=waitExit(launcher);let launcherEnded=false;void launcherExit.then(()=>launcherEnded=true);
 const log=fs.createWriteStream(path.join(out,'strict-launch.log'),{mode:0o600});launcher.stdout.pipe(log,{end:false});launcher.stderr.pipe(log,{end:false});
 let readyTimer;const ready=new Promise((resolve,reject)=>{let text='';readyTimer=setTimeout(()=>reject(Error('OWNED_NEXT_READY_OBSERVATION_ENDED')),300000);launcher.stdout.on('data',chunk=>{text+=chunk.toString();for(const line of text.split('\n').slice(0,-1)){try{const e=JSON.parse(line);if(e.event==='listening'){clearTimeout(readyTimer);resolve();}if(e.event==='startup-error'){clearTimeout(readyTimer);reject(Error('OWNED_NEXT_STARTUP_FAILED'));}}catch(error){if(error.message==='OWNED_NEXT_STARTUP_FAILED')reject(error);}}text=text.slice(text.lastIndexOf('\n')+1);});void launcherExit.then(()=>{clearTimeout(readyTimer);reject(Error('OWNED_NEXT_EXITED_BEFORE_READY'));});});
 let result,shutdown;const startedAt=new Date().toISOString();
 try{
  await ready;
  const cli=createRequire(path.join(root,'frontend/package.json')).resolve('@playwright/test/cli');
  const args=[cli,'test','--config',path.join(driver,'playwright.config.cjs'),'--workers=1','--retries=0'];
  const child=cp.spawn(process.execPath,args,{cwd:root,env,stdio:['ignore','pipe','pipe']});const childExit=waitExit(child);
  const testLog=fs.createWriteStream(path.join(out,'strict-playwright.log'),{mode:0o600});child.stdout.pipe(testLog,{end:false});child.stderr.pipe(testLog,{end:false});child.stdout.pipe(process.stdout);child.stderr.pipe(process.stderr);
  result=await childExit;testLog.end();save('strict-test-exit',{...result,pid:child.pid,args,startedAt,endedAt:new Date().toISOString()});
  const hash=file=>require('node:crypto').createHash('sha256').update(fs.readFileSync(file)).digest('hex');
  const changed=[...binding.files,...binding.bundles].filter(row=>hash(path.join(root,row.path))!==row.sha256).map(row=>row.path);save('source-hash-after',{changed,checked:binding.files.length+binding.bundles.length});
  if(changed.length)throw Error('SOURCE_CHANGED_DURING_JOURNEY:'+changed.join(','));
  if(result.code!==0)throw Error('OWNED_UI_JOURNEY_FAILED:'+out);
  const report=JSON.parse(fs.readFileSync(path.join(out,'playwright.json'),'utf8'));if(report.stats.expected!==1||report.stats.unexpected!==0||report.stats.flaky!==0||report.stats.skipped!==0)throw Error('REAL_JOURNEY_REQUIRED');
 }finally{
  clearTimeout(readyTimer);if(!launcherEnded)launcher.kill('SIGTERM');
  let cleanupTimer;try{shutdown=await Promise.race([launcherExit,new Promise((_,reject)=>{cleanupTimer=setTimeout(()=>reject(Error('OWNED_SHUTDOWN_UNCONFIRMED:'+out)),1800000);})]);}finally{clearTimeout(cleanupTimer);log.end();}
  save('strict-run-result',{test:result??null,shutdown,appStopped:false,userDataTouched:false,ownedRoot:binding.ownedRoot,binding:prepared.bindingPath,finishedAt:new Date().toISOString()});
  if(shutdown.code!==0)throw Error('OWNED_SHUTDOWN_FAILED:'+out);
 }
 fs.writeFileSync(path.join(__dirname,'STRICT_LATEST.json'),JSON.stringify({binding:prepared.bindingPath,evidenceRoot:out,head:binding.sourceHead,realJourneyPassed:true,shutdown},null,2)+'\n',{mode:0o600});
}
main().catch(error=>{console.error(error.message);process.exitCode=1;});
