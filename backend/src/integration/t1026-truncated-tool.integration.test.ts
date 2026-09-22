import {createServer} from 'node:http';
import {createHash} from 'node:crypto';
import {expect,it,vi} from 'vitest';
import {z} from 'zod';
import {createDb,executionTasks,eq} from '@creatoros/backend';
import {createAiRepository} from '../modules/ai/ai.repository';
import {createChatTurnSubmissionService} from '../modules/ai/chat-turn-submission.service';
import {createChatTurnCompletionService} from '../modules/ai/chat-turn-completion.service';
import {chatWorkerInputSchema} from '@creatoros/contract/execution-worker';
import {runChatInWorker,type ChatWorkerPorts} from '../../../ai-worker/src/execution/chat-worker-run';
import {createPersistentTaskService} from '../modules/execution/persistent-task.service';
import {createExecutionCallLedgerService} from '../modules/execution/execution-call-ledger.service';
import {createExecutionGenerationPorts} from '../modules/execution/execution-generation-ports.service';
import {createExecutionChatToolPorts} from '../modules/execution/execution-chat-tool-ports.service';
import {createExecutionCheckpointService} from '../modules/execution/execution-checkpoint.service';
import {createExecutionStreamService} from '../modules/execution/execution-stream.service';
import {createExecutionWorkerOutcomeService} from '../modules/execution/execution-worker-outcome.service';
import {createChatHostContextReader} from '../modules/ai/chat-host-context.service';
import * as receiptProjection from '../../../ai-worker/src/capabilities/result-pages';
import * as contextWindow from '../../../ai-worker/src/runtime/chat/chat-context-window-v2';

it('完整旧窗口回放：240000 字符，覆盖 19/18 回合与 shortened/system 临界值',async()=>{
 const f=await createDb(),budget={maxCalls:60,maxTokens:200000,deadlineMs:60000};
 let input=chatWorkerInputSchema.parse({kind:'chat.run',executionEngine:'pi',contextPolicyVersion:2,operationKey:'window-turn',capability:'copilot.assist',
  userId:'window-user',accountId:'window-account',conversationId:'window-conversation',sourceMessageId:'window-message',
  system:'s'.repeat(3000),messages:[{role:'user',content:'read sources'}],maxSteps:12,maxOutputTokens:128,
  tools:[{name:'source.read',version:'1',effect:'none',description:'read source',parameters:{type:'object',properties:{}}}]});
 let legacy=true,seeding=true,requests=0;
 const ids=new Map<string,string>(),bodies:unknown[]=[],generationRequests:Array<{operationKey:string;request:Record<string,unknown>}>=[];
 const originalProjection=receiptProjection.projectReceiptForPi,originalWindow=contextWindow.windowChatContextV2;
 const windows:Array<{legacy:boolean;total:number;count:number;shortened:boolean}>=[];
 const projectionSpy=vi.spyOn(receiptProjection,'projectReceiptForPi').mockImplementation((outcome,id,ports)=>originalProjection(outcome,legacy?(ids.get(id)??id):id,ports));
 const windowSpy=vi.spyOn(contextWindow,'windowChatContextV2').mockImplementation((...args)=>{
  const result=originalWindow(...args);
  const total=args[0].filter(message=>message.role==='tool').length;
  if(total===19||total===20){
   windows.push({legacy,total,count:result.messages.filter(message=>message.role==='tool').length,shortened:result.shortened});
  }
  return result;
 });
 const server=createServer((req,res)=>{let body='';req.on('data',chunk=>body+=chunk);req.on('end',()=>{
  bodies.push(JSON.parse(body));requests++;
  const delta=requests<=21?{tool_calls:[{index:0,id:`provider-${requests-1}`,type:'function',function:{name:'source_read',arguments:'{}'}}]}:{content:'完成'};
  const chunks=[{choices:[{index:0,delta,finish_reason:null}]},{choices:[{index:0,delta:{},finish_reason:requests<=21?'tool_calls':'stop'}],usage:{prompt_tokens:2,completion_tokens:3,total_tokens:5}}];
  res.writeHead(200,{'content-type':'text/event-stream'});res.end(chunks.map(chunk=>`data: ${JSON.stringify({id:'fixture',object:'chat.completion.chunk',created:1,model:'fixture',...chunk})}\n\n`).join('')+'data: [DONE]\n\n');
 });});
 await new Promise<void>(resolve=>server.listen(0,'127.0.0.1',resolve));
 try{
  const tasks=createPersistentTaskService(f.db),ctx={userId:input.userId,accountId:input.accountId,requestId:'window',source:'user' as const};
  const repo=createAiRepository(f.db,{userId:ctx.userId,accountId:ctx.accountId,now:()=>new Date().toISOString(),nextId:prefix=>`${prefix}-window`});
  const conversation=await repo.createConversation({title:'窗口边界',projectId:null,scope:'global'});
  const source=await repo.createMessage(conversation.id,{role:'user',content:'read sources',attachments:[],modelMetadata:{}});
  const submitted=await createChatTurnSubmissionService(f.db,{assemble:async()=>input}).submit(ctx,{conversationId:conversation.id,sourceMessageId:source.id});
  const [task]=await f.db.select().from(executionTasks).where(eq(executionTasks.id,submitted.executionTaskId));
  if(!task)throw Error('missing task');
  input=chatWorkerInputSchema.parse((task.payload as {modelInput:unknown}).modelInput);
  const claim=(await tasks.claimTask({taskId:task.id,workerId:'window'}))!;
  const ref={executionTaskId:task.id,attempt:claim.lease.attempt,fenceToken:claim.lease.fenceToken};
  const ledger=createExecutionCallLedgerService(f.db,{budget}),generation=createExecutionGenerationPorts(f.db,{budget});
  const checkpoints=createExecutionCheckpointService(f.db),streams=createExecutionStreamService(f.db);
  const read=vi.fn(async()=>({status:'ok' as const,summary:'source',data:{text:'a'.repeat(15000)},evidence:[],error:null,continuation:null,sideEffect:'none' as const}));
  const host=createExecutionChatToolPorts(f.db,{budget,tools:{'source.read':{version:'1',effect:'none',parameters:z.object({}),execute:read,approve:async()=>({status:'not-applicable'})}}});
  const stopped=new AbortController();
  const ports:ChatWorkerPorts={approve:async(request,signal)=>(await host.check(ref,request,signal)).status as 'not-applicable',call:async(port,data,signal)=>{
   switch(port){
    case 'readCheckpoint':return checkpoints.read(ref);
    case 'saveCheckpoint':{const saved=await checkpoints.save(ref,data);if(seeding&&saved.revision===41)stopped.abort();return saved;}
    case 'appendStreamEvents':return streams.append(ref,data);
    case 'reserveGenerationCall':generationRequests.push(structuredClone(data) as typeof generationRequests[number]);return generation.reserveGenerationCall(ref,data);
    case 'startCall':{const row=await ledger.start(ref,(data as {callId:string}).callId);return {callId:row.id,status:row.status};}
    case 'settleGenerationCall':return generation.settleGenerationCall(ref,data);
    case 'reserveAgenticTool':{const row=await host.reserve(ref,data);ids.set((data as {toolCallId:string}).toolCallId,row.callId);return row;}
    case 'startAgenticTool':return host.start(ref,data);
    case 'executeAgenticTool':return host.execute(ref,data,signal);
    case 'settleAgenticTool':return host.settle(ref,data);
    default:throw Error(`unbound port ${port}`);
   }
  }};
  const run=(signal:AbortSignal)=>runChatInWorker(input,{apiFormat:'openai_chat',baseUrl:`http://127.0.0.1:${(server.address() as {port:number}).port}/v1`,model:'fixture',token:'fixture'},signal,ports);
  const seededError=await run(stopped.signal).then(()=>undefined,error=>error);
  expect({stopped:stopped.signal.aborted,error:seededError?.message}).toEqual({stopped:true,error:expect.any(String)});
  const before=await ledger.inspect(ref);expect(before.calls).toHaveLength(41);expect(before.spentTokens).toBe(105);
  legacy=false;seeding=false;
  const resumed=await run(AbortSignal.timeout(15000)).then(result=>({result,error:undefined}),error=>({result:undefined,error}));
  const after=await ledger.inspect(ref);
  expect(after.calls.slice(0,41)).toEqual(before.calls);
  expect({windows,error:resumed.error?.message}).toEqual({windows:expect.any(Array),error:undefined});
  // 同一真实回放先遇到 system 后缀差异，再遇到双方都 shortened 但回合集合不同。
  expect(windows.filter(window=>!window.legacy&&window.total===19)).toEqual([
   {legacy:false,total:19,count:19,shortened:false},{legacy:false,total:19,count:18,shortened:true},
  ]);
  expect(windows.filter(window=>!window.legacy&&window.total===20)).toEqual([
   {legacy:false,total:20,count:19,shortened:true},{legacy:false,total:20,count:18,shortened:true},
  ]);
  expect(resumed.result?.outcome).toBe('completed');expect(requests).toBe(22);expect(read).toHaveBeenCalledTimes(21);expect(after.spentTokens).toBe(110);
  const model21=generationRequests.filter(request=>request.operationKey.endsWith('/model/21'));
  expect(model21).toHaveLength(2);expect(model21[1]).toEqual(model21[0]);
  for(let i=1;i<=21;i++){
   const replay=generationRequests.filter(request=>request.operationKey.endsWith(`/model/${i}`));
   expect(replay).toHaveLength(2);expect(replay[1]).toEqual(replay[0]);
   expect(`sha256:${createHash('sha256').update(JSON.stringify(replay[1]!.request)).digest('hex')}`).toBe(before.calls[(i-1)*2]!.inputDigest);
  }
  const lastBody=bodies[21] as {messages:Array<{content:unknown}>};
  const text=lastBody.messages.map(message=>typeof message.content==='string'?message.content:JSON.stringify(message.content)).join('\n');
  expect(text).toContain('toolCallId="provider-20"');expect(text).not.toContain('toolCallId="call_');
 }finally{projectionSpy.mockRestore();windowSpy.mockRestore();server.closeAllConnections();await new Promise<void>(resolve=>server.close(()=>resolve()));await f.client.close();}
},30000);

// 真实 HTTP provider → SDK → Pi → runChatInWorker → 内存持久账本/checkpoint。
// 文件工具仅记录沙箱副作用；不连接安装版、不读写用户文件。
it.each(['{"path":"douyin-plays.html"}','{"path":','{"path":"douyin-plays.html","content":"截断但表面完整"}'])('length 提案 %s：保留费用并续接，回放不重复已完成副作用',async truncatedInput=>{
  const f=await createDb();
  const budget={maxCalls:12,maxTokens:200000,deadlineMs:60000};
  const parameters=z.object({path:z.string(),content:z.string()}).strict();
  let input=chatWorkerInputSchema.parse({kind:'chat.run',executionEngine:'pi',operationKey:'truncated-turn',capability:'copilot.assist',
    userId:'fixture-user',accountId:'fixture-account',conversationId:'fixture-conversation',sourceMessageId:'fixture-message',
    system:'沿已有回执修复报告，不重复已成功写入。',messages:[{role:'user',content:'修复报告'}],maxSteps:8,maxOutputTokens:128,
    tools:[{name:'files.write',version:'1',effect:'committed',description:'写任务文件',parameters:z.toJSONSchema(parameters)},
      {name:'tool.result.read',version:'1',effect:'none',description:'读取原回执',parameters:z.toJSONSchema(z.object({toolCallId:z.string()}))}]});
  let requests=0;
  const bodies:unknown[]=[];
  const server=createServer((req,res)=>{
    let body='';req.on('data',chunk=>body+=chunk);req.on('end',()=>{
      bodies.push(JSON.parse(body));requests++;
      const proposal=requests===1?{id:'prior-write',name:'files_write',arguments:'{"path":"prior.html","content":"已完成"}'}
        :requests===2?{id:'read-result',name:'tool_result_read',arguments:'{"toolCallId":"missing-execution-id"}'}
        :requests===3?{id:'truncated-write',name:'files_write',arguments:truncatedInput}
        :requests===4?{id:'repaired-write',name:'files_write',arguments:'{"path":"douyin-plays.html","content":"修复完成"}'}:null;
      const delta=proposal?{...(requests===3?{content:'先写新版本到任务目录'}:{}),tool_calls:[{index:0,id:proposal.id,type:'function',function:{name:proposal.name,arguments:proposal.arguments}}]}:{content:'已根据写入回执完成修复。'};
      const reason=requests===3?'length':proposal?'tool_calls':'stop';
      const chunks=[{choices:[{index:0,delta,finish_reason:null}]},{choices:[{index:0,delta:{},finish_reason:reason}],usage:{prompt_tokens:2,completion_tokens:3,total_tokens:5}}];
      res.writeHead(200,{'content-type':'text/event-stream'});
      res.end(chunks.map(chunk=>`data: ${JSON.stringify({id:'fixture',object:'chat.completion.chunk',created:1,model:'fixture',...chunk})}\n\n`).join('')+'data: [DONE]\n\n');
    });
  });
  await new Promise<void>(resolve=>server.listen(0,'127.0.0.1',resolve));
  try{
    const tasks=createPersistentTaskService(f.db);
    const ctx={userId:input.userId,accountId:input.accountId,requestId:'fixture',source:'user' as const};
    const repo=createAiRepository(f.db,{userId:ctx.userId,accountId:ctx.accountId,now:()=>new Date().toISOString(),nextId:prefix=>`${prefix}-fixture`});
    const conversation=await repo.createConversation({title:'截断恢复',projectId:null,scope:'global'});
    const source=await repo.createMessage(conversation.id,{role:'user',content:'修复报告',attachments:[],modelMetadata:{}});
    const submitted=await createChatTurnSubmissionService(f.db,{assemble:async()=>input}).submit(ctx,{conversationId:conversation.id,sourceMessageId:source.id});
    const [task]=(await f.db.select().from(executionTasks).where(eq(executionTasks.id,submitted.executionTaskId)));
    if(!task)throw Error('missing task');
    input=chatWorkerInputSchema.parse((task.payload as {modelInput:unknown}).modelInput);
    const claim=(await tasks.claimTask({taskId:task.id,workerId:'fixture-worker'}))!;
    const ref={executionTaskId:task.id,attempt:claim.lease.attempt,fenceToken:claim.lease.fenceToken};
    const ledger=createExecutionCallLedgerService(f.db,{budget});
    const generation=createExecutionGenerationPorts(f.db,{budget});
    const checkpoints=createExecutionCheckpointService(f.db),streams=createExecutionStreamService(f.db);
    const writes=vi.fn(async(_context:unknown,args:unknown)=>({status:'ok' as const,summary:'写入已确认',data:parameters.parse(args),evidence:[],error:null,continuation:null,sideEffect:'committed' as const}));
    const host=createExecutionChatToolPorts(f.db,{budget,tools:{
      'files.write':{version:'1',effect:'committed',parameters,execute:writes,approve:async()=>({status:'not-applicable'})},
      'tool.result.read':{version:'1',effect:'none',parameters:z.object({toolCallId:z.string()}),approve:async()=>({status:'not-applicable'}),execute:async()=>({status:'error' as const,summary:'未找到工具回执',data:null,evidence:[],error:{code:'no_evidence',retryable:false,recovery:'根据已有回执继续'},continuation:null,sideEffect:'none' as const})},
    }});
    const checkpointErrors:string[]=[];
    const ports:ChatWorkerPorts={approve:async(request,signal)=>(await host.check(ref,request,signal)).status as 'not-applicable',call:async(port,data,signal)=>{
      switch(port){
        case 'readCheckpoint':return checkpoints.read(ref);
        case 'saveCheckpoint':try{return await checkpoints.save(ref,data);}catch(error){checkpointErrors.push((error as Error).message);throw error;}
        case 'appendStreamEvents':return streams.append(ref,data);
        case 'reserveGenerationCall':return generation.reserveGenerationCall(ref,data);
        case 'startCall':{const row=await ledger.start(ref,(data as {callId:string}).callId);return {callId:row.id,status:row.status};}
        case 'settleGenerationCall':return generation.settleGenerationCall(ref,data);
        case 'reserveAgenticTool':return host.reserve(ref,data);
        case 'startAgenticTool':return host.start(ref,data);
        case 'executeAgenticTool':return host.execute(ref,data,signal);
        case 'settleAgenticTool':return host.settle(ref,data);
        default:throw Error(`unbound port ${port}`);
      }
    }};
    const run=()=>runChatInWorker(input,{apiFormat:'openai_chat',baseUrl:`http://127.0.0.1:${(server.address() as {port:number}).port}/v1`,model:'fixture',token:'fixture'},AbortSignal.timeout(15000),ports);
    const actual=await run().then(result=>({result,error:undefined}),error=>({result:undefined,error}));
    const state=await ledger.inspect(ref),checkpoint=await checkpoints.read(ref);
    expect(state.calls.every(call=>call.status==='settled')).toBe(true);
    expect(state.spentTokens).toBe(requests*5);
    // OpenAI adapter 会把不闭合 JSON 规范化为 {}；这里核验其实际返回的回执形状。
    expect(state.calls[4]).toMatchObject({kind:'model',status:'settled',totalTokens:5,providerResult:{finishReason:{unified:'length'},content:expect.arrayContaining([expect.objectContaining({type:'tool-call',toolCallId:'truncated-write',toolName:'files_write',input:truncatedInput==='{"path":'?'{}':truncatedInput})])}});
    expect(writes.mock.calls.filter(call=>parameters.parse(call[1]).path==='prior.html')).toHaveLength(1);
    expect(writes.mock.calls.every(call=>parameters.safeParse(call[1]).success)).toBe(true);
    // 失败时打印可复现的真实持久状态，不能用 mock runChat 抛错代替这条链路。
    expect({checkpointErrors,error:actual.error?.message,calls:state.calls.length,revision:checkpoint.revision,recovery:checkpoint.recovery,spentTokens:state.spentTokens}).toEqual({checkpointErrors:[],error:undefined,calls:9,revision:9,recovery:'ready',spentTokens:25});
    expect(actual.result?.outcome).toBe('completed');
    // 缺 content 必须得到后端已结算的无副作用错误，让模型修正新调用。
    expect(JSON.parse(state.calls[5]!.resultText!)).toMatchObject({toolCallId:'truncated-write',output:{status:'error',error:{code:'invalid_input'},sideEffect:'none'}});
    expect(state.calls.filter(call=>call.kind==='tool')).toHaveLength(4);
    expect(writes.mock.calls.map(call=>call[1])).toEqual([{path:'prior.html',content:'已完成'},{path:'douyin-plays.html',content:'修复完成'}]);
    expect(JSON.stringify(bodies[3])).toContain('invalid_input');
    await expect(run()).resolves.toMatchObject({outcome:'completed'});
    expect(requests).toBe(5);expect(writes).toHaveBeenCalledTimes(2);
    expect((await ledger.inspect(ref)).spentTokens).toBe(25);
    const result=actual.result!;
    await expect(createChatTurnCompletionService(f.db).commitResult(ref,{lastModelCallId:result.lastModelCallId,toolCallIds:result.toolCallIds})).resolves.toMatchObject({outcome:'succeeded'});
  }finally{
    server.closeAllConnections();await new Promise<void>(resolve=>server.close(()=>resolve()));await f.client.close();
  }
},20000);

// 只用旧 commit 的一行参数差异生成历史，其余 Worker/SDK/持久化路径全部真实。
// 保留旧展示是对照组；直接升级展示必须也能回放既有结算，不能重写或放宽摘要。
it.each([{preserveLegacy:true,truncated:false,escaped:false},{preserveLegacy:false,truncated:false,escaped:false},{preserveLegacy:false,truncated:true,escaped:false},{preserveLegacy:false,truncated:true,escaped:true}])('旧长回执恢复：旧展示=$preserveLegacy，5calls/4checkpoint=$truncated，转义长回执=$escaped',async({preserveLegacy,truncated,escaped})=>{
  const f=await createDb(),budget={maxCalls:12,maxTokens:200000,deadlineMs:60000};
  const pageParams=z.object({toolCallId:z.string(),offset:z.number().int()});
  let input=chatWorkerInputSchema.parse({kind:'chat.run',executionEngine:'pi',operationKey:'notice-turn',capability:'copilot.assist',
    userId:'notice-user',accountId:'notice-account',conversationId:'notice-conversation',sourceMessageId:'notice-message',
    system:'读取原报告并修复',messages:[{role:'user',content:'修复报告'}],maxSteps:8,maxOutputTokens:128,
    tools:[{name:'artifact.read',version:'1',effect:'none',description:'读取报告',parameters:{type:'object',properties:{}}},
      {name:'tool.result.read',version:'1',effect:'none',description:'分页读取',parameters:z.toJSONSchema(pageParams)},
      {name:'files.write',version:'1',effect:'committed',description:'写报告',parameters:z.toJSONSchema(z.object({path:z.string(),content:z.string()}))}]});
  let requests=0,legacy=true,sourceExecutionId='',pageExecutionId='';
  const supplierBodies:unknown[]=[],generationRequests:Array<{operationKey:string;request:Record<string,unknown>}>=[];
  const originalProjection=receiptProjection.projectReceiptForPi;
  const projectionSpy=vi.spyOn(receiptProjection,'projectReceiptForPi').mockImplementation((outcome,id,ports)=>
    originalProjection(outcome,legacy?(id==='provider-source'?sourceExecutionId:id==='provider-page'?pageExecutionId:id):id,ports));
  const server=createServer((req,res)=>{
    let body='';req.on('data',chunk=>body+=chunk);req.on('end',()=>{
      supplierBodies.push(JSON.parse(body));requests++;
      const proposal=requests===1?{id:'provider-source',name:'artifact_read',arguments:'{}'}
        :requests===2?{id:'provider-page',name:'tool_result_read',arguments:JSON.stringify({toolCallId:sourceExecutionId,offset:12000})}
        :truncated&&requests===3?{id:'provider-truncated',name:'files_write',arguments:'{"path":"douyin-plays.html"}'}
        :truncated&&requests===4?{id:'provider-repaired',name:'files_write',arguments:'{"path":"douyin-plays.html","content":"修复完成"}'}:null;
      const delta=proposal?{...(truncated&&requests===3?{content:'先写新版本到任务目录'}:{}),tool_calls:[{index:0,id:proposal.id,type:'function',function:{name:proposal.name,arguments:proposal.arguments}}]}:{content:'保留原错误回执，继续修复。'};
      const chunks=[{choices:[{index:0,delta,finish_reason:null}]},{choices:[{index:0,delta:{},finish_reason:truncated&&requests===3?'length':proposal?'tool_calls':'stop'}],usage:{prompt_tokens:2,completion_tokens:3,total_tokens:5}}];
      res.writeHead(200,{'content-type':'text/event-stream'});
      res.end(chunks.map(chunk=>`data: ${JSON.stringify({id:'fixture',object:'chat.completion.chunk',created:1,model:'fixture',...chunk})}\n\n`).join('')+'data: [DONE]\n\n');
    });
  });
  await new Promise<void>(resolve=>server.listen(0,'127.0.0.1',resolve));
  try{
    const ctx={userId:input.userId,accountId:input.accountId,requestId:'fixture',source:'user' as const};
    const repo=createAiRepository(f.db,{userId:ctx.userId,accountId:ctx.accountId,now:()=>new Date().toISOString(),nextId:prefix=>`${prefix}-notice`});
    const conversation=await repo.createConversation({title:'旧 notice 恢复',projectId:null,scope:'global'});
    const source=await repo.createMessage(conversation.id,{role:'user',content:'修复报告',attachments:[],modelMetadata:{}});
    const submission=await createChatTurnSubmissionService(f.db,{assemble:async()=>input}).submit(ctx,{conversationId:conversation.id,sourceMessageId:source.id});
    const [task]=await f.db.select().from(executionTasks).where(eq(executionTasks.id,submission.executionTaskId));
    if(!task)throw Error('missing task');
    input=chatWorkerInputSchema.parse((task.payload as {modelInput:unknown}).modelInput);
    const tasks=createPersistentTaskService(f.db);
    const claim=(await tasks.claimTask({taskId:task.id,workerId:'notice-worker'}))!;
    let ref={executionTaskId:task.id,attempt:claim.lease.attempt,fenceToken:claim.lease.fenceToken};
    const ledger=createExecutionCallLedgerService(f.db,{budget}),generation=createExecutionGenerationPorts(f.db,{budget});
    const checkpoints=createExecutionCheckpointService(f.db),streams=createExecutionStreamService(f.db),reader=createChatHostContextReader(f.db);
    const readSource=vi.fn(async()=>({status:'ok' as const,summary:'报告原文',data:{text:escaped?'"\\'.repeat(9000):'原文数据；'.repeat(3200)},evidence:[],error:null,continuation:null,sideEffect:'none' as const}));
    const readPage=vi.fn(async(_ctx:unknown,raw:unknown)=>{
      try{
        return {status:'ok' as const,summary:'分页读取成功',data:z.json().parse(await reader.readToolResult(ref,pageParams.parse(raw))),evidence:[],error:null,continuation:null,sideEffect:'none' as const};
      }catch(error){
        return {status:'error' as const,summary:(error as Error).message,data:null,evidence:[],error:{code:'no_evidence' as const,retryable:false,recovery:'根据已有回执继续'},continuation:null,sideEffect:'none' as const};
      }
    });
    const write=vi.fn(async(_ctx:unknown,raw:unknown)=>({status:'ok' as const,summary:'写入确认',data:z.json().parse(raw),evidence:[],error:null,continuation:null,sideEffect:'committed' as const}));
    const host=createExecutionChatToolPorts(f.db,{budget,tools:{
      'files.write':{version:'1',effect:'committed',parameters:z.object({path:z.string(),content:z.string()}),execute:write,approve:async()=>({status:'not-applicable'})},
      'artifact.read':{version:'1',effect:'none',parameters:z.object({}),execute:readSource,approve:async()=>({status:'not-applicable'})},
      'tool.result.read':{version:'1',effect:'none',parameters:pageParams,execute:readPage,approve:async()=>({status:'not-applicable'})},
    }});
    const stopped=new AbortController(),reserveErrors:string[]=[];
    let seeding=true;
    const ports:ChatWorkerPorts={approve:async(request,signal)=>(await host.check(ref,request,signal)).status as 'not-applicable',call:async(port,data,signal)=>{
      switch(port){
        case 'readCheckpoint':return checkpoints.read(ref);
        case 'saveCheckpoint':{
          // 精确模拟旧 backend 的 invariant 拒绝；模型、工具与费用已经真实持久化。
          if(seeding&&truncated&&(data as {expectedRevision:number}).expectedRevision===4)throw Error('模型结束原因与工具调用回执不一致');
          const saved=await checkpoints.save(ref,data);
          if(seeding&&!truncated&&saved.revision===4)stopped.abort(new Error('FIXTURE_STOP_AFTER_OLD_ERROR_CHECKPOINT'));
          return saved;
        }
        case 'appendStreamEvents':return streams.append(ref,data);
        case 'reserveGenerationCall':{
          generationRequests.push(structuredClone(data) as typeof generationRequests[number]);
          try{return await generation.reserveGenerationCall(ref,data);}catch(error){reserveErrors.push((error as Error).message);throw error;}
        }
        case 'startCall':{const row=await ledger.start(ref,(data as {callId:string}).callId);return {callId:row.id,status:row.status};}
        case 'settleGenerationCall':return generation.settleGenerationCall(ref,data);
        case 'reserveAgenticTool':{
          const row=await host.reserve(ref,data);
          if((data as {toolCallId:string}).toolCallId==='provider-source')sourceExecutionId=row.callId;else pageExecutionId=row.callId;
          return row;
        }
        case 'startAgenticTool':return host.start(ref,data);
        case 'executeAgenticTool':return host.execute(ref,data,signal);
        case 'settleAgenticTool':return host.settle(ref,data);
        default:throw Error(`unbound port ${port}`);
      }
    }};
    const run=(signal:AbortSignal)=>runChatInWorker(input,{apiFormat:'openai_chat',baseUrl:`http://127.0.0.1:${(server.address() as {port:number}).port}/v1`,model:'fixture',token:'fixture'},signal,ports);
    if(truncated)await expect(run(stopped.signal)).rejects.toMatchObject({errorCode:'CHAT_CHECKPOINT_RECEIPT_UNKNOWN',outcome:'unknown_result'});
    else{await expect(run(stopped.signal)).rejects.toBeDefined();expect(stopped.signal.aborted).toBe(true);}
    const before=await ledger.inspect(ref);
    expect(before.calls).toHaveLength(truncated?5:4);expect(before.spentTokens).toBe(truncated?15:10);
    expect((await checkpoints.read(ref))).toMatchObject({revision:4,recovery:truncated?'requires_replay':'ready'});
    expect(JSON.stringify(supplierBodies[1])).toContain(sourceExecutionId);
    expect(JSON.parse(before.calls[3]!.resultText!)).toMatchObject({toolCallId:'provider-page',output:{status:'error',summary:'当前任务没有该已结算工具结果',error:{code:'no_evidence'}}});
    expect(before.calls.every(call=>call.status==='settled')).toBe(true);
    if(truncated){
      expect(write).not.toHaveBeenCalled();
      await createExecutionWorkerOutcomeService(f.db).recordFailure(ref,{outcome:'failed',errorCode:'WORKER_EXECUTION_INTERRUPTED'});
      await tasks.command(ctx,{taskIds:[task.id],command:'retry',idempotencyKey:'same-id-repair'});
      const resumedClaim=(await tasks.claimTask({taskId:task.id,workerId:'repaired-worker'}))!;
      expect(resumedClaim.task.id).toBe(task.id);
      ref={executionTaskId:task.id,attempt:resumedClaim.lease.attempt,fenceToken:resumedClaim.lease.fenceToken};
      expect(ref.attempt).toBe(claim.lease.attempt+1);
    }
    legacy=preserveLegacy;seeding=false;
    const resumed=await run(AbortSignal.timeout(15000)).then(result=>({result,error:undefined}),error=>({result:undefined,error}));
    const after=await ledger.inspect(ref);
    // 无论恢复是否成功，前序账本的身份、结算用量和错误回执必须逐字不变。
    expect(after.calls.slice(0,before.calls.length)).toEqual(before.calls);
    expect(readSource).toHaveBeenCalledTimes(1);expect(readPage).toHaveBeenCalledTimes(1);
    const model2=generationRequests.filter(request=>request.operationKey.endsWith('/model/2'));
    expect(model2).toHaveLength(2);
    const digest=(request:unknown)=>`sha256:${createHash('sha256').update(JSON.stringify(request)).digest('hex')}`;
    expect(digest(model2[0]!.request)).toBe(before.calls[2]!.inputDigest);
    expect(model2[1]!.request).toEqual(model2[0]!.request);
    expect(digest(model2[1]!.request)).toBe(before.calls[2]!.inputDigest);
    expect({reserveErrors,error:resumed.error?.message,requests,calls:after.calls.length,spentTokens:after.spentTokens}).toEqual({reserveErrors:[],error:undefined,requests:truncated?5:3,calls:truncated?9:5,spentTokens:truncated?25:15});
    expect(resumed.result?.outcome).toBe('completed');
    expect(JSON.stringify(supplierBodies[truncated?3:2])).toContain('当前任务没有该已结算工具结果');
    if(!preserveLegacy){
      const texts=(value:unknown):string[]=>typeof value==='string'?[value]:Array.isArray(value)?value.flatMap(texts):value&&typeof value==='object'?Object.values(value).flatMap(texts):[];
      expect(texts(supplierBodies[truncated?3:2]).some(value=>/toolCallId=\\*"provider-source\\*"/.test(value))).toBe(true);
    }
    if(truncated){
      const model3=generationRequests.filter(request=>request.operationKey.endsWith('/model/3'));
      expect(model3).toHaveLength(2);expect(model3[1]).toEqual(model3[0]);
      expect(write).toHaveBeenCalledTimes(1);
      expect(write.mock.calls[0]![1]).toEqual({path:'douyin-plays.html',content:'修复完成'});
      expect(JSON.parse(after.calls[5]!.resultText!)).toMatchObject({toolCallId:'provider-truncated',output:{status:'error',sideEffect:'none',error:{code:'invalid_input'}}});
      const last=resumed.result!;
      await expect(createChatTurnCompletionService(f.db).commitResult(ref,{lastModelCallId:last.lastModelCallId,toolCallIds:last.toolCallIds})).resolves.toMatchObject({outcome:'succeeded'});
      const [done]=await f.db.select().from(executionTasks).where(eq(executionTasks.id,task.id));
      expect(done!.status).toBe('succeeded');
    }
  }finally{
    projectionSpy.mockRestore();server.closeAllConnections();await new Promise<void>(resolve=>server.close(()=>resolve()));await f.client.close();
  }
},20000);

it('checkpoint 只提供本任务的有界模型指纹，不暴露请求正文且不能跨租约读取',async()=>{
 const f=await createDb();
 try{
  const tasks=createPersistentTaskService(f.db),budget={maxCalls:10,maxTokens:1000,deadlineMs:60000};
  const ledger=createExecutionCallLedgerService(f.db,{budget}),checkpoints=createExecutionCheckpointService(f.db);
  const make=async(accountId:string)=>{
   const input=chatWorkerInputSchema.parse({kind:'chat.run',executionEngine:'pi',operationKey:`chat:${accountId}`,capability:'copilot.assist',userId:'owner',accountId,conversationId:'c',sourceMessageId:'m',system:'私有正文不得出现在指纹中',messages:[{role:'user',content:'私有正文'}],maxSteps:2,maxOutputTokens:128,tools:[]});
   const task=await tasks.enqueue({userId:'owner',accountId,requestId:accountId,source:'user'},{kind:'ai_task',ownerType:'ai_task',ownerId:accountId,idempotencyKey:accountId,payload:{modelInput:input}});
   const claim=(await tasks.claimTask({taskId:task.id,workerId:'fixture'}))!;
   const ref={executionTaskId:task.id,attempt:claim.lease.attempt,fenceToken:claim.lease.fenceToken};
   const call=await ledger.reserve(ref,{kind:'model',operationKey:`chat:${accountId}/model/1`,inputDigest:'sha256:'+'a'.repeat(64),reservedTokens:128});
   return {ref,call};
  };
  const own=await make('own'),foreign=await make('foreign');
  const state=await checkpoints.read(own.ref);
  expect(state.modelReplayFingerprints).toEqual([{callId:own.call.id,operationKey:'chat:own/model/1',inputDigest:own.call.inputDigest,status:'reserved'}]);
  expect(JSON.stringify(state.modelReplayFingerprints)).not.toContain('私有正文');
  expect((await checkpoints.read(foreign.ref)).modelReplayFingerprints[0]!.callId).toBe(foreign.call.id);
  await expect(checkpoints.read({...own.ref,executionTaskId:foreign.ref.executionTaskId})).rejects.toThrow();
  const {chatModelReplayFingerprintsSchema}=await import('@creatoros/contract/execution-worker');
  expect(chatModelReplayFingerprintsSchema.safeParse(Array(10001).fill(state.modelReplayFingerprints[0])).success).toBe(false);
 }finally{await f.client.close();}
},15000);
