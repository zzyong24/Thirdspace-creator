import {randomUUID} from 'node:crypto';
import type {Db} from '@creatoros/backend';
import type {RequestContext} from '@creatoros/contract';
import {createChatTurnSubmissionService,type ChatTurnAssembly,type ChatTurnSnapshot,type ChatPrepareOptions} from '../ai/chat-turn-submission.service';
import {createChatWorkerDispatcher,type ChatWorkerDispatcherDeps} from '../execution/model-worker-dispatcher';
import {createExecutionStreamService,subscribeExecutionStream} from '../execution/execution-stream.service';
import {createPersistentTaskService} from '../execution/persistent-task.service';

/** 正式 HTTP 入口只提交与订阅；模型、工具和消息完成均由原持久执行路径负责。 */
export function createChatProductionRuntime(db:Db,deps:ChatWorkerDispatcherDeps & {
 assertProject(context:RequestContext,projectId:string):Promise<unknown>;
}){
 let stopped=false;
 const worker=createChatWorkerDispatcher(db,deps),events=createExecutionStreamService(db),tasks=createPersistentTaskService(db);
 return {
  async submit(ctx:RequestContext,input:{conversationId:string;sourceMessageId:string;executionEngine?:"pi"|"codex"},assemble:(ctx:RequestContext,snapshot:ChatTurnSnapshot,options:ChatPrepareOptions)=>Promise<ChatTurnAssembly>){
   if(stopped)throw new Error("应用正在停止，无法启动新聊天");
   const result=await createChatTurnSubmissionService(db,{assemble,assertProject:deps.assertProject}).submit(ctx,input);
   if(!stopped)worker.start();return result;
  },
  subscribe(ctx:RequestContext,id:string,signal:AbortSignal){return subscribeExecutionStream(events,ctx,id,{signal});},
  get:(ctx:RequestContext,id:string)=>tasks.get(ctx,id),
  async command(ctx:RequestContext,id:string,command:'cancel'|'resume'|'retry'){
   const result=await tasks.command(ctx,{taskIds:[id],command,idempotencyKey:`chat:${id}:${command}:${randomUUID()}`});
   if(command!=='cancel' && !stopped)worker.start();return result;
  },
  start:()=>{if(!stopped)worker.start();},stop:()=>{stopped=true;return worker.stop();},
 };
}
export {createChatHostContextReader} from '../ai/chat-host-context.service';
export {loadPositioningWorksBrief} from './creative-context';
