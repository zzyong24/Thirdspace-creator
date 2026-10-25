import { Agent } from "@earendil-works/pi-agent-core";
import type { AssistantMessage, AssistantMessageEventStream } from "@earendil-works/pi-ai";
import type { PiResultContent } from "../../capabilities/result-pages";

interface PiTool {
  name:string; label:string; description:string; parameters:Record<string,unknown>;
  execute(id:string,args:unknown):Promise<{content:PiResultContent[];details?:unknown}>;
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
/**
 * 直接声明并打包 Pi 的无宿主工具核心，不在用户机器扫描 node_modules。
 * Windows 分层安装包没有开发机的 pnpm 布局；静态导入让同一 Agent 随 Worker 交付，
 * 不加载 coding-agent 的宿主工具、Skill 或扩展。
 */
export async function loadChatPiAgent():Promise<ChatPiAgentConstructor>{
  return Agent as unknown as ChatPiAgentConstructor;
}
