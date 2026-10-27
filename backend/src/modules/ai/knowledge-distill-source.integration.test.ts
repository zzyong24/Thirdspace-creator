import {afterAll,beforeAll,expect,it,vi} from 'vitest';
import {z} from 'zod';
import {createDb,eq,knowledgeItems,knowledgeRevisions,knowledgeAdoptions,executionCalls,executionTasks,type Db} from '@creatoros/backend';
import {createClient,ENDPOINTS,type RequestContext} from '@creatoros/contract';
import {createAccountGroupService} from '../platform-account/account-group.service';
import {createAiRepository} from './ai.repository';
import {createChatTurnSubmissionService} from './chat-turn-submission.service';
import {createPersistentTaskService} from '../execution/persistent-task.service';
import {createChatHostToolAdapter} from '../ai-runtime/chat-host-tool-adapter';
import {createExecutionCallLedgerService} from '../execution/execution-call-ledger.service';
import {createExecutionChatToolPorts} from '../execution/execution-chat-tool-ports.service';
import {chatToolProviderName,chatWorkerInputSchema} from '@creatoros/contract/execution-worker';
import {createExecutionChatGenerationService} from '../execution/execution-chat-generation.service';
import {createExecutionModelIdentityService} from '../execution/execution-model-identity.service';
import {replayGenerationNode,runChatStructuredSequence} from '@creatoros/ai-worker/chat';
import {runWithEffectiveSkillSnapshot,knowledgeDistillSchema} from '@creatoros/ai-worker';
import {asSchema} from 'ai';
import type {ChatHostContext} from './chat-host-context';
import {buildChatTools} from '../ai-runtime/chat-tools';
import {prepareChatToolDefinitions} from '../ai-runtime/chat-tool-definitions';
import {createKnowledgeDistillSourceService} from './knowledge-distill-source.service';
import {createKnowledgeApplication} from '../../application/knowledge';
import {createKnowledgeDistillAdoptionService,createKnowledgeRepository,createKnowledgeService} from '../knowledge';

let db:Db,close:()=>Promise<void>,seq=0;
const now=()=>new Date(Date.UTC(2026,9,25,0,0,0,seq++)).toISOString(),nextId=(prefix:string)=>`${prefix}-distill-isolated-${++seq}`;
const sample={kind:'knowledge.distill' as const,atoms:[{type:'claim' as const,title:'测试观点',note:'上下文',sourceNote:'合成材料'},{type:'quote' as const,title:'测试金句',note:'',sourceNote:''}],suggestedTags:['测试主题'],originalText:'合成原文第一行\n完整第二行',coverage:{inputChars:17,submittedChars:17,truncatedChars:0},error:null,suggestSwitchModel:false};
beforeAll(async()=>{const opened=await createDb();db=opened.db;close=()=>opened.client.close();});afterAll(async()=>close?.());
async function fixture(structured=false){
 const base:RequestContext={userId:'isolated-distill-owner',requestId:nextId('request'),source:'user'};
 const group=await createAccountGroupService({db,now,nextId}).create(base,{name:nextId('验收组'),idempotencyKey:nextId('group-key')});const ctx={...base,groupId:group.id,accountId:null,groupVersion:group.version};
 const repo=createAiRepository(db,{...ctx,now,nextId}),conversation=await repo.createConversation({title:'合成蒸馏验收',projectId:null,scope:'global'}),message=await repo.createMessage(conversation.id,{role:'user',content:sample.originalText,attachments:[],modelMetadata:{}});
 const prototypes=buildChatTools(['knowledge.distill'],{humanizeError:()=>null,distillKnowledge:async()=>sample} as never),prepared=await prepareChatToolDefinitions(prototypes,{workerStructuredNodes:structured}),definition=prepared.definitions[0]!;
 const rawSchema={...await asSchema(knowledgeDistillSchema).jsonSchema};delete rawSchema.$schema;const outputSchema=z.record(z.string(),z.json()).parse(rawSchema);
 const effective={methodSystem:'隔离协议验收，只产候选',template:'{{content}}',tools:[] as string[],requiredFacets:['content'],contextRequirements:[],outputSchema,completionPolicy:null,completionPolicyAdapter:null};
 const hostContext:ChatHostContext={schemaVersion:1,chatContext:{surface:'knowledge-distill'},mediaRoute:null,positioningScratch:false,trustedScriptSources:[],skillSnapshot:{snapshotVersion:1,userId:ctx.userId,accountId:null,groupId:ctx.groupId,resolvedAt:now(),platformPolicyVersion:'1',platformPolicy:'合成验收',skills:['chatbox.distill','knowledge.distill'].map(skillId=>({skillId,baseVersion:'controlled-1',overlayRevision:null,overlayVersion:null,effective}))}};
 const submitted=await createChatTurnSubmissionService(db,{now,nextId,assemble:async()=>({capability:'copilot.assist',system:'隔离验收，不调用供应商',messages:[{role:'user',content:sample.originalText}],tools:prepared.definitions,maxSteps:4,maxOutputTokens:1000,...(structured?{hostContext}:{})})}).submit(ctx,{conversationId:conversation.id,sourceMessageId:message.id,executionEngine:'pi'});
 const claimed=(await createPersistentTaskService(db,{now}).claimTask({taskId:submitted.executionTaskId,workerId:'isolated-distill-worker'}))!,ref={executionTaskId:submitted.executionTaskId,attempt:claimed.lease.attempt,fenceToken:claimed.lease.fenceToken};
 const budget={maxCalls:6,maxTokens:10000,deadlineMs:120000},ledger=createExecutionCallLedgerService(db,{now,budget}),model=await ledger.reserve(ref,{kind:'model',operationKey:'distill-source-model',inputDigest:'sha256:'+'a'.repeat(64),reservedTokens:20});await ledger.start(ref,model.id);await ledger.settle(ref,model.id,{status:'settled',usage:{totalTokens:1},providerResult:{content:[{type:'tool-call',toolCallId:'persisted-distill-call',toolName:chatToolProviderName('knowledge.distill'),input:JSON.stringify({content:sample.originalText})}],finishReason:{unified:'tool-calls'},usage:{inputTokens:{total:1},outputTokens:{total:0}},warnings:[]}});
 const tools=structured?{'knowledge.distill':{version:definition.version,effect:'proposal' as const,execution:'worker.structured-node' as const,parameters:prepared.parameters['knowledge.distill']!.parameters,approve:async()=>({status:'not-applicable' as const}),prepareGeneration:async()=>({node:{capability:'knowledge.distill' as const,facets:{},chunks:[sample.originalText],originalText:sample.originalText,coverage:sample.coverage},discovery:null,maxOutputTokens:2048})}}:await createChatHostToolAdapter(prototypes,async()=>prototypes,{'knowledge.distill':'proposal'});
 const ports=createExecutionChatToolPorts(db,{now,budget,tools});await ports.validateTask(ref);const executed=await ports.reserve(ref,{modelCallId:model.id,toolCallId:'persisted-distill-call'});await ports.start(ref,{callId:executed.callId});
 if(!structured)expect(await ports.execute(ref,{callId:executed.callId})).toMatchObject({status:'ok',sideEffect:'proposal',data:{kind:'knowledge.distill'}});
 else{
  const credential={apiFormat:'openai_chat' as const,baseUrl:null,model:'isolated-provider-fixture',token:'isolated-placeholder-not-a-secret'};
  await createExecutionModelIdentityService(db,{now}).pin(ref,'copilot.assist',credential);
  const generation=createExecutionChatGenerationService(db,{now,budget,tools,check:async()=>({status:'not-applicable'}),resolveCredential:async()=>credential});
  await generation.resolveCredential(ref,{callId:executed.callId});const frozen=await generation.prepare(ref,{callId:executed.callId});
  const request=await runWithEffectiveSkillSnapshot(frozen.skillSnapshot,()=>replayGenerationNode({modelId:credential.model,provider:'openai.chat',receipts:[]},provider=>runChatStructuredSequence(frozen.node,provider,frozen.maxOutputTokens)));
  if(request.status!=='next-request')throw Error('Expected a real reserved generation request');
  const child=await generation.reserve(ref,{callId:executed.callId,operationKey:`${frozen.operationKey}/model/1`,request:request.request});await generation.start(ref,{callId:child.callId});
  await generation.settle(ref,{callId:child.callId,status:'settled',usage:{totalTokens:2},providerResult:{content:[{type:'text',text:JSON.stringify({atoms:sample.atoms,suggestedTags:sample.suggestedTags})}],finishReason:{unified:'stop'},usage:{inputTokens:{total:1},outputTokens:{total:1}},warnings:[]}});
  expect(await generation.complete(ref,{callId:executed.callId})).toMatchObject({status:'ok',sideEffect:'proposal',data:{kind:'knowledge.distill',originalText:sample.originalText}});
 }
 const source={conversationId:conversation.id,sourceMessageId:message.id,toolCallId:'persisted-distill-call'},reader=createKnowledgeDistillSourceService(db),tags=vi.fn(async()=>{});
 const app=createKnowledgeApplication(db,{now,nextId},{readDistillSource:(c,s,store)=>reader.read(c,s,store),assignDistillTags:tags,resolveEmbedSpec:async()=>null,embedTexts:async()=>{throw Error('no embedding');}});
 const client=createClient(ENDPOINTS,app.knowledge,ctx),atoms=sample.atoms.map((atom,index)=>({...atom,index}));
 return {ctx,source,reader,client,app,tags,submitted,executed,atoms};
}
it('真实public client：原账本来源、原子编辑与原文单事务，重建client/变更勾选重试仍同一首采纳回执',async()=>{
 const f=await fixture();expect(await f.client.getKnowledgeDistillReceipt({params:undefined,query:undefined,body:{source:f.source}})).toEqual({receipt:null});
 const receipt=await f.client.adoptKnowledgeDistill({params:undefined,query:undefined,body:{source:f.source,atoms:[{...f.atoms[0]!,title:'人修改的观点'}],archiveOriginal:true}});
 expect(receipt.atomCount).toBe(1);expect(receipt.archiveKnowledgeId).toBeTruthy();expect(f.tags).toHaveBeenCalledWith(f.ctx,receipt.knowledgeIds,['测试主题']);
 const service=createKnowledgeService(createKnowledgeRepository(db,{now,nextId}));expect((await service.getKnowledge(f.ctx,receipt.knowledgeIds[0]!)).title).toBe('人修改的观点');
 expect((await service.listRevisions(f.ctx,receipt.archiveKnowledgeId!))[0]?.content).toBe(sample.originalText);
 const fresh=createKnowledgeDistillAdoptionService(db,{now,nextId},(c,s,store)=>f.reader.read(c,s,store));
 expect(await fresh.receipt(f.ctx,f.source)).toEqual({receipt});
 expect(await fresh.adopt(f.ctx,{source:f.source,atoms:[f.atoms[1]],archiveOriginal:false})).toEqual(receipt);
 expect((await service.listKnowledge(f.ctx)).length).toBe(2);
});
it('并发双击共享唯一批次，普通手工create相同正文仍允许两个不同条目',async()=>{
 const f=await fixture(),body={source:f.source,atoms:f.atoms,archiveOriginal:true};
 const [a,b]=await Promise.all([f.client.adoptKnowledgeDistill({params:undefined,query:undefined,body}),f.client.adoptKnowledgeDistill({params:undefined,query:undefined,body})]);expect(a).toEqual(b);
 const service=createKnowledgeService(createKnowledgeRepository(db,{now,nextId}));expect(await service.listKnowledge(f.ctx)).toHaveLength(3);
 const first=await service.createKnowledge(f.ctx,{title:'手工同名',content:'同文'}),second=await service.createKnowledge(f.ctx,{title:'手工同名',content:'同文'});expect(first.id).not.toBe(second.id);
});
it('中途故障原子/首版/回执一起回滚，稍后重试完整写入',async()=>{
 const f=await fixture();let created=0;
 const faulty=createKnowledgeDistillAdoptionService(db,{now,nextId:prefix=>{if(prefix==='knowledge'&&++created===2)throw Error('injected-transaction-failure');return nextId(prefix);}},(c,s,store)=>f.reader.read(c,s,store));
 await expect(faulty.adopt(f.ctx,{source:f.source,atoms:f.atoms,archiveOriginal:true})).rejects.toThrow('injected-transaction-failure');
 expect(await db.select().from(knowledgeItems).where(eq(knowledgeItems.groupId,f.ctx.groupId))).toHaveLength(0);
 expect(await db.select().from(knowledgeAdoptions).where(eq(knowledgeAdoptions.groupId,f.ctx.groupId))).toHaveLength(0);
 const allItems=await db.select().from(knowledgeItems),allRevisions=await db.select().from(knowledgeRevisions);expect(allRevisions.every(row=>allItems.some(item=>item.id===row.knowledgeItemId))).toBe(true);
 expect((await f.client.adoptKnowledgeDistill({params:undefined,query:undefined,body:{source:f.source,atoms:f.atoms,archiveOriginal:true}})).atomCount).toBe(2);
});
it('跨组/伪造tool id/未结算/原文被篡改/冻结proof被篡改均拒绝，不能通过客户端archiveText补造',async()=>{
 const f=await fixture();await expect(f.reader.read({...f.ctx,groupId:'foreign-group'},f.source)).rejects.toThrow();await expect(f.reader.read(f.ctx,{...f.source,toolCallId:'invented'})).rejects.toThrow();
 await expect(f.client.adoptKnowledgeDistill({params:undefined,query:undefined,body:{source:f.source,atoms:f.atoms,archiveOriginal:true,originalText:'伪造原文'} as never})).rejects.toThrow();
 const [call]=await db.select().from(executionCalls).where(eq(executionCalls.id,f.executed.callId));
 await db.update(executionCalls).set({status:'unknown'}).where(eq(executionCalls.id,call!.id));await expect(f.reader.read(f.ctx,f.source)).rejects.toThrow();
 const changed=JSON.parse(call!.resultText!);changed.output.data.originalText='篡改存档';await db.update(executionCalls).set({status:'settled',resultText:JSON.stringify(changed)}).where(eq(executionCalls.id,call!.id));await expect(f.reader.read(f.ctx,f.source)).rejects.toThrow();
 await db.update(executionCalls).set({resultText:call!.resultText}).where(eq(executionCalls.id,call!.id));
 const [task]=await db.select().from(executionTasks).where(eq(executionTasks.id,f.submitted.executionTaskId)),payload=structuredClone(task!.payload) as Record<string,unknown>,input=chatWorkerInputSchema.parse(payload.modelInput);input.tools[0]!.description='篡改冻结声明';payload.modelInput=input;await db.update(executionTasks).set({payload}).where(eq(executionTasks.id,task!.id));await expect(f.reader.read(f.ctx,f.source)).rejects.toThrow();
});
it('现役worker.structured-node：真实父tool/子模型预留结算/服务端complete后可采纳，缺子模型拒绝',async()=>{
 const f=await fixture(true);expect((await f.reader.read(f.ctx,f.source)).candidate.atoms).toEqual(sample.atoms);
 const receipt=await f.client.adoptKnowledgeDistill({params:undefined,query:undefined,body:{source:f.source,atoms:f.atoms,archiveOriginal:true}});expect(receipt.atomCount).toBe(2);
 const children=await db.select().from(executionCalls).where(eq(executionCalls.parentCallId,f.executed.callId));expect(children).toHaveLength(1);
 await db.update(executionCalls).set({status:'unknown'}).where(eq(executionCalls.id,children[0]!.id));await expect(f.reader.read(f.ctx,f.source)).rejects.toThrow();
});
