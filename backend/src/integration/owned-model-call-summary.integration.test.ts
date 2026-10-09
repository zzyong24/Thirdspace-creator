import {beforeAll,afterAll,expect,it} from 'vitest';
import {createDb,type Db,and,eq,aiTasks,aiConversations,aiMessages,aiTaskResults,executionTasks,executionCalls,platformAccounts} from '@creatoros/backend';
import {ENDPOINTS,getCliOperationPolicy,type RequestContext} from '@creatoros/contract';
import {accountGroups,accountGroupMemberships} from '../schema/account-groups';
import {createChatTurnSubmissionService} from '../modules/ai/chat-turn-submission.service';
import {createCliInvocationService} from '../modules/cli-invocations/cli-invocations.service';
import {createWorkbenchPublicService} from '../modules/execution/workbench-public.service';
import {createWorkbenchPublicTransport} from '../modules/execution/workbench-public.transport';
import {createExecutionStreamService} from '../modules/execution/execution-stream.service';

let db:Db,close:()=>Promise<void>,sequence=0;
const now=()=> '2026-10-09T00:00:00.000Z',nextId=(prefix:string)=>`${prefix}-summary-${++sequence}`;
const receipt={content:[{type:'tool-call',toolCallId:'observed',toolName:'write',input:'{"article":{}}'}],stream:{schemaVersion:1,parts:[{type:'tool-input-start',id:'observed',toolName:'write'},{type:'tool-input-delta',id:'observed',delta:'{"article":{},"graphic":'},{type:'tool-input-end',id:'observed'}]},finishReason:{unified:'tool-calls'},usage:{inputTokens:{total:1},outputTokens:{total:1}},warnings:[]};
beforeAll(async()=>{const opened=await createDb();db=opened.db;close=()=>opened.client.close();},120000);
afterAll(async()=>close?.(),120000);
async function snapshot(){return {tasks:await db.select().from(executionTasks),calls:await db.select().from(executionCalls),ai:await db.select().from(aiTasks),conversations:await db.select().from(aiConversations),messages:await db.select().from(aiMessages),results:await db.select().from(aiTaskResults)};}
async function fixture(mode:'group'|'legacy'|'canonical'='group'){
 const userId=nextId('owner'),accountId=mode==='group'?null:nextId('account');
 const groupId=mode==='group'?nextId('group'):mode==='canonical'?`grp_legacy_${accountId}`:null;
 if(groupId)await db.insert(accountGroups).values({id:groupId,userId,name:'诊断组',status:'active',createdAt:now(),updatedAt:now()});
 if(accountId)await db.insert(platformAccounts).values({id:accountId,userId,platform:'douyin',accountHandle:'@isolated-summary',status:'active',createdAt:now(),updatedAt:now()});
 if(accountId&&groupId)await db.insert(accountGroupMemberships).values({id:nextId('member'),userId,groupId,accountId,joinedAt:now()});
 const ctx:RequestContext={userId,accountId,groupId,requestId:nextId('request'),source:'user'};
 const conversationId=nextId('conversation'),sourceMessageId=nextId('message');
 await db.insert(aiConversations).values({id:conversationId,userId,accountId,groupId,title:'中性只读诊断',createdAt:now(),updatedAt:now()});
 await db.insert(aiMessages).values({id:sourceMessageId,conversationId,role:'user',content:'CANARY_SOURCE_TEXT',createdAt:now()});
 const submitted=await createChatTurnSubmissionService(db,{now,nextId,assemble:async()=>({capability:'copilot.assist',system:'CANARY_SYSTEM_TEXT',messages:[{role:'user',content:'中性诊断'}],tools:[],maxSteps:8,maxOutputTokens:128})}).submit(ctx,{conversationId,sourceMessageId});
 await db.insert(executionCalls).values({id:nextId('model'),executionTaskId:submitted.executionTaskId,sequence:1,operationKey:'original-model-1',kind:'model',inputDigest:'a'.repeat(64),status:'settled',reservedTokens:0,totalTokens:2,providerResult:receipt,createdAt:now(),updatedAt:now()});
 const gateway=createCliInvocationService({db,masterKey:Buffer.alloc(32,8),now,nextId});
 const transport=createWorkbenchPublicTransport({tasks:createWorkbenchPublicService(db),stream:createExecutionStreamService(db),artifacts:{} as Parameters<typeof createWorkbenchPublicTransport>[0]['artifacts'],capabilities:()=>({platform:'macos',capabilities:[],builtins:[],dependencyLock:{}}),render:async()=>{throw Error('不得渲染');},reconcile:async()=>{throw Error('不得对账');}});
 async function read(context=ctx,query={afterSequence:0,limit:5}){
  const endpoint=ENDPOINTS.readWorkbenchModelCallSummary;
  expect(endpoint).toBeDefined();
  const admitted=await gateway.begin(context,{operation:endpoint.id,effect:getCliOperationPolicy(endpoint.id)!.effect,clientId:'isolated-summary-cli',idempotencyKey:null,inputHash:'sha256:summary-read',targetRefs:[]});
  if(admitted.kind!=='execute')throw Error('预期原只读审计');
  const response=await transport.request(endpoint,{params:{taskId:submitted.executionTaskId},query,body:undefined},context);
  await gateway.succeed(admitted.invocationId,response);
  return ENDPOINTS.readWorkbenchModelCallSummary.response.parse((response as {data:unknown}).data);
 }
 return {ctx,submitted,conversationId,sourceMessageId,read,transport};
}
it.each(['group','legacy','canonical'] as const)('正式gateway/transport %s原任务读取摘要，业务账本逐字不变',async mode=>{
 const f=await fixture(mode),before=await snapshot(),result=await f.read();
 expect(result).toMatchObject({taskId:f.submitted.executionTaskId,aiTaskId:f.submitted.taskId,conversationId:f.conversationId,sourceMessageId:f.sourceMessageId,hasMore:false,calls:[{sequence:1,receiptState:'valid',tools:[{streamStrictObject:false,finalStrictObject:true,observedConsistency:'unavailable',reason:'stream_not_object'}]}]});
 expect(await snapshot()).toEqual(before);expect(JSON.stringify(result)).not.toContain('CANARY');expect(JSON.stringify(result)).not.toContain('graphic');expect(JSON.stringify(result)).not.toContain('article');
});
it('真实归档组保留历史读取，不因归档取得新执行权',async()=>{
 const f=await fixture();await db.update(accountGroups).set({status:'archived'}).where(eq(accountGroups.id,f.ctx.groupId!));
 const before=await snapshot();expect((await f.read()).calls).toHaveLength(1);expect(await snapshot()).toEqual(before);
});
it('原聊天没有已结算模型时保留任务身份和分页位置，不伪造不存在',async()=>{
 const f=await fixture();await db.update(executionCalls).set({status:'started'}).where(eq(executionCalls.executionTaskId,f.submitted.executionTaskId));
 const before=await snapshot(),result=await f.read(f.ctx,{afterSequence:19,limit:5});
 expect(result).toEqual({taskId:f.submitted.executionTaskId,aiTaskId:f.submitted.taskId,conversationId:f.conversationId,sourceMessageId:f.sourceMessageId,calls:[],nextSequence:19,hasMore:false});expect(await snapshot()).toEqual(before);
});
it('旧NULL冻结可读同账号canonical来源，不改冻结摘要和任务范围',async()=>{
 const f=await fixture('legacy'),groupId=`grp_legacy_${f.ctx.accountId}`;
 await db.insert(accountGroups).values({id:groupId,userId:f.ctx.userId,name:'旧规范来源',createdAt:now(),updatedAt:now()});
 await db.update(aiConversations).set({groupId}).where(eq(aiConversations.id,f.conversationId));
 const before=await snapshot();expect((await f.read()).calls).toHaveLength(1);expect(await snapshot()).toEqual(before);
});
it('跨user/组/旧账号和缺工作区/认证拒绝，不能读别人的模型参数',async()=>{
 const f=await fixture();const otherGroup=nextId('other-group');await db.insert(accountGroups).values({id:otherGroup,userId:f.ctx.userId,name:'另一真实组',createdAt:now(),updatedAt:now()});
 const before=await snapshot();
 for(const ctx of [{...f.ctx,userId:'foreign'},{...f.ctx,groupId:otherGroup},{...f.ctx,groupId:null,accountId:null}])await expect(f.read(ctx)).rejects.toThrow();
 const legacy=await fixture('legacy');await expect(legacy.read({...legacy.ctx,accountId:'foreign-account'})).rejects.toThrow();
 await expect(f.transport.request(ENDPOINTS.readWorkbenchModelCallSummary,{params:{taskId:f.submitted.executionTaskId},query:{afterSequence:0,limit:5},body:undefined},undefined)).rejects.toThrow();
 // 新夹具本身创建了独立业务任务；失败读取不得修改f的原记录。
 const after=await snapshot();for(const key of ['tasks','calls','ai','conversations','messages','results'] as const)expect(after[key].filter(row=>before[key].some(old=>old.id===row.id))).toEqual(before[key]);
});
it.each(['owner','payload','aiExecution','digest','conversation','source'] as const)('已有任务%s闭包错配拒绝并保留原失败',async kind=>{
 const f=await fixture();const [task]=await db.select().from(executionTasks).where(eq(executionTasks.id,f.submitted.executionTaskId));const [ai]=await db.select().from(aiTasks).where(eq(aiTasks.id,f.submitted.taskId));
 if(kind==='owner')await db.update(executionTasks).set({ownerId:'wrong-owner'}).where(eq(executionTasks.id,task!.id));
 if(kind==='payload')await db.update(executionTasks).set({payload:{...task!.payload as object,aiTaskId:'wrong-ai'}}).where(eq(executionTasks.id,task!.id));
 if(kind==='aiExecution')await db.update(aiTasks).set({executionTaskId:null}).where(eq(aiTasks.id,ai!.id));
 if(kind==='digest')await db.update(aiTasks).set({inputData:{...ai!.inputData as object,modelInputDigest:'b'.repeat(64)}}).where(eq(aiTasks.id,ai!.id));
 if(kind==='conversation')await db.update(aiConversations).set({userId:'foreign-user'}).where(eq(aiConversations.id,f.conversationId));
 if(kind==='source')await db.update(aiMessages).set({modelMetadata:{chatTaskId:'wrong-ai'}}).where(eq(aiMessages.id,f.sourceMessageId));
 const before=await snapshot();await expect(f.read()).rejects.toThrow();expect(await snapshot()).toEqual(before);
});
it('分页只读取原顶层settled模型；无效回执有真实空统计，不遍历未知正文',async()=>{
 const f=await fixture();
 const [parent]=await db.select().from(executionCalls).where(and(eq(executionCalls.executionTaskId,f.submitted.executionTaskId),eq(executionCalls.sequence,1)));
 await db.insert(executionCalls).values([2,3,4,5].map(sequence=>({id:nextId('additional'),executionTaskId:f.submitted.executionTaskId,sequence,operationKey:`model-${sequence}`,kind:'model',inputDigest:'c'.repeat(64),status:sequence===4?'started':'settled',parentCallId:sequence===5?parent!.id:null,reservedTokens:0,totalTokens:2,providerResult:sequence===2?{headers:{token:'CANARY_SECRET'},content:[{type:'text',text:'CANARY_SECRET'}]}:receipt,createdAt:now(),updatedAt:now()})));
 const before=await snapshot(),first=await f.read(f.ctx,{afterSequence:0,limit:1});expect(first.calls.map(x=>x.sequence)).toEqual([1]);expect(first.hasMore).toBe(true);
 const second=await f.read(f.ctx,{afterSequence:first.nextSequence,limit:1});expect(second.calls[0]).toMatchObject({sequence:2,receiptState:'invalid',finishReason:null,toolCount:null,toolsTruncated:null,tools:[]});expect(JSON.stringify(second)).not.toContain('CANARY_SECRET');
 const third=await f.read(f.ctx,{afterSequence:second.nextSequence,limit:1});expect(third.calls.map(x=>x.sequence)).toEqual([3]);expect(third.hasMore).toBe(false);expect(await snapshot()).toEqual(before);
});
