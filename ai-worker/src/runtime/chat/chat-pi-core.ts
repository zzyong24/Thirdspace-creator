import { readdir, stat } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import type { AssistantMessage, AssistantMessageEventStream } from "@earendil-works/pi-ai";

interface PiTool {
  name:string; label:string; description:string; parameters:Record<string,unknown>;
  execute(id:string,args:unknown):Promise<{content:Array<{type:"text";text:string}>;details?:unknown}>;
}
export interface ChatPiAgent {
  prompt(text:string):Promise<void>;
  followUp(message:{role:"user";content:string;timestamp:number}):void;
  abort():void;
  subscribe(listener:(event:{type:string;message?:AssistantMessage})=>void):()=>void;
}
export type ChatPiAgentConstructor = new (options:{
  initialState:{systemPrompt:string;tools:PiTool[]};
  toolExecution:"sequential";
  streamFn:(...args:unknown[])=>AssistantMessageEventStream;
})=>ChatPiAgent;
let loaded:ChatPiAgentConstructor|undefined;
/** 加载 Pi 的无宿主工具核心：不扫描用户 Skill、扩展或本机文件。打包沿用 Pi 的真实依赖。 */
export async function loadChatPiAgent():Promise<ChatPiAgentConstructor>{
  if(loaded)return loaded;
  const name="@earendil-works/pi-agent-core",anchor="dist/agent.js";
  const isFile=async(file:string)=>stat(file).then(value=>value.isFile()).catch(()=>false);
  for(const root of [path.join(process.cwd(),"node_modules"),path.resolve(process.cwd(),"..","node_modules")]){
    const candidates=[path.join(root,name,anchor)];
    const store=path.join(root,".pnpm");
    for(const entry of await readdir(store).catch(()=>[] as string[]))if(entry.startsWith("@earendil-works+pi-agent-core@"))candidates.push(path.join(store,entry,"node_modules",name,anchor));
    for(const file of candidates)if(await isFile(file)){
      const module=await import(/* webpackIgnore: true */ pathToFileURL(file).href);
      if(typeof module.Agent!=="function")throw Error("CHAT_PI_CORE_INVALID");
      loaded=module.Agent as ChatPiAgentConstructor;return loaded;
    }
  }
  throw Error("CHAT_PI_CORE_UNAVAILABLE");
}
