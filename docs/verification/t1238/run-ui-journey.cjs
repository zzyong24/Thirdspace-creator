// 真实浏览器验收：每轮新建隔离库，只测试设置，不生成内容或发布。
const fs=require('node:fs'),path=require('node:path'),os=require('node:os');
const {spawn}=require('node:child_process');
const {createServer}=require('node:net');
const root=path.resolve(__dirname,'../../..');
function availablePort(){return new Promise((resolve,reject)=>{const server=createServer();server.on('error',reject);server.listen(0,'127.0.0.1',()=>{const port=server.address().port;server.close(()=>resolve(port));});});}
async function stopOwned(server){
 if(server.exitCode!==null)return;
 // 只在测试结束取消本轮隔离进程树；下面是取消后的清理余量。
 try{process.kill(-server.pid,'SIGTERM');}catch{}
 await Promise.race([new Promise(resolve=>server.once('exit',resolve)),new Promise(resolve=>setTimeout(resolve,5000))]);
 if(server.exitCode===null){try{process.kill(-server.pid,'SIGKILL');}catch{}}
}
(async()=>{
 const frontend=path.join(root,'frontend');
 const metadata=['tsconfig.json','next-env.d.ts'].map(name=>({file:path.join(frontend,name),before:fs.existsSync(path.join(frontend,name))?fs.readFileSync(path.join(frontend,name),'utf8'):null,generated:null}));
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'creatoros-t1238-settings-'));
 // 使用当前Next真实配置的完整默认值，只隔离构建缓存与dev锁；不改产品配置或复用他人服务。
 const loadConfig=require(path.join(root,'frontend/node_modules/next/dist/server/config.js')).default;
 const {PHASE_DEVELOPMENT_SERVER}=require(path.join(root,'frontend/node_modules/next/constants.js'));
 const config=await loadConfig(PHASE_DEVELOPMENT_SERVER,path.join(root,'frontend'));
 const isolatedDistDir=path.join('.next',path.basename(dir));
 const isolatedConfig={...config,distDir:isolatedDistDir};
 const port=await availablePort();const log=fs.openSync(path.join(__dirname,'ui-journey-server.txt'),'w');
 const server=spawn('pnpm',['exec','next','dev','--hostname','127.0.0.1','--port',String(port)],{cwd:path.join(root,'frontend'),detached:true,stdio:['ignore','pipe','pipe'],env:{...process.env,__NEXT_PRIVATE_STANDALONE_CONFIG:JSON.stringify(isolatedConfig),DATABASE_URL:'',PGLITE_DATA_DIR:path.join(dir,'db'),CREATOROS_MEDIA_ROOT:path.join(dir,'media'),CREATOROS_DOUYIN_AUTH_DIR:path.join(dir,'douyin'),CREATOROS_WEB_AUTH_DIR:path.join(dir,'web'),CREATOROS_DISABLE_SCHEDULER:'1',CREATOROS_DISABLE_BACKGROUND_DRIVERS:'1',CREATOROS_DEV_MODE:'1'}});
 let resolveReady;const ready=new Promise(resolve=>{resolveReady=resolve;});let source='';
 for(const stream of [server.stdout,server.stderr])stream.on('data',chunk=>{fs.writeSync(log,chunk);source+=chunk.toString();if(source.includes('SIDECAR_STARTUP_VERIFIED'))resolveReady();});
 try{
  await new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(Error('隔离设置服务启动超时')),180000);ready.then(()=>{clearTimeout(timer);resolve();});server.once('error',e=>{clearTimeout(timer);reject(e);});server.once('exit',code=>{clearTimeout(timer);reject(Error('隔离设置服务提前退出 '+code));});});
  for(const item of metadata)item.generated=fs.existsSync(item.file)?fs.readFileSync(item.file,'utf8'):null;
  const script=spawn(process.execPath,[path.join(__dirname,'ui-final.cjs')],{cwd:root,stdio:'inherit',env:{...process.env,T1238_UI_BASE_URL:`http://127.0.0.1:${port}`,T1238_UI_ACCOUNT_ID:''}});
  const code=await new Promise((resolve,reject)=>{script.once('error',reject);script.once('exit',resolve);});
  if(code!==0)throw Error('真实设置操作失败 '+code);
  console.log('真实隔离设置旅程完成');
 }finally{await stopOwned(server);
  // Next可能写回类型入口；只清掉本轮路径，保留并发编辑和其他dev服务的更新。
  for(const item of metadata){
   if(!fs.existsSync(item.file))continue;
   const current=fs.readFileSync(item.file,'utf8');
   if(!current.includes(isolatedDistDir))continue;
   if(item.file.endsWith('tsconfig.json')){
    const parsed=JSON.parse(current);parsed.include=parsed.include.filter(value=>!value.startsWith(isolatedDistDir+'/'));
    const previous=item.before===null?null:JSON.parse(item.before);
    if(current===item.generated&&JSON.stringify(parsed)===JSON.stringify(previous))fs.writeFileSync(item.file,item.before);
    else fs.writeFileSync(item.file,JSON.stringify(parsed,null,2)+'\n');
   }else{
    if(current===item.generated&&item.before!==null)fs.writeFileSync(item.file,item.before);
    else{const previousImport=item.before?.split('\n').find(line=>line.startsWith('import ')&&line.includes('/types/routes.d.ts'))??'';fs.writeFileSync(item.file,current.split('\n').map(line=>line.includes(isolatedDistDir+'/types/routes.d.ts')?previousImport:line).join('\n'));}
   }
  }
  fs.closeSync(log);fs.rmSync(dir,{recursive:true,force:true});fs.rmSync(path.join(root,'frontend',isolatedDistDir),{recursive:true,force:true});}
})().catch(error=>{console.error(error);process.exitCode=1;});
