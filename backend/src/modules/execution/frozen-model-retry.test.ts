import {expect,it} from "vitest";
import {createDb} from "@creatoros/backend";
import type {RequestContext} from "@creatoros/contract";
import {createPersistentTaskService} from "./persistent-task.service";
import {createFrozenModelRetryPort} from "./frozen-model-retry";
const ctx:RequestContext={userId:"retry-user",accountId:"retry-account",requestId:"r",source:"user"};
it("各文字owner恢复原执行，第二次失败后原请求仍不重排、不增加预算",async()=>{
 const opened=await createDb();let seq=0;
 const execution=createPersistentTaskService(opened.db,{nextId:p=>`${p}-${++seq}`,now:()=>"2026-10-02T00:00:00Z"});
 try{for(const taskType of ["wechat.article-draft","wechat.article-text","graphic.post-text","script.draft"]){
  const aiId=`original-${taskType}`,task=await execution.enqueue(ctx,{kind:"ai_task",ownerType:"ai_task",ownerId:aiId,idempotencyKey:aiId,payload:{modelInput:{kind:"model.structured",input:{frozen:true}}},maxAttempts:2});
  const claim=await execution.claimNext({workerId:"worker"});if(!claim)throw Error("原执行未领取");
  await execution.finish({taskId:task.id,workerId:"worker",attempt:claim.task.attempt,status:"failed",errorCode:"MODEL_ERROR",errorMessage:"失败"});
  const resume=createFrozenModelRetryPort({readTask:async(c,id)=>{if(c.accountId!==ctx.accountId)throw Error("越权");return {id,taskType,executionTaskId:task.id};},execution,wake:()=>{}});
  expect(await resume(ctx,{taskId:aiId,taskType,clientRequestId:"original-request"})).toEqual({id:aiId});
  const second=await execution.claimNext({workerId:"worker"});if(!second)throw Error("恢复执行未领取");
  await execution.finish({taskId:task.id,workerId:"worker",attempt:second.task.attempt,status:"failed",errorCode:"MODEL_ERROR",errorMessage:"又失败"});
  expect(await resume(ctx,{taskId:aiId,taskType,clientRequestId:"original-request"})).toEqual({id:aiId});
  expect((await execution.get(ctx,task.id)).status).toBe("failed");expect((await execution.get(ctx,task.id)).attempt).toBe(2);
  await expect(resume(ctx,{taskId:aiId,taskType:"wrong",clientRequestId:"new-request"})).rejects.toThrow();
  await expect(resume({...ctx,accountId:"other"},{taskId:aiId,taskType,clientRequestId:"original-request"})).rejects.toThrow();
 }}finally{await opened.client.close();}
},20000);
