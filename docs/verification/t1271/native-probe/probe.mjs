// T-1271 isolated native protocol observation; never starts a model turn.
import { spawn, execFile } from 'node:child_process';
import { createRequire } from 'node:module';
import { createInterface } from 'node:readline';
import { access, mkdtemp, mkdir, readFile, readdir, realpath, stat, writeFile } from 'node:fs/promises';
import { constants } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { createHash } from 'node:crypto';
import { promisify } from 'node:util';
const execFileAsync=promisify(execFile), repo=resolve(process.argv[2]||process.cwd());
const output=join(repo,'docs/verification/t1271/native-probe');
const evidence={startedAt:new Date().toISOString(),modelTurnsSent:0,credentialFilesReadOrCopied:0,steps:[],processes:[]};
const root=await mkdtemp(join(tmpdir(),'t1271-native-'));
const codexHome=join(root,'codex-home'),cwd=join(root,'workspace');
await mkdir(codexHome,{mode:0o700});await mkdir(cwd,{mode:0o700});
const env={HOME:process.env.HOME,PATH:process.env.PATH,CODEX_HOME:codexHome,LANG:process.env.LANG||'en_US.UTF-8'};
const req=createRequire(join(repo,'ai-worker/package.json')), main=req.resolve('@openai/codex/package.json');
const metadata=JSON.parse(await readFile(main,'utf8'));
if(metadata.version!=='0.159.3')throw Error('CODEX_VERSION_UNSUPPORTED');
const target=({darwin:{arm64:'aarch64-apple-darwin',x64:'x86_64-apple-darwin'},linux:{arm64:'aarch64-unknown-linux-musl',x64:'x86_64-unknown-linux-musl'},win32:{arm64:'aarch64-pc-windows-msvc',x64:'x86_64-pc-windows-msvc'}})[process.platform]?.[process.arch];
if(!target)throw Error('CODEX_PLATFORM_UNSUPPORTED');
const platformRequire=createRequire(main),packagePath=platformRequire.resolve(`@openai/codex-${process.platform}-${process.arch}/package.json`);
const binary=await realpath(join(dirname(packagePath),'vendor',target,'bin',process.platform==='win32'?'codex.exe':'codex'));
await access(binary,process.platform==='win32'?constants.F_OK:constants.X_OK);
const version=(await execFileAsync(binary,['--version'],{cwd,env,timeout:120000,maxBuffer:4096})).stdout.trim();
if(version!=='codex-cli 0.159.3')throw Error('CODEX_VERSION_UNSUPPORTED');
evidence.runtime={version,binary,sha256:createHash('sha256').update(await readFile(binary)).digest('hex')};
evidence.isolation={root,codexHome,cwd,homePreserved:true,envKeys:Object.keys(env),requestDeadlineMs:120000,outerDeadlineMs:1800000};
const disabled=['apps','plugins','hooks','multi_agent','multi_agent_v2','image_generation','browser_use','computer_use','code_mode','code_mode_host','tool_suggest','shell_tool','unified_exec','view_image','skill_search','skill_mcp_dependency_install'];
const args=['app-server','--stdio',...['web_search="disabled"',...disabled.map(x=>`features.${x}=false`),'features.omit_app_server_notification_media=false'].flatMap(x=>['-c',x])];
const instances=new Set();
function projection(value){
  if(!value||typeof value!=='object')return {type:typeof value};
  if(Array.isArray(value.data))return {ids:value.data.map(x=>x.id),nextCursor:value.nextCursor??null};
  if(value.thread)return {thread:{id:value.thread.id,ephemeral:value.thread.ephemeral??null,path:value.thread.path??null,turnCount:value.thread.turns?.length??null,status:value.thread.status?.type??null},approvalPolicy:value.approvalPolicy??null,sandbox:value.sandbox??null};
  return {responseKeys:Object.keys(value)};
}
class Rpc {
  constructor(label){this.label=label;this.pending=new Map();this.n=0;this.closed=false;this.exit=new Promise(resolveExit=>{this.resolveExit=resolveExit;});
    this.child=spawn(binary,args,{cwd,env,stdio:['pipe','pipe','pipe'],shell:false,detached:true});instances.add(this);
    this.record={label,pid:this.child.pid,exitCode:null,signal:null,stderrBytes:0};evidence.processes.push(this.record);
    this.child.stderr.on('data',x=>{this.record.stderrBytes+=x.length;});
    this.child.on('exit',(code,signal)=>{this.closed=true;this.record.exitCode=code;this.record.signal=signal;for(const p of this.pending.values()){clearTimeout(p.timer);p.reject(Error('PROCESS_EXITED'));}this.pending.clear();this.resolveExit();instances.delete(this);});
    this.child.on('error',()=>{for(const p of this.pending.values())p.reject(Error('PROCESS_ERROR'));});
    createInterface({input:this.child.stdout}).on('line',line=>{let f;try{f=JSON.parse(line);}catch{return;}
      if(f.id!==undefined&&!f.method){const p=this.pending.get(f.id);if(!p)return;this.pending.delete(f.id);clearTimeout(p.timer);if(f.error){const error={code:f.error.code,message:typeof f.error.message==='string'?f.error.message:null};evidence.steps.push({process:label,method:p.method,id:f.id,error});p.resolve({ok:false,error});}else{evidence.steps.push({process:label,method:p.method,id:f.id,result:projection(f.result)});p.resolve({ok:true,result:f.result});}}
      else if(f.method){evidence.steps.push({process:label,notification:f.method,threadId:f.params?.thread?.id??f.params?.threadId??null});if(f.id!==undefined)this.child.stdin.write(JSON.stringify({id:f.id,error:{code:-32601,message:'No model or tools in isolated probe'}})+'\n');}
    });
  }
  request(method,params){if(!['initialize','thread/start','thread/list','thread/read','thread/resume'].includes(method))throw Error('PROBE_METHOD_FORBIDDEN');const id=++this.n;return new Promise((resolve,reject)=>{const timer=setTimeout(()=>{this.pending.delete(id);reject(Error('RPC_TIMEOUT'));},120000);this.pending.set(id,{resolve,reject,timer,method});evidence.steps.push({process:this.label,request:method,id,params});this.child.stdin.write(JSON.stringify({id,method,params})+'\n');});}
  async initialize(){const r=await this.request('initialize',{clientInfo:{name:'creatoros_t1271_isolated_probe',version:'1'},capabilities:{experimentalApi:true}});if(!r.ok)throw Error('INITIALIZE_FAILED');this.child.stdin.write(JSON.stringify({method:'initialized',params:{}})+'\n');}
  async close(){if(this.closed)return;this.child.stdin.end();const grace=setTimeout(()=>{try{process.kill(-this.child.pid,'SIGTERM');}catch{}},5000);const hard=setTimeout(()=>{try{process.kill(-this.child.pid,'SIGKILL');}catch{}},10000);await this.exit;clearTimeout(grace);clearTimeout(hard);}
}
async function files(path){const rows=[];for(const x of await readdir(path,{withFileTypes:true})){const p=join(path,x.name);if(x.isDirectory())rows.push(...await files(p));else rows.push({name:relative(codexHome,p),bytes:(await stat(p)).size});}return rows;}
const listParams={limit:100,modelProviders:[],sourceKinds:['cli','vscode','exec','appServer','subAgent','subAgentReview','subAgentCompact','subAgentThreadSpawn','subAgentOther','unknown']};
const params=ephemeral=>({cwd,ephemeral,approvalPolicy:'never',sandbox:'read-only',environments:[],dynamicTools:[]});
const outer=setTimeout(()=>{for(const s of instances){try{process.kill(-s.child.pid,'SIGKILL');}catch{}}},1800000);
try{
  const first=new Rpc('first');await first.initialize();
  const ephemeral=await first.request('thread/start',params(true));if(!ephemeral.ok)throw Error('EPHEMERAL_START_FAILED');const ephemeralId=ephemeral.result.thread.id;
  const ephemeralRead=await first.request('thread/read',{threadId:ephemeralId,includeTurns:false});
  const afterEphemeral=await first.request('thread/list',listParams);evidence.filesAfterEphemeral=await files(codexHome);
  const persistent=await first.request('thread/start',params(false));if(!persistent.ok)throw Error('PERSISTENT_CONTROL_START_FAILED');const persistentId=persistent.result.thread.id;
  const persistentRead=await first.request('thread/read',{threadId:persistentId,includeTurns:false});
  const afterPersistent=await first.request('thread/list',listParams);await first.close();evidence.filesAfterFirstClose=await files(codexHome);
  const second=new Rpc('second');await second.initialize();
  const restartedList=await second.request('thread/list',listParams);
  const restartedEphemeralRead=await second.request('thread/read',{threadId:ephemeralId,includeTurns:false});
  const restartedEphemeralResume=await second.request('thread/resume',{threadId:ephemeralId,cwd,approvalPolicy:'never',sandbox:'read-only',excludeTurns:true});
  const restartedPersistentRead=await second.request('thread/read',{threadId:persistentId,includeTurns:false});
  await second.close();evidence.filesFinal=await files(codexHome);
  const included=(r,id)=>r.ok&&r.result.data.some(x=>x.id===id),rollouts=evidence.filesAfterEphemeral.filter(x=>/rollout.*\.jsonl$/.test(x.name));
  evidence.observations={ephemeralId,persistentId,ephemeralFlag:ephemeral.result.thread.ephemeral??null,ephemeralPath:ephemeral.result.thread.path??null,ephemeralReadableSameProcess:ephemeralRead.ok,ephemeralListedSameProcess:included(afterEphemeral,ephemeralId),ephemeralRolloutCount:rollouts.length,ephemeralListedAfterRestart:included(restartedList,ephemeralId),ephemeralReadableAfterRestart:restartedEphemeralRead.ok,ephemeralResumableAfterRestart:restartedEphemeralResume.ok,persistentReadableSameProcess:persistentRead.ok,persistentListedSameProcess:included(afterPersistent,persistentId),persistentListedAfterRestart:included(restartedList,persistentId),persistentReadableAfterRestart:restartedPersistentRead.ok};
  evidence.status=(!included(afterEphemeral,ephemeralId)&&rollouts.length===0&&!restartedEphemeralRead.ok&&!restartedEphemeralResume.ok)?'OBSERVED_EPHEMERAL_NO_TURN_BOUNDARY':'FAIL';
  evidence.limitations=['No model turn, user prompt, actual generated result or tool execution.','If the empty persistent control is also unlisted/nonrecoverable, this is not a differential proof of completed persistent-vs-ephemeral conversations.','No personal Codex Desktop UI or installed CreatorOS validation.','No claim that all non-session runtime state or metadata is absent.'];
}catch(error){evidence.status='FAIL';evidence.failure=error.message;}finally{for(const instance of [...instances])await instance.close();clearTimeout(outer);evidence.finishedAt=new Date().toISOString();await mkdir(output,{recursive:true});await writeFile(join(output,'result.json'),JSON.stringify(evidence,null,2)+'\n');console.log(JSON.stringify({status:evidence.status,observations:evidence.observations,processes:evidence.processes,result:join(output,'result.json')}));}
