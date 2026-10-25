// 本任务owned PG红绿驱动；不加载旧run-unit/浏览器旅程、不读取用户库。
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createRequire} from 'node:module';
const here=path.dirname(fileURLToPath(import.meta.url)),repo=path.resolve(here,'../../..');
// 本驱动所有进程使用同一原生临时根；不能因宿主TMPDIR不同误判自己的marker。
process.env.TMPDIR='/private/tmp';
const require=createRequire(import.meta.url);
const runtime=require('../t1246/round-2/unit/owned-pg-runtime.cjs');
const mode=process.argv[2],stateFile=path.join(here,'owned-pg-state.json');
if(!['start','red','unit','guard','green','stop'].includes(mode))throw Error('mode=start|red|unit|guard|green|stop');
if(mode==='start'){
 if(fs.existsSync(stateFile))throw Error('不得覆盖已有实例状态');
 const home=fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(),'t1412-pg-home-')));fs.chmodSync(home,0o700);
 for(const key of Object.keys(process.env))delete process.env[key];
 Object.assign(process.env,{PATH:'/opt/homebrew/bin:/usr/bin:/bin',HOME:home,TMPDIR:os.tmpdir(),LANG:'C',LC_ALL:'C',NODE_ENV:'test',CI:'1'});
 let state;
 try{
  state=await runtime.start({workspace:repo,evidenceRoot:path.join(here,'owned-pg-start')});
  const record={nonce:state.nonce,root:state.root,out:state.out,markerPath:state.markerPath,binaries:state.binaries,marker:state.marker,home};
  fs.writeFileSync(stateFile,JSON.stringify(record,null,2)+'\n',{mode:0o600,flag:'wx'});
  console.log(JSON.stringify({started:true,port:state.marker.port,pid:state.marker.pid,markerPath:state.markerPath}));
 }catch(error){if(state)await runtime.stop(state);fs.rmSync(home,{recursive:true,force:true});throw error;}
}else{
 const state=JSON.parse(fs.readFileSync(stateFile));runtime.verify(state.markerPath,state.nonce);
 if(mode==='stop'){
  const result=await runtime.stop(state);
  fs.rmSync(state.home,{recursive:true,force:true});
  fs.writeFileSync(path.join(here,'owned-pg-stop.json'),JSON.stringify({stoppedAt:new Date().toISOString(),result,rootGone:!fs.existsSync(state.root),homeGone:!fs.existsSync(state.home)},null,2)+'\n');
  console.log('owned PG已停止，临时根已按原机制清理');
 }else{
  const url=`postgresql://${state.marker.adminRole}@127.0.0.1:${state.marker.port}/postgres`;
  const env={PATH:'/opt/homebrew/bin:/usr/bin:/bin',HOME:state.home,TMPDIR:os.tmpdir(),LANG:'C',LC_ALL:'C',NODE_ENV:'test',CI:'1',CREATOROS_TEST_POSTGRES_URL:url,CREATOROS_ISOLATED_PG_URL:url,CREATOROS_OWNED_PG_MARKER:state.markerPath,CREATOROS_OWNED_PG_NONCE:state.nonce};
  for(const key of ['CREATOROS_APP_DATA_DIR','CREATOROS_DB_DIR','CREATOROS_MEDIA_ROOT','CREATOROS_BROWSER_POOL_DIR','CREATOROS_WORKBENCH_ROOT','CREATOROS_DATABASE_BACKUP_DIR','CREATOROS_DOUYIN_AUTH_DIR','CREATOROS_WEB_AUTH_DIR']){const dir=path.join(state.root,key);fs.mkdirSync(dir,{recursive:true,mode:0o700});env[key]=dir;}
  const log=path.join(here,`archive-${mode}.log`);
  const command=mode==='guard'?'pnpm':process.execPath;
  const args=mode==='guard'?['-C','backend','exec','vitest','run','src/test-fixtures/owned-postgres.test.ts','--retry=0']:mode==='unit'?['--test',path.join(repo,'docs/verification/t1022/run-archive-guard.test.mjs')]:[path.join(repo,'docs/verification/t1022/run-archive-guard.mjs')];
  const result=await runtime.boundedProcess(command,args,{cwd:repo,env,budgetMs:1800000,log});
  fs.writeFileSync(path.join(here,`archive-${mode}-receipt.json`),JSON.stringify(result,null,2)+'\n');
  console.log(JSON.stringify({mode,code:result.code,signal:result.signal,budgetExhausted:result.budgetExhausted,processClosed:result.processClosed,remaining:result.remainingOwnedGroupMembers.length,log}));
  if(mode==='red'){if(result.code===0)throw Error('旧入口没有出现预期拒绝，不能伪造RED');}
  else if(result.code!==0||result.budgetExhausted||!result.processClosed||result.remainingOwnedGroupMembers.length)process.exitCode=1;
 }
}
