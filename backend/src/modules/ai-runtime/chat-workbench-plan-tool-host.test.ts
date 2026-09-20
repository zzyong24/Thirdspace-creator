import {afterAll, beforeAll, expect, it} from "vitest";
import {createDb, type Db} from "@creatoros/backend";
import {createPersistentTaskService} from "../execution/persistent-task.service";
import {createWorkbenchPlanService} from "../execution/workbench-plan.service";
import {createChatWorkbenchPlanToolHost} from "./chat-workbench-plan-tool-host";
import {chatWorkbenchPlanCapability} from "./chat-workbench-plan-tool";
import {defineWorkbenchChatTool} from "./chat-tool-gate";
import {prepareChatToolDefinitions} from "./chat-tool-definitions";

let db:Db, close:()=>Promise<void>;
beforeAll(async()=>{const opened=await createDb();db=opened.db;close=()=>opened.client.close();});
afterAll(async()=>close?.());

it("计划工具使用冻结版本与原租约，模型不能凭文本伪造完成",async()=>{
  const owner={userId:"plan-host-user",accountId:"plan-host-account",requestId:"test",source:"user" as const};
  const tasks=createPersistentTaskService(db);
  const task=await tasks.enqueue(owner,{kind:"ai_task",ownerType:"ai_task",ownerId:"plan-host",idempotencyKey:"plan-host",payload:{modelInput:{kind:"chat.run"}}});
  const claim=await tasks.claimTask({taskId:task.id,workerId:"plan-host"});
  if(!claim)throw new Error("claim missing");
  const ref={executionTaskId:task.id,attempt:claim.lease.attempt,fenceToken:claim.lease.fenceToken};
  const prototype=defineWorkbenchChatTool(chatWorkbenchPlanCapability,async()=>{throw new Error("unused");});
  const prepared=await prepareChatToolDefinitions({"plan.update":prototype},{workbenchCapabilities:[chatWorkbenchPlanCapability]});
  const input={tools:prepared.definitions} as never;
  const host=createChatWorkbenchPlanToolHost(db);
  const result=await host(owner,input,ref,new AbortController().signal);
  const tool=result["plan.update"]!;
  const step={stepId:"read",title:"读取资料",dependsOn:[],status:"pending",operationRefs:[],artifactRefs:[]};
  const scope={execution:ref,aiTaskId:"plan-host",callId:"plan-call",toolCallId:"tc",signal:new AbortController().signal};
  expect(await tool.execute!(owner,{expectedRevision:0,steps:[step]},scope)).toMatchObject({status:"ok",sideEffect:"committed"});
  expect(await createWorkbenchPlanService(db).read(owner,task.id)).toMatchObject({planRevision:1,steps:[step]});
  await expect(tool.execute!(owner,{expectedRevision:1,steps:[{...step,status:"succeeded",operationRefs:["invented"]}]},scope)).rejects.toThrow();
  await expect(host(owner,{tools:[{...prepared.definitions[0],version:"wrong"}]} as never,ref,new AbortController().signal)).rejects.toThrow();
  await tasks.command(owner,{taskIds:[task.id],command:"pause",idempotencyKey:"pause"});
  await expect(tool.execute!(owner,{expectedRevision:1,steps:[step]},scope)).rejects.toThrow();
});
