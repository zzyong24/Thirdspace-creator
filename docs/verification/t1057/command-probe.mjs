// T-1057 有界协议取证：不请求模型、不读取真实 Codex 登录、不改生产实现。
import {createRequire} from 'node:module';
import {spawn} from 'node:child_process';
import {createInterface} from 'node:readline';
import {mkdtemp,mkdir,writeFile,readFile,realpath} from 'node:fs/promises';
import {dirname,join} from 'node:path';
import {tmpdir} from 'node:os';

const require=createRequire(new URL('../../../ai-worker/package.json',import.meta.url));
const main=require.resolve('@openai/codex/package.json');
const version=JSON.parse(await readFile(main,'utf8')).version;
if(version!=='0.159.3'||process.platform!=='darwin'||process.arch!=='arm64')throw new Error('PROBE_RUNTIME_MISMATCH');
const vendor=createRequire(main).resolve('@openai/codex-darwin-arm64/package.json');
const binary=await realpath(join(dirname(vendor),'vendor/aarch64-apple-darwin/bin/codex'));
const base=await mkdtemp(join(tmpdir(),'creatoros-t1057-command-'));
const workspace=join(base,'workspace'),fakeHome=join(base,'fake-home'),sentinel=join(base,'outside-sentinel');
await mkdir(workspace,{mode:0o700});await mkdir(fakeHome,{mode:0o700});
await mkdir(join(fakeHome,'.codex'),{mode:0o700});
await writeFile(sentinel,'T1057_NONSENSITIVE_DENIED_MARKER');
const script=join(workspace,'creative-script.sh');
await writeFile(script,'#!/bin/sh\nprintf T1057_SCRIPT_OK > "$1"\n',{mode:0o700});
const args=['app-server','--stdio','-c','web_search="disabled"'];
for(const feature of ['apps','plugins','hooks','multi_agent','multi_agent_v2','image_generation','browser_use','computer_use','code_mode','code_mode_host','tool_suggest','shell_tool','unified_exec','view_image','skill_search','skill_mcp_dependency_install'])args.push('-c',`features.${feature}=false`);
const child=spawn(binary,args,{cwd:workspace,env:{HOME:fakeHome,CODEX_HOME:join(fakeHome,'.codex'),PATH:process.env.PATH,LANG:'en_US.UTF-8'},shell:false,stdio:['pipe','pipe','pipe'],detached:true});
let diagnostics='';child.stderr.on('data',data=>{diagnostics=(diagnostics+data.toString()).slice(0,4096);});
let id=0;const pending=new Map();
child.on('error',error=>{for(const p of pending.values()){clearTimeout(p.timer);p.reject(error);}pending.clear();});
child.on('exit',code=>{for(const p of pending.values()){clearTimeout(p.timer);p.reject(new Error(`PROBE_PROCESS_EXIT_${code}`));}pending.clear();});
createInterface({input:child.stdout}).on('line',line=>{let f;try{f=JSON.parse(line);}catch{return;}const p=pending.get(f.id);if(!p||f.method)return;pending.delete(f.id);clearTimeout(p.timer);f.error?p.reject(new Error(JSON.stringify(f.error))):p.resolve(f.result);});
function rpc(method,params){return new Promise((resolve,reject)=>{const n=++id;const timer=setTimeout(()=>{pending.delete(n);reject(new Error('PROBE_RPC_TIMEOUT'));},15000);pending.set(n,{resolve,reject,timer});child.stdin.write(JSON.stringify({id:n,method,params})+'\n');});}
const policy={type:'workspaceWrite',writableRoots:[workspace],readOnlyAccess:{type:'restricted',includePlatformDefaults:true,readableRoots:[workspace]},networkAccess:false,excludeTmpdirEnvVar:true,excludeSlashTmp:true};
const result={runtimeVersion:version,platform:process.platform,architecture:process.arch,usesRealAuth:false,requestsModel:false,sandboxPolicy:policy,checks:[]};
try{
 await rpc('initialize',{clientInfo:{name:'creatoros-research',version:'1'},capabilities:{experimentalApi:true}});
 child.stdin.write(JSON.stringify({method:'initialized',params:{}})+'\n');
 const success=await rpc('command/exec',{command:['/bin/sh',script,join(workspace,'output.txt')],cwd:workspace,sandboxPolicy:policy,timeoutMs:5000,outputBytesCap:4096});
 result.checks.push({name:'script-in-workspace',exitCode:success.exitCode,output:await readFile(join(workspace,'output.txt'),'utf8'),stderr:success.stderr});
 const denied=await rpc('command/exec',{command:['/bin/cat',sentinel],cwd:workspace,sandboxPolicy:policy,timeoutMs:5000,outputBytesCap:4096});
 result.checks.push({name:'outside-read-denied',exitCode:denied.exitCode,sentinelExposed:denied.stdout.includes('T1057_NONSENSITIVE_DENIED_MARKER'),stderr:denied.stderr});
}catch(error){result.error=error.message;result.fakeHomeDiagnostics=diagnostics;}
finally{for(const p of pending.values()){clearTimeout(p.timer);p.reject(new Error('PROBE_CLOSED'));}pending.clear();try{process.kill(-child.pid,'SIGTERM');}catch{child.kill();}}
result.passed=result.checks.length===2&&result.checks[0].exitCode===0&&result.checks[0].output==='T1057_SCRIPT_OK'&&result.checks[1].exitCode!==0&&!result.checks[1].sentinelExposed;
await writeFile(new URL('./command-probe-result.json',import.meta.url),JSON.stringify(result,null,2)+'\n');
console.log(JSON.stringify({runtimeVersion:version,passed:result.passed,checks:result.checks.map(({name,exitCode,sentinelExposed})=>({name,exitCode,sentinelExposed})),error:result.error}));
process.exitCode=result.passed?0:1;
