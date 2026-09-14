import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {randomUUID} from 'node:crypto';
import path from 'node:path';
import {realpath} from 'node:fs/promises';

export interface HostProcessRecord {pid:number;ppid?:number;started:string;executable:string;command:string|null}
export interface HostProcessRecovery {
 createHostInstanceId():Promise<string>;
 isPreviousHostStopped(input:{hostInstanceId:string;authDir:string}):Promise<{stopped:boolean;reason:string}>;
}
const run=promisify(execFile);
// 同进程多次装配/HMR仍记得已发出的宿主身份，不能把尚未启动Chrome的活owner当旧租约。
const identityRegistryKey=Symbol.for('creatoros.browser-host-identities.v1');
const identityGlobals=globalThis as typeof globalThis & {[identityRegistryKey]?:Set<string>};
const currentProcessHostIds=identityGlobals[identityRegistryKey]??=new Set<string>();
/** 只读OS证据；查询失败绝不能解释为没有进程。脚本不拼接任何用户路径或凭据。 */
export async function readHostProcessSnapshot(platform:NodeJS.Platform=process.platform):Promise<HostProcessRecord[]>{
 const opts={timeout:5000,maxBuffer:16*1024*1024,windowsHide:true,env:{...process.env,LC_ALL:platform==='darwin'?'en_US.UTF-8':'C.UTF-8'}};
 if(platform==='win32'){
  const script='[Console]::OutputEncoding=[System.Text.UTF8Encoding]::new($false); $OutputEncoding=[Console]::OutputEncoding; $ErrorActionPreference="Stop"; @(Get-CimInstance Win32_Process | Select-Object ProcessId,ParentProcessId,CreationDate,ExecutablePath,CommandLine,Name) | ConvertTo-Json -Compress';
  const {stdout}=await run('powershell.exe',['-NoProfile','-NonInteractive','-Command',script],opts);
  const decoded:unknown=JSON.parse(stdout.replace(/^\uFEFF/,''));
  if(!Array.isArray(decoded)||!decoded.length)throw Error('process-snapshot-invalid');
  return decoded.map(value=>{
   if(!value||typeof value!=='object')throw Error('process-snapshot-invalid');
   const r=value as Record<string,unknown>;
   if(typeof r.ProcessId!=='number'||typeof r.Name!=='string')throw Error('process-snapshot-invalid');
   return {pid:r.ProcessId,ppid:typeof r.ParentProcessId==='number'?r.ParentProcessId:undefined,started:typeof r.CreationDate==='string'?r.CreationDate:'',executable:typeof r.ExecutablePath==='string'?r.ExecutablePath:r.Name,command:typeof r.CommandLine==='string'?r.CommandLine:null};
  });
 }
 if(platform!=='darwin'&&platform!=='linux')throw Error('process-platform-unsupported');
 const first=await run('/bin/ps',['-axo','pid=,ppid=,lstart=,comm='],opts);
 const second=await run('/bin/ps',['-axo','pid=,args='],opts);
 const commands=new Map<number,string>();
 for(const line of second.stdout.split('\n').filter(x=>x.trim())){
  const m=line.trim().match(/^(\d+)\s+(.+)$/);if(!m)throw Error('process-snapshot-invalid');commands.set(Number(m[1]),m[2]!);
 }
 const rows:HostProcessRecord[]=[];
 for(const line of first.stdout.split('\n').filter(x=>x.trim())){
  const m=line.trim().match(/^(\d+)\s+(\d+)\s+(\S+\s+\S+\s+\d+\s+\S+\s+\d+)\s+(.+)$/);
  if(!m)throw Error('process-snapshot-invalid');
  const pid=Number(m[1]);
  // 两次快照之间消失的进程仍保留为命令行不可读；不能静默漏掉可能的宿主。
  rows.push({pid,ppid:Number(m[2]),started:m[3]!,executable:m[4]!,command:commands.get(pid)??null});
 }
 if(!rows.length)throw Error('process-snapshot-invalid');return rows;
}
const officialHost=(r:HostProcessRecord)=>/(?:^|[\\/])creatoros-server(?:\.exe)?$/i.test(r.executable);
function belongsToCurrentHost(row:HostProcessRecord,rows:HostProcessRecord[],pid:number):boolean{
 const visited=new Set<number>();let parent=row.ppid;
 while(parent&& !visited.has(parent)){if(parent===pid)return true;visited.add(parent);parent=rows.find(r=>r.pid===parent)?.ppid;}
 return false;
}
const browser=(r:HostProcessRecord)=>/(?:chrome|chromium|msedge)/i.test(r.executable);
const possibleHost=(r:HostProcessRecord)=>officialHost(r)||/next-server/i.test(r.executable)||(/(?:^|[\\/])(?:node|bun|deno)(?:\.exe)?$/i.test(r.executable)&&(!r.command||/(?:server\.[cm]?js|next-server|next[\\/]|next\s+(?:start|dev))/i.test(r.command)));
function profileArgument(command:string):string|null{
 const match=command.match(/(?:^|\s)--user-data-dir(?:=|\s+)(?:"([^"]+)"|'([^']+)'|(.+?))(?=\s+--[\w-]+(?:=|\s|$)|$)/);
 if(!match||(command.match(/(?:^|\s)--user-data-dir(?:=|\s)/g)?.length??0)!==1)return null;
 const value=(match[1]??match[2]??match[3]??'').trim();
 // ps不会替空格路径加引号：无后继flag的未加引号多词参数边界不确定；编码损失也不能当不同目录。
 if(/[?\uFFFD\x00-\x1f]/.test(value)||(!match[1]&&!match[2]&&/\s/.test(value)&&!command.slice((match.index??0)+match[0].length).trimStart().startsWith('--')))return null;
 return value;
}
/** 仅正式桌面宿主启用。旧UUID没有PID，因此必须排除所有其他可能的正式宿主与目标档案浏览器。
 * SEMANTIC_BOUNDARY_ALLOW: OS进程/完整路径/启动身份比较只确认资源占用，不作内容或创作选择。
 * 不杀进程，不删除Singleton文件，不以租约年龄作为停止证据。
 */
export function createDesktopHostProcessRecovery(deps:{pid?:number;platform?:NodeJS.Platform;desktop?:boolean;snapshot?:()=>Promise<HostProcessRecord[]>}={}):HostProcessRecovery{
 const pid=deps.pid??process.pid,platform=deps.platform??process.platform,desktop=deps.desktop??process.env.CREATOROS_DESKTOP==='1';
 const snapshot=deps.snapshot??(()=>readHostProcessSnapshot(platform));
 const normalize=(value:string)=>platform==='win32'?path.win32.resolve(value).toLowerCase():path.posix.resolve(value);
 const canonicalProfile=async(value:string)=>{try{return normalize(await realpath(value));}catch(error){if((error as NodeJS.ErrnoException).code==='ENOENT')return normalize(value);throw error;}};
 const selfFrom=(rows:HostProcessRecord[])=>{const self=rows.find(r=>r.pid===pid);if(!desktop||!self||!officialHost(self)||!self.started)throw Error('desktop-host-unverified');return self;};
 return {
  async createHostInstanceId(){
   let id:string;
   try{const self=selfFrom(await snapshot());id=`host-v1:${pid}:${Buffer.from(self.started).toString('base64url')}:${randomUUID()}`;}
   catch{id=randomUUID();}
   currentProcessHostIds.add(`${pid}:${id}`);return id; // 仍允许正常采集；缺少证据只关闭跨启动自动恢复。
  },
  async isPreviousHostStopped({hostInstanceId,authDir}){
   if(currentProcessHostIds.has(`${pid}:${hostInstanceId}`))return {stopped:false,reason:'current-process-owner'};
   try{
    const rows=await snapshot();selfFrom(rows);
    const encoded=hostInstanceId.match(/^host-v1:(\d+):([A-Za-z0-9_-]+):[a-f0-9-]+$/);
    if(hostInstanceId.startsWith('host-v1:')&&!encoded)return {stopped:false,reason:'host-identity-invalid'};
    if(encoded){
     const old=rows.find(r=>r.pid===Number(encoded[1]));
     if(old&&(!old.started||old.started===Buffer.from(encoded[2]!,'base64url').toString()))return {stopped:false,reason:'previous-host-running'};
    }
    for(const row of rows){
     if(row.pid===pid)continue;
     // 同一旧宿主仍可能尚未启动浏览器；不能只查Chrome就夺租约。
     if(possibleHost(row)&&!belongsToCurrentHost(row,rows,pid))return {stopped:false,reason:'another-host-running'};
     if(!browser(row))continue;
     if(!row.command)return {stopped:false,reason:'browser-command-unavailable'};
     const profile=profileArgument(row.command);
     if(row.command.includes('--user-data-dir')&&!profile)return {stopped:false,reason:'browser-profile-unverified'};
     if(profile&&await canonicalProfile(profile)===await canonicalProfile(authDir))return {stopped:false,reason:'profile-browser-running'};
    }
    return {stopped:true,reason:encoded?'previous-host-stopped-profile-unused':'legacy-desktop-host-stopped-profile-unused'};
   }catch{return {stopped:false,reason:'process-evidence-unavailable'};}
  },
 };
}
