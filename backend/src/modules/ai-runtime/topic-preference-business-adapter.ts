import {createHash} from "node:crypto";
import {z} from "zod";
import type {RequestContext} from "@creatoros/contract";
import type {AiService} from "../ai/ai.service";
import type {StructuredBusinessAdapter} from "./structured-business-execution.service";
export const topicPreferenceInputSchema=z.object({reasons:z.array(z.string().min(1)).min(1).max(50)}).strict();
export function createTopicPreferenceBusinessAdapter(deps:{listDropReasons(ctx:RequestContext):Promise<string[]>}):StructuredBusinessAdapter {
 return {skillId:"topic.preference",capability:"topic.preference",async prepare(ctx,task){
  const input=topicPreferenceInputSchema.parse(task.inputData);
  const current=(await deps.listDropReasons(ctx)).slice(0,50);
  if(JSON.stringify(current)!==JSON.stringify(input.reasons))throw new Error("淘汰原因已变化，等待最新偏好任务");
  return {dropReasons:input.reasons.map((reason,index)=>`${index+1}. ${reason}`).join("\n"),__topicPreference:JSON.stringify(input)};
 },project(){throw new Error("偏好须通过领域完成事务保存");}};
}
/** 相同真实原因快照只提交同一任务；唤醒失败仍保留可恢复的 queued 任务。 */
export function createTopicPreferenceSubmission(deps:{ai:Pick<AiService,"createTask">;listDropReasons(ctx:RequestContext):Promise<string[]>;prepare(ctx:RequestContext,taskId:string):Promise<unknown>;wake():void|Promise<void>}){
 return {async submit(context:RequestContext){
  const ctx={...context};if(!ctx.accountId&&!ctx.groupId)throw new Error("选题偏好需要账号");
  const reasons=(await deps.listDropReasons(ctx)).slice(0,50);if(!reasons.length)return null;
  const attemptId=`topic-pref:${createHash("sha256").update(JSON.stringify([ctx.userId,ctx.groupId??null,ctx.accountId??null,reasons])).digest("hex")}`;
  const task=await deps.ai.createTask(ctx,{taskType:"topic.preference",attemptId,inputData:{reasons}});
  if(["queued","running"].includes(task.status)){await deps.prepare(ctx,task.id);await deps.wake();}
  return task;
 }};
}
