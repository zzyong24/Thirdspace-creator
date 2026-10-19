// 本机验收维护入口；不进入产品构建、运行时或发布 Gate。
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import {fileURLToPath} from 'node:url';
import {createHash, randomUUID} from 'node:crypto';
import {spawnSync} from 'node:child_process';

const root=fs.realpathSync(path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..'));
if(fs.realpathSync(process.cwd())!==root) throw new Error('必须从本验收入口所属工作树运行。');
const frontend=path.join(root,'frontend');
const devFiles=['frontend/.next/dev/types/routes.d.ts','frontend/.next/dev/types/validator.ts'];
const prodFiles=['frontend/.next/types/routes.d.ts','frontend/.next/types/validator.ts'];
const mode=process.argv[2];
if(process.argv.length!==3||!['prepare','verify-production','verify-development'].includes(mode)) throw new Error('用法：generated-types-check.mjs prepare|verify-production|verify-development');
const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
const privateBase=path.join(os.homedir(),'.codex','creatoros-verification','t1119-generated-types');

function guardedFile(relative){
 const full=path.join(root,relative),parts=relative.split('/');
 let current=root;
 for(let i=0;i<parts.length;i++){
  current=path.join(current,parts[i]);const stat=fs.lstatSync(current);
  if(stat.isSymbolicLink()||(i<parts.length-1&&!stat.isDirectory())||(i===parts.length-1&&!stat.isFile())) throw new Error('派生路径不是闭集内的普通文件：'+relative);
 }
 if(fs.realpathSync(full)!==full) throw new Error('派生文件realpath发生漂移：'+relative);
 const bytes=fs.readFileSync(full),stat=fs.statSync(full);
 if(bytes.length===0) throw new Error('派生产物为空：'+relative);
 return {relative,full,bytes,hash:sha(bytes),size:bytes.length,ino:stat.ino,dev:stat.dev,mtimeMs:stat.mtimeMs};
}

function writerProbe(){
 const result=spawnSync('lsof',['-n','-a','-d','cwd','-Fpcn'],{encoding:'utf8',maxBuffer:16*1024*1024});
 if(result.error||![0,1].includes(result.status)||result.stderr.trim()) throw new Error('无法完整核对本树开发写者。');
 const records=[];let current;
 for(const line of result.stdout.split('\n')){
  if(line.startsWith('p')){if(current)records.push(current);current={pid:Number(line.slice(1))};}
  else if(current&&line.startsWith('c'))current.command=line.slice(1);
  else if(current&&line.startsWith('n'))current.cwd=line.slice(1);
 }
 if(current)records.push(current);
 const relevant=records.filter(r=>r.cwd===root||r.cwd===frontend||r.cwd?.startsWith(frontend+path.sep));
 const observed=[];
 for(const item of relevant){
  if(!Number.isInteger(item.pid)||item.pid<=0||!item.command) throw new Error('本树进程信息不完整。');
  let classification='other-process';
  // SEMANTIC_BOUNDARY_ALLOW: 只识别固定进程协议以保护派生文件，不做意图、内容或创作取舍。
  if(item.pid===process.pid)classification='this-check';
  else if(/^(node|next)/.test(item.command)){
   const ps=spawnSync('ps',['-ww','-p',String(item.pid),'-o','args='],{encoding:'utf8'});
   if(ps.error||ps.stderr.trim())throw new Error('无法核对本树Node进程。');
   if(ps.status===1&&ps.stdout.trim()==='')classification='exited';
   else if(ps.status!==0||!ps.stdout.trim())throw new Error('本树Node进程状态未知。');
   else if(/\bnext\s+dev\b|next-server/.test(ps.stdout))classification='next-dev';
   else if(/(?:^|\s)(?:\S*\/)?orchestrator\/process\/(?:reconcile|pmem|taskctl|reviewctl)\.mjs(?:\s|$)/.test(ps.stdout))classification='known-orchestrator';
   else classification='unknown-node';
  }
  // 不记录命令参数、环境或正文；未知Node按写者处理，不杀进程。
  observed.push({pid:item.pid,command:item.command,cwd:path.relative(root,item.cwd)||'.',classification});
 }
 if(observed.some(r=>['next-dev','unknown-node'].includes(r.classification))) throw new Error('本树存在开发写者或无法排除的Node进程，停止派生文件维护。');
 return {observedAt:new Date().toISOString(),processes:observed};
}

function ensurePrivateBase(){
 fs.mkdirSync(privateBase,{recursive:true,mode:0o700});
 if(fs.lstatSync(privateBase).isSymbolicLink()||fs.realpathSync(privateBase)!==privateBase)throw new Error('验收目录路径发生漂移。');
 fs.chmodSync(privateBase,0o700);
}

function writeNew(full,bytes){
 const fd=fs.openSync(full,'wx',0o600);
 try{fs.writeFileSync(fd,bytes);}finally{fs.closeSync(fd);}
 if((fs.statSync(full).mode&0o777)!==0o600||sha(fs.readFileSync(full))!==sha(bytes))throw new Error('原字节保存核对失败。');
}

function saveReceipt(dir,receipt){
 const bytes=Buffer.from(JSON.stringify(receipt,null,2)+'\n');
 fs.writeFileSync(path.join(dir,'receipt.json'),bytes,{mode:0o600});
}

function prepare(){
 const firstProbe=writerProbe();const files=devFiles.map(guardedFile);
 ensurePrivateBase();const dir=path.join(privateBase,new Date().toISOString().replace(/[:.]/g,'-')+'-'+randomUUID());
 fs.mkdirSync(dir,{mode:0o700});
 const receipt={schema:'generated-type-maintenance/v1',root,startedAt:new Date().toISOString(),firstProbe,files:files.map(f=>({relative:f.relative,sha256:f.hash,bytes:f.size,copy:path.basename(f.relative),deleted:false}))};
 for(const file of files)writeNew(path.join(dir,path.basename(file.relative)),file.bytes);
 saveReceipt(dir,receipt);
 const secondProbe=writerProbe();receipt.secondProbe=secondProbe;
 const checked=devFiles.map(guardedFile);
 for(let i=0;i<files.length;i++)if(checked[i].hash!==files[i].hash||checked[i].ino!==files[i].ino||checked[i].dev!==files[i].dev)throw new Error('移除前派生文件发生变化，停止。');
 try{
  for(let i=0;i<files.length;i++){
   const latest=guardedFile(devFiles[i]);
   if(latest.hash!==files[i].hash||latest.ino!==files[i].ino||latest.dev!==files[i].dev)throw new Error('移除时派生文件发生变化，停止。');
   fs.unlinkSync(latest.full);receipt.files[i].deleted=true;
  }
  receipt.finishedAt=new Date().toISOString();saveReceipt(dir,receipt);
 }catch(error){receipt.failure='派生文件维护未完整完成';saveReceipt(dir,receipt);throw error;}
 fs.writeFileSync(path.join(privateBase,'latest-prepare.json'),JSON.stringify({root,directory:dir,receiptSha256:sha(fs.readFileSync(path.join(dir,'receipt.json')))},null,2)+'\n',{mode:0o600});
 process.stdout.write(JSON.stringify({mode,evidence:dir,files:receipt.files,firstProbe,secondProbe},null,2)+'\n');
}

function verify(){
 const pointer=JSON.parse(fs.readFileSync(path.join(privateBase,'latest-prepare.json'),'utf8'));
 if(pointer.root!==root||path.dirname(pointer.directory)!==privateBase||fs.realpathSync(pointer.directory)!==pointer.directory)throw new Error('维护证据不属于当前工作树。');
 const receiptBytes=fs.readFileSync(path.join(pointer.directory,'receipt.json'));
 if(sha(receiptBytes)!==pointer.receiptSha256)throw new Error('维护收据字节发生变化。');
 const receipt=JSON.parse(receiptBytes);
 if(receipt.root!==root||!receipt.finishedAt||receipt.files?.length!==2||receipt.files.some((f,i)=>f.relative!==devFiles[i]||f.deleted!==true))throw new Error('两文件闭集维护没有完整完成。');
 const config=JSON.parse(fs.readFileSync(path.join(frontend,'tsconfig.json'),'utf8'));
 if(!config.include?.includes('.next/dev/types/**/*.ts')||!config.include?.includes('.next/types/**/*.ts'))throw new Error('原tsc生成类型消费路径缺失。');
 const targets=mode==='verify-production'?prodFiles:devFiles;
 const files=targets.map(guardedFile);
 if(files.some(f=>f.mtimeMs<Date.parse(receipt.finishedAt)))throw new Error('未观察到维护后真实消费者重新生成产物。');
 process.stdout.write(JSON.stringify({mode,observedAt:new Date().toISOString(),root,prepareEvidence:pointer.directory,tsconfigSha256:sha(fs.readFileSync(path.join(frontend,'tsconfig.json'))),files:files.map(f=>({relative:f.relative,sha256:f.hash,bytes:f.size,mtimeMs:f.mtimeMs})),scope:'只核实际产物及原include；必须另以原完整typecheck和浏览器退出码验收'},null,2)+'\n');
}

if(mode==='prepare')prepare();else verify();
