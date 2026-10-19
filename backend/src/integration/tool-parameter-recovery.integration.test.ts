import {createServer} from 'node:http';
import {resolve} from 'node:path';
import {afterAll,beforeAll,expect,it} from 'vitest';
import {z} from 'zod';
import {chatWorkerInputSchema} from '@creatoros/contract/execution-worker';
import {createDb,eq,executionTasks,executionCalls,aiTasks,aiTaskResults,type Db} from '@creatoros/backend';
import {createAiService} from '../modules/ai';
import {createChatTurnSubmissionService} from '../modules/ai/chat-turn-submission.service';
import {createChatWorkerDispatcher} from '../modules/execution/model-worker-dispatcher';
import {createPersistentTaskService} from '../modules/execution/persistent-task.service';
import {createExecutionCallLedgerService} from '../modules/execution/execution-call-ledger.service';
import {createExecutionAgenticToolPorts} from '../modules/execution/execution-agentic-tool-ports.service';

let db:Db,close:()=>Promise<void>;
beforeAll(async()=>{const opened=await createDb();db=opened.db;close=()=>opened.client.close();},180000);
afterAll(async()=>close?.(),180000);

it('真实Pi Worker收到两个具体参数错误，在原任务内改为null取得隔离候选；不自动采纳或续期',async()=>{
 const ctx={userId:'parameter-recovery-user',accountId:'parameter-recovery-account',requestId:'test',source:'user' as const};
 const forbidden=async():Promise<never>=>{throw Error('参数纠错夹具不得采用领域稿件');};
 let sequence=0;const nextId=(prefix:string)=>`${prefix}-parameter-recovery-${++sequence}`;
 const ai=createAiService({db,nextId,now:()=>new Date().toISOString(),artifacts:{createVersion:forbidden},knowledge:{createKnowledge:forbidden},positioning:{upsertProfile:forbidden,createStatementVersion:forbidden},candidate:{createFromAIResult:forbidden,enrichCard:forbidden},learnings:{createLearning:forbidden},publishing:{createPublicationFromDraft:forbidden},materialLinks:{link:forbidden},calibration:{createDraftPrediction:forbidden}});
 const conversation=await ai.createConversation(ctx,{title:'隔离机械参数纠错',projectId:null,scope:'global'});
 const source=await ai.createMessage(ctx,conversation.id,{content:'只提出候选，先修正参数',attachments:[]});
 const parameters=z.object({graphic:z.object({ruleSnapshotRef:z.object({versionId:z.string().min(1)}).strict().nullable()}).strict(),duration:z.number(),privateText:z.string()}).strict();
 const definition=chatWorkerInputSchema.shape.tools.element.parse({name:'fixture.propose',version:'1',description:'隔离协议候选夹具，不代表真实两稿领域',effect:'proposal',parameters:z.toJSONSchema(parameters)});
 const submitter=createChatTurnSubmissionService(db,{assemble:async()=>({capability:'copilot.assist',system:'根据后端回执在同一任务实际改变参数，成功工具回执前不能称候选就绪。',messages:[{role:'user',content:source.content}],maxSteps:6,maxOutputTokens:4096,tools:[definition]})});
 const request={conversationId:conversation.id,sourceMessageId:source.id};
 const submitted=await submitter.submit(ctx,request);
 const [frozen]=await db.select().from(executionTasks).where(eq(executionTasks.id,submitted.executionTaskId));
 const originalPayload=JSON.stringify(frozen!.payload),originalBudget=JSON.stringify(frozen!.executionBudget);
 const requests:Array<{messages:Array<{role:string;content:unknown}>}>=[],failures:unknown[]=[],actualInputs:unknown[]=[];
 const server=createServer(async(req,res)=>{
  try{
   let body='';for await(const part of req)body+=part;
   const parsed=JSON.parse(body);requests.push(parsed);
   const ordinal=requests.length;
   // 夹具只在实际工具错误回执携带具体说明时纠错；不能靠system或工具声明冒充传播成功。
   const toolText=JSON.stringify(parsed.messages.filter((m:{role:string})=>m.role==='tool'));
   if(ordinal>1&&(!toolText.includes('允许 null')||!toolText.includes('必填')))throw Error('实际工具结果缺少具体nullable纠错说明');
   if(ordinal===2&&!toolText.includes('versionId'))throw Error('空对象错误没有定位子字段');
   if(ordinal===3&&!toolText.includes('缺失'))throw Error('缺字段错误没有说明收到的类型');
   if(ordinal>4)throw Error('同一纠错旅程不得额外发模型请求');
   const input={graphic:ordinal===1?{ruleSnapshotRef:{}}:ordinal===2?{}:{ruleSnapshotRef:null},duration:2,privateText:'私有夹具正文不能进入纠错文案'};
   const delta=ordinal<4?{tool_calls:[{index:0,id:`parameter-${ordinal}`,type:'function',function:{name:'fixture_propose',arguments:JSON.stringify(input)}}]}:{content:'隔离候选已经准备，等待用户采纳。'};
   const chunks=[{choices:[{index:0,delta,finish_reason:null}]},{choices:[{index:0,delta:{},finish_reason:ordinal<4?'tool_calls':'stop'}],usage:{prompt_tokens:2,completion_tokens:3,total_tokens:5}}];
   res.writeHead(200,{'content-type':'text/event-stream'});res.end(chunks.map(chunk=>`data: ${JSON.stringify({id:'fixture',object:'chat.completion.chunk',created:1,model:'fixture',...chunk})}\n\n`).join('')+'data: [DONE]\n\n');
  }catch(error){failures.push(String(error));res.writeHead(500);res.end('参数纠错HTTP夹具失败');}
 });
 await new Promise<void>(done=>server.listen(0,'127.0.0.1',done));
 const host=createChatWorkerDispatcher(db,{entryPath:resolve('../ai-worker/dist/execution-worker.cjs'),workerId:'parameter-recovery-worker',budget:{maxCalls:12,maxTokens:100000,deadlineMs:120000},pollMs:100,modelConcurrency:1,
  resolveTools:async()=>({'fixture.propose':{version:'1',parameters,effect:'proposal',approve:async()=>({status:'not-applicable' as const}),execute:async(_c,input)=>{actualInputs.push(input);return {status:'ok' as const,summary:'隔离参数候选',evidence:[],data:{kind:'fixture.parameter-proposal',document:input},error:null,continuation:null,sideEffect:'proposal' as const};}}}),
  resolveModelCredential:async()=>({apiFormat:'openai_chat',baseUrl:`http://127.0.0.1:${(server.address() as {port:number}).port}/v1`,model:'fixture',token:'fixture'})});
 try{
  host.start();
  await expect.poll(async()=>(await db.select().from(executionTasks).where(eq(executionTasks.id,submitted.executionTaskId)))[0]?.status,{timeout:120000}).toBe('succeeded');
  expect(failures).toEqual([]);expect(requests).toHaveLength(4);
  expect(actualInputs).toEqual([{graphic:{ruleSnapshotRef:null},duration:2,privateText:'私有夹具正文不能进入纠错文案'}]);
  const calls=(await db.select().from(executionCalls).where(eq(executionCalls.executionTaskId,submitted.executionTaskId))).sort((a,b)=>a.sequence-b.sequence);
  const tools=calls.filter(call=>call.kind==='tool');expect(tools).toHaveLength(3);expect(calls).toHaveLength(7);expect(calls.every(call=>call.status==='settled')).toBe(true);
  for(const tool of tools.slice(0,2)){
   const output=JSON.parse(tool.resultText!).output;
   expect(output).toMatchObject({status:'error',sideEffect:'none',error:{code:'invalid_input',retryable:false}});
   expect(output.error.recovery).toContain('允许 null');expect(output.error.recovery).not.toContain('私有夹具正文');
  }
  expect(JSON.parse(tools[2]!.resultText!).output).toMatchObject({status:'ok',sideEffect:'proposal',data:{document:{graphic:{ruleSnapshotRef:null}}}});
  expect(await ai.getTask(ctx,submitted.taskId)).toMatchObject({id:submitted.taskId,status:'succeeded',runtimeStatus:'succeeded'});
  expect(await db.select().from(aiTasks)).toHaveLength(1);expect(await db.select().from(aiTaskResults)).toHaveLength(1);
  const after=(await db.select().from(executionTasks).where(eq(executionTasks.id,submitted.executionTaskId)))[0]!;
  // 第一次执行按原模型归属服务补一次identity；冻结modelInput/纠错格式/其它payload不可变。
  const {modelIdentity,...remaining}=after.payload as Record<string,unknown>;
  expect(modelIdentity).toMatchObject({schemaVersion:1,model:'fixture',apiFormat:'openai_chat',capability:'copilot.assist',customEndpoint:true,baseUrlDigest:expect.stringMatching(/^sha256:[a-f0-9]{64}$/)});
  expect(JSON.stringify(remaining)).toBe(originalPayload);expect(JSON.stringify(after.executionBudget)).toBe(originalBudget);
  expect(await submitter.submit(ctx,request)).toEqual({...submitted,replayed:true});
  expect(await db.select().from(aiTasks)).toHaveLength(1);
 }finally{await host.stop();server.closeAllConnections();await new Promise<void>(done=>server.close(()=>done()));}
},180000);

it('旧格式的真实预留、启动与结算保持原文案及摘要；回放不得改写已结算错误',async()=>{
 const ctx={userId:'old-recovery-user',accountId:'old-recovery-account',requestId:'test',source:'user' as const};
 let sequence=0;const nextId=(prefix:string)=>`${prefix}-old-recovery-${++sequence}`,now=()=>new Date().toISOString();
 const forbidden=async():Promise<never>=>{throw Error('旧参数错误不得执行领域操作');};
 const ai=createAiService({db,nextId,now,artifacts:{createVersion:forbidden},knowledge:{createKnowledge:forbidden},positioning:{upsertProfile:forbidden,createStatementVersion:forbidden},candidate:{createFromAIResult:forbidden,enrichCard:forbidden},learnings:{createLearning:forbidden},publishing:{createPublicationFromDraft:forbidden},materialLinks:{link:forbidden},calibration:{createDraftPrediction:forbidden}});
 const conversation=await ai.createConversation(ctx,{title:'旧回执保护',projectId:null,scope:'global'}),source=await ai.createMessage(ctx,conversation.id,{content:'原工具错误',attachments:[]});
 const parameters=z.object({graphic:z.object({ruleSnapshotRef:z.object({versionId:z.string()}).strict().nullable()}).strict()}).strict();
 const definition=chatWorkerInputSchema.shape.tools.element.parse({name:'fixture.read',version:'1',description:'旧回执夹具',effect:'none',parameters:z.toJSONSchema(parameters)});
 const submitter=createChatTurnSubmissionService(db,{now,nextId,assemble:async()=>({capability:'copilot.assist',system:'旧格式',messages:[{role:'user',content:source.content}],maxSteps:4,maxOutputTokens:100,tools:[definition]})});
 const request={conversationId:conversation.id,sourceMessageId:source.id},submitted=await submitter.submit(ctx,request);
 const [before]=await db.select().from(executionTasks).where(eq(executionTasks.id,submitted.executionTaskId));
 // 隔离资料模拟更新前已保存的缺标记旧任务，不编辑用户任务或历史账本。
 const legacy={...(before!.payload as Record<string,unknown>)};delete legacy.toolValidationRecoveryVersion;
 await db.update(executionTasks).set({payload:legacy}).where(eq(executionTasks.id,submitted.executionTaskId));
 const tasks=createPersistentTaskService(db,{now}),claim=(await tasks.claimTask({taskId:submitted.executionTaskId,workerId:'old-recovery-worker'}))!;
 const ref={executionTaskId:submitted.executionTaskId,attempt:claim.lease.attempt,fenceToken:claim.lease.fenceToken};
 const budget={maxCalls:8,maxTokens:100000,deadlineMs:120000},ledger=createExecutionCallLedgerService(db,{now,budget});
 const model=await ledger.reserve(ref,{kind:'model',operationKey:'old-model',inputDigest:`sha256:${'a'.repeat(64)}`,reservedTokens:10});
 await ledger.start(ref,model.id);await ledger.settle(ref,model.id,{status:'settled',usage:{totalTokens:5},providerResult:{content:[{type:'tool-call',toolCallId:'old-error',toolName:'fixture_read',input:'{"graphic":{"ruleSnapshotRef":{}}}'}],finishReason:{unified:'tool-calls'},usage:{inputTokens:{total:2},outputTokens:{total:3}},warnings:[]}});
 const options={now,budget,tools:{'fixture.read':{version:'1',parameters,effect:'none' as const,execute:forbidden}}},ports=createExecutionAgenticToolPorts(db,options);
 const reserved=await ports.reserve(ref,{modelCallId:model.id,toolCallId:'old-error'});
 const oldOutcome={status:'error',summary:'工具参数不符合定义，本次没有执行操作',evidence:[],error:{code:'invalid_input',retryable:false,recovery:'请按工具schema修正参数后发起新调用：graphic.ruleSnapshotRef.versionId (invalid_type)'},continuation:null,sideEffect:'none'};
 expect(reserved.validationOutcome).toEqual(oldOutcome);
 const frozenCall=(await ledger.inspect(ref)).calls.find(call=>call.id===reserved.callId)!;
 await ports.start(ref,{callId:reserved.callId});await ports.settle(ref,{callId:reserved.callId,status:'settled',output:oldOutcome});
 expect(await createExecutionAgenticToolPorts(db,options).reserve(ref,{modelCallId:model.id,toolCallId:'old-error'})).toMatchObject({callId:reserved.callId,status:'settled',validationOutcome:oldOutcome,receipt:{output:oldOutcome}});
 await expect(ports.settle(ref,{callId:reserved.callId,status:'settled',output:{...oldOutcome,error:{...oldOutcome.error,recovery:'允许 null'}}})).rejects.toThrow('不能改写');
 const saved=(await ledger.inspect(ref)).calls.find(call=>call.id===reserved.callId)!;
 expect(saved.inputDigest).toBe(frozenCall.inputDigest);expect(JSON.parse(saved.resultText!).output).toEqual(oldOutcome);
 expect(await submitter.submit(ctx,request)).toEqual({...submitted,replayed:true});
 const [after]=await db.select().from(executionTasks).where(eq(executionTasks.id,submitted.executionTaskId));
 expect(after!.payload).toEqual(legacy);expect(after!.executionBudget).toEqual(before!.executionBudget);
},180000);
