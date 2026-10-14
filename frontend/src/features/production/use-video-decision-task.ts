"use client";
import * as React from 'react';
import {useCreationClient,type CreationClient} from '@/lib/creation-workspace-scope';
import {client} from '@/lib/contract-client';
import {createAiTaskAttemptId} from '@/lib/ai-task-attempt';
import {taskRuntimeStatus} from '@/lib/ai-task-runtime';
import {pollDelay,decisionFailureDisplay,type WireAITask,type WireTaskResult} from './production-resource-operations';

export function videoDecisionRuntimeLabel(task:WireAITask){
 const status=taskRuntimeStatus(task);
 return ({succeeded:'原分场任务已完成',awaiting_confirmation:'分场候选等待采纳',partial:'原分场任务部分完成，请查看原任务',blocked:'原分场任务暂时受阻',waiting_user:'等待处理原分场任务',unknown_result:'原分场调用结果待核对，请勿重新生成',paused:'原分场任务已暂停',retry_wait:'原分场任务等待自动重试',pause_requested:'正在暂停原分场任务',cancel_requested:'正在取消原分场任务',failed:'原分场任务失败，可在原任务中重试',cancelled:'原分场任务已取消'} as Record<string,string>)[status]??'原分场任务正在执行';
}
export async function readVideoDecisionCandidate(taskId:string,clientPort:CreationClient=client){
 const results=await clientPort.listTaskResults({params:{taskId},query:undefined,body:undefined}) as unknown as WireTaskResult[];
 return [...results].reverse().find(row=>row.resultType==='video_decisions')?.resultData as {decisions?:unknown;inventory?:unknown}|undefined;
}
/** 旧任务迁移后只恢复原执行；未知调用不能通过新 attempt 获得第二次提交权。 */
export async function submitVideoDecisionTask(input:{retryOfTaskId?:string|null;inputData:Record<string,unknown>},clientPort:CreationClient=client):Promise<WireAITask>{
 if(input.retryOfTaskId){
  const original=await clientPort.getTask({params:{taskId:input.retryOfTaskId},query:undefined,body:undefined}) as unknown as WireAITask;
  if(original.executionTaskId){
   const status=taskRuntimeStatus(original),command=['paused','waiting_user'].includes(status)?'resume':status==='failed'?'retry':null;
   if(status==='unknown_result')throw new Error('原调用结果待核对，请保留原任务');
   if(command)await clientPort.commandExecutionTasks({params:undefined,query:undefined,body:{taskIds:[original.executionTaskId],command,idempotencyKey:createAiTaskAttemptId()}});
   else if(!['queued','running','retry_wait'].includes(status))throw new Error('请先查看原分场任务状态');
   return original;
  }
 }
 return await clientPort.createAITask({params:undefined,query:undefined,body:{taskType:'video.decisions',attemptId:createAiTaskAttemptId(),...(input.retryOfTaskId?{retryOfTaskId:input.retryOfTaskId}:{}),inputData:input.inputData}}) as unknown as WireAITask;
}
/** 观察同一候选任务；成功读取/legacy失败投影由页面承接，持续请求仅此一处。 */
export function useVideoDecisionTask({taskId,hasCandidate,pollEpoch,onCandidate,onRuntime,onLegacyFailure}:{taskId:string|null;hasCandidate:boolean;pollEpoch:number;onCandidate(id:string):Promise<boolean>;onRuntime(task:WireAITask):void;onLegacyFailure(id:string,summary:string,detail:string|null):void}){
 const client=useCreationClient();
 React.useEffect(()=>{
  if(!taskId||hasCandidate)return;
  let abandoned=false;
  void(async()=>{
   for(let attempt=0;;attempt++){
    try{
     const task=await client.getTask({params:{taskId},query:undefined,body:undefined}) as unknown as WireAITask;
     if(abandoned||task.id!==taskId)return;onRuntime(task);
     const runtime=taskRuntimeStatus(task);
     if(task.executionTaskId&&['paused','waiting_user','unknown_result','failed','cancelled','blocked'].includes(runtime))return;
     if(task.status==='awaiting_confirmation'||task.status==='succeeded'){if(await onCandidate(taskId))return;}
     if(!task.executionTaskId&&(task.status==='failed'||task.status==='cancelled')){
      let detail='';try{const steps=await client.listTaskSteps({params:{taskId},query:undefined,body:undefined}) as unknown as Array<{text:string}>;detail=steps.at(-1)?.text??'';}catch{/* 保留错误主信息。 */}
      if(abandoned)return;const failure=decisionFailureDisplay(detail);onLegacyFailure(taskId,failure.summary,failure.detail);return;
     }
    }catch{/* 短暂读取失败不创建新任务，下轮继续。 */}
    await new Promise(resolve=>setTimeout(resolve,pollDelay(attempt)));if(abandoned)return;
   }
  })();return()=>{abandoned=true;};
 },[taskId,hasCandidate,pollEpoch,onCandidate,onRuntime,onLegacyFailure]);
}
