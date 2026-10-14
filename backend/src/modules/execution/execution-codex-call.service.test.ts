import {beforeAll,afterAll,it,expect} from 'vitest';
import {createDb,type Db} from '@creatoros/backend';
import {createExecutionRoute} from '@creatoros/contract/execution-worker';
import {createPersistentTaskService} from './persistent-task.service';
import {createExecutionCallLedgerService} from './execution-call-ledger.service';
import {createExecutionCodexCallService} from './execution-codex-call.service';
let db:Db,close:()=>Promise<void>,seq=0;
beforeAll(async()=>{const c=await createDb();db=c.db;close=()=>c.client.close();});afterAll(async()=>close?.());
async function fixture(engine:'pi'|'codex'='codex'){
 const id=`codex-bind-${++seq}`,ctx={userId:id,accountId:id,requestId:id,source:'user' as const},now=()=> '2026-10-11T00:00:00.000Z';
 const tasks=createPersistentTaskService(db,{now}),task=await tasks.enqueue(ctx,{kind:'ai_task',ownerType:'ai_task',ownerId:id,idempotencyKey:id,payload:{executionRoute:createExecutionRoute(engine)}});
 const claim=(await tasks.claimTask({taskId:task.id,workerId:'worker'}))!;
 const ref={executionTaskId:task.id,attempt:claim.lease.attempt,fenceToken:claim.lease.fenceToken};
 const ledger=createExecutionCallLedgerService(db,{now,budget:{maxCalls:3,maxTokens:100000,deadlineMs:180000}}),row=await ledger.reserve(ref,{kind:'model',operationKey:'original',inputDigest:'sha256:'+'a'.repeat(64),reservedTokens:100});await ledger.start(ref,row.id);
 const service=createExecutionCodexCallService(db,{now});return{ref,ledger,callId:row.id,bind:(data:object)=>service.invoke(ref,'bindCodexCall',{callId:row.id,...data}),read:()=>service.invoke(ref,'readCodexCall',{callId:row.id}),service};
}
it('只绑定同原call、不可替换thread或turn，拒绝Pi和错误fence',async()=>{
 const f=await fixture();await f.bind({threadId:'thread-original'});await f.bind({turnId:'turn-original'});
 await expect(f.bind({threadId:'other'})).rejects.toThrow();await expect(f.bind({turnId:'other'})).rejects.toThrow();
 await expect(f.service.invoke({...f.ref,fenceToken:'stale'},'bindCodexCall',{callId:f.callId,threadId:'thread-original'})).rejects.toThrow();
 const p=await fixture('pi');await expect(p.bind({threadId:'thread'})).rejects.toThrow();
});
it('实际用量部分通知合并，未知结果仍保留原耗用，不倒退或伪造0',async()=>{
 const f=await fixture();await f.bind({threadId:'t',turnId:'u'});await f.bind({observedUsage:{inputTokens:10,totalTokens:12}});await f.bind({observedUsage:{outputTokens:2}});
 expect(await f.read()).toMatchObject({observedUsage:{inputTokens:10,outputTokens:2,totalTokens:12}});
 await expect(f.bind({observedUsage:{totalTokens:1}})).rejects.toThrow();await f.ledger.settle(f.ref,f.callId,{status:'unknown'});
 expect((await f.ledger.inspect(f.ref)).calls[0]).toMatchObject({status:'unknown',usage:{inputTokens:10,outputTokens:2,totalTokens:12},totalTokens:12});
 await f.ledger.settle(f.ref,f.callId,{status:'settled',usage:{inputTokens:11,outputTokens:3,totalTokens:14},resultText:'原结果'});
 expect((await f.ledger.inspect(f.ref)).calls[0]).toMatchObject({status:'settled',totalTokens:14});
 await expect(f.bind({observedUsage:{totalTokens:15}})).rejects.toThrow();
});

it('真实用量超原任务预算先持久费用再回报打断，不伪造0或续期',async()=>{
 const f=await fixture();await f.bind({threadId:'budget-thread',turnId:'budget-turn'});
 const response=await f.bind({observedUsage:{inputTokens:100001,outputTokens:1,totalTokens:100002}});
 expect(response).toMatchObject({budgetExceeded:true});
 expect((await f.ledger.inspect(f.ref)).calls[0]).toMatchObject({status:'started',totalTokens:100002});
 await f.ledger.settle(f.ref,f.callId,{status:'unknown'});
 expect((await f.ledger.inspect(f.ref)).calls[0]).toMatchObject({status:'unknown',totalTokens:100002});
});
