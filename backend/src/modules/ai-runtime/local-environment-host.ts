import {execFile} from "node:child_process";
import {promisify} from "node:util";
import type {RequestContext} from "@creatoros/contract";
import type {resolveExecutablePath} from "@creatoros/ai-worker";
import type {DetectToolsResult} from "./local-env-probe";
import {resolveToolsToProbe,parseToolVersion} from "./local-env-probe";
const run=promisify(execFile);
/** 本机适配只执行已审核的版本参数；宿主注入路径解析，任务取消传给实际子进程。 */
export function createLocalEnvironmentHost(resolvePath:typeof resolveExecutablePath){
 return async(_context:RequestContext,input:{tools?:string[];signal?:AbortSignal}):Promise<DetectToolsResult>=>{
  input.signal?.throwIfAborted();const {probe,rejected}=resolveToolsToProbe(input.tools);
  const tools=await Promise.all(probe.map(async spec=>{
   input.signal?.throwIfAborted();let path:string|null=null,version:string|null=null;
   try{path=resolvePath(spec.name,{explicitEnvVar:spec.name==="ffmpeg"?"CREATOROS_FFMPEG_PATH":spec.name==="ffprobe"?"CREATOROS_FFPROBE_PATH":undefined,bundled:spec.name==="ffmpeg"||spec.name==="ffprobe",preferredPaths:spec.name==="node"?[process.execPath]:undefined});}catch{/* 路径不可解析时如实报告未安装。 */}
   input.signal?.throwIfAborted();
   if(path){try{const {stdout,stderr}=await run(path,[...spec.versionArgs],{timeout:3000,windowsHide:true,signal:input.signal});version=parseToolVersion(stdout||stderr);}catch{input.signal?.throwIfAborted();/* 版本不可读仍保留已经确认的安装路径。 */}}
   input.signal?.throwIfAborted();return {name:spec.name,installed:Boolean(path),path,version,purpose:spec.purpose,installHint:path?null:spec.installHint};
  }));
  input.signal?.throwIfAborted();return {tools,rejected};
 };
}
