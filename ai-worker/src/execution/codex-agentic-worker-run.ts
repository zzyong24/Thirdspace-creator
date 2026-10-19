import {mkdtemp,rm} from 'node:fs/promises';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {z} from 'zod';
import type {Context} from '@earendil-works/pi-ai';
import {agenticWorkerInputSchema,type CodexModelSpec,type WorkerPort,workerReservationSchema,workerStartReceiptSchema,agenticToolReservationSchema,agenticToolOutcomeSchema,workerProviderReceiptSchema,checkpointToolCallSchema,workerToolResultReceiptSchema,workerUsageSchema,chatToolProviderName} from '@creatoros/contract/execution-worker';
import {createControlledCodexSession,CodexHostError} from './codex-app-server';
import {runCodexNativeTurn,recoverCodexNativeTurn} from './codex-native-turn';
import {runDurableAgenticTool} from './durable-agentic-tool';
import {normalizePiContext} from './durable-pi-stream';
import {GenerationFailure} from './generation-error';
import type {ResearchToolExecutor} from './research-worker-tools';
type Call=(port:WorkerPort,data:unknown,signal?:AbortSignal)=>Promise<unknown>;
const bindingSchema=z.object({observedUsage:workerUsageSchema.optional(),threadId:z.string().min(1),turnId:z.string().min(1),tools:z.record(z.string(),z.object({toolCallId:z.string().min(1),toolName:z.string().min(1),input:z.string()}).passthrough()).default({})});
const checkpointSchema=z.object({revision:z.number().int().nonnegative(),ledgerSequence:z.number().int().nonnegative(),messages:z.array(z.object({role:z.enum(['assistant','tool']),callId:z.string(),resultText:z.string().nullable().optional()})),uncheckpointedReceipts:z.array(z.object({kind:z.enum(['model','tool']),callId:z.string(),sequence:z.number().int().positive(),resultText:z.string().nullable().optional()})),budget:z.object({maxCalls:z.number().int().positive().nullable(),maxTokens:z.number().int().positive().nullable()}),knownSpentTokens:z.number().nonnegative().default(0),acknowledgedBlockedCallIds:z.array(z.string()).default([])});
/** Codex拥有官方回合循环；工具与候选仍由原Host按真实账本校验。 */
export async function runCodexAgenticInWorker(input:z.infer<typeof agenticWorkerInputSchema>,spec:CodexModelSpec,parentSignal:AbortSignal,call:Call,onText?:(text:string)=>void,research?:ResearchToolExecutor){
 const providerNames=new Map<string,string>();
 for(const tool of input.tools){const name=chatToolProviderName(tool.name);if(providerNames.has(name))throw new GenerationFailure('failed','CODEX_TOOL_NAME_COLLISION');providerNames.set(name,tool.name);}
 const initial=checkpointSchema.parse(await call('readCheckpoint',{},parentSignal));
 const context={systemPrompt:input.systemPrompt,messages:[{role:'user',content:[{type:'text',text:input.goal}],timestamp:0}],tools:input.tools.map(tool=>({name:tool.name,description:tool.description,parameters:tool.parameters}))} as Context;
 const reservation=workerReservationSchema.parse(await call('reserveAgenticModel',{request:normalizePiContext(context),maxOutputTokens:input.maxOutputTokens},parentSignal));
 const callId=reservation.callId;
 async function finish(receipt:z.infer<typeof workerProviderReceiptSchema>){
  parentSignal.throwIfAborted();
  const current=checkpointSchema.parse(await call('readCheckpoint',{},parentSignal));
  const messages=[...current.messages.map(({role,callId})=>({role,callId}))],seen=new Set(messages.map(m=>m.callId));
  for(const row of [...current.uncheckpointedReceipts].sort((a,b)=>a.sequence-b.sequence))if(!seen.has(row.callId)){messages.push({role:row.kind==='model'?'assistant':'tool',callId:row.callId});seen.add(row.callId);}
  const actualTools=[...current.messages.filter(m=>m.role==='tool'),...current.uncheckpointedReceipts.filter(r=>r.kind==='tool')];
  const toolCallIds=[...new Set(actualTools.map(t=>t.callId))];
  const canonicalTools=receipt.content.filter(part=>part&&typeof part==='object'&&!Array.isArray(part)&&part.type==='tool-call').map(part=>checkpointToolCallSchema.parse(part));
  const confirmed=new Set(actualTools.map(row=>{const parsed=workerToolResultReceiptSchema.parse(JSON.parse(row.resultText??'null'));return JSON.stringify([parsed.toolCallId,parsed.toolName]);}));
  if(canonicalTools.some(tool=>!confirmed.has(JSON.stringify([tool.toolCallId,tool.toolName])))||canonicalTools.length!==toolCallIds.length)throw new GenerationFailure('unknown_result','CODEX_AGENT_TOOL_RECEIPT_MISSING');
  if(messages.length!==current.messages.length){const saved=z.object({revision:z.number().int().positive()}).parse(await call('saveCheckpoint',{expectedRevision:current.revision,expectedLedgerSequence:current.ledgerSequence,messages},parentSignal));if(saved.revision!==current.revision+1)throw new GenerationFailure('unknown_result','CODEX_AGENT_CHECKPOINT_UNKNOWN');}
  const summary=receipt.content.filter(part=>part&&typeof part==='object'&&!Array.isArray(part)&&part.type==='text').map(part=>(part as {text:string}).text).join('\n').slice(0,10000);
  return {summary,stopReason:'completed' as const,lastModelCallId:callId,toolCallIds,actualEngine:'codex' as const};
 }
 if(reservation.status==='settled'){
  if(!reservation.providerResult)throw new GenerationFailure('unknown_result','CODEX_AGENT_SETTLED_RECEIPT_MISSING');
  return finish(workerProviderReceiptSchema.parse(reservation.providerResult));
 }
 if(!['reserved','started','unknown'].includes(reservation.status))throw new GenerationFailure('unknown_result','CODEX_AGENT_CALL_UNKNOWN');
 // 已启动但未记下thread/turn仍然是未知事实，绝不以新回合替换。
 const recovering=reservation.status!=='reserved';
 const savedBinding=recovering?bindingSchema.safeParse(await call('readCodexCall',{callId},parentSignal)):undefined;
 if(savedBinding&&!savedBinding.success)throw new GenerationFailure('unknown_result','CODEX_AGENT_BINDING_UNKNOWN');
 const stop=new AbortController(),signal=AbortSignal.any([parentSignal,stop.signal]);
 let cwd:string|undefined,session:Awaited<ReturnType<typeof createControlledCodexSession>>|undefined,started=recovering,failure:GenerationFailure|undefined;
 try{
  cwd=await mkdtemp(join(tmpdir(),'creatoros-codex-agentic-'));
  session=await createControlledCodexSession(cwd,signal,undefined,false,true,true);
  if(!recovering&&!session.authenticated)throw new CodexHostError('CODEX_LOGIN_REQUIRED');
  if(!recovering){const start=workerStartReceiptSchema.parse(await call('startCall',{callId},signal));if(start.callId!==callId)throw new GenerationFailure('unknown_result','CODEX_AGENT_START_UNKNOWN');started=true;}
  const result=recovering?await recoverCodexNativeTurn(session.rpc,savedBinding!.data!.threadId,savedBinding!.data!.turnId,signal):await runCodexNativeTurn({rpc:session.rpc,mcpNames:session.mcpNames,cwd,signal,prompt:JSON.stringify({system:input.systemPrompt,goal:input.goal}),model:spec.requestedModel,
   tools:input.tools.map(tool=>({name:chatToolProviderName(tool.name),description:tool.description,inputSchema:tool.parameters})),
   onThread:async threadId=>{await call('bindCodexCall',{callId,threadId},signal);},onTurn:async turnId=>{await call('bindCodexCall',{callId,turnId},signal);},onAdmission:async()=>{},onText,
   onUsage:async usage=>{await call('bindCodexCall',{callId,observedUsage:{inputTokens:usage.inputTokens??undefined,outputTokens:usage.outputTokens??undefined,totalTokens:usage.totalTokens??undefined}});if(initial.budget.maxTokens!==null&&usage.totalTokens!==null&&initial.knownSpentTokens+usage.totalTokens>initial.budget.maxTokens){failure=new GenerationFailure('unknown_result','CODEX_TOKEN_BUDGET_EXHAUSTED');stop.abort();}},
   onTool:async(toolCallId,providerName,args)=>{
    const toolName=providerNames.get(providerName);if(!toolName)throw new CodexHostError('CODEX_TOOL_UNAVAILABLE');
    try{
     await call('recordCodexToolCall',{callId,toolCallId,toolName,input:JSON.stringify(args)},signal);
     let ownedCall:string|undefined;
     const outcome=await runDurableAgenticTool({modelCallId:callId,toolCallId},{signal,call:async(port,data,s)=>{const value=await call(port,data,s);if(port==='reserveAgenticTool')ownedCall=agenticToolReservationSchema.parse(value).callId;return value;},execute:async(name,_args,s)=>{
      if(!ownedCall)throw new CodexHostError('CODEX_TOOL_CALL_MISSING');
      const tool=input.tools.find(x=>x.name===name);
      if(input.dryRun&&tool?.effect!=='none')return agenticToolOutcomeSchema.parse({status:'ok',summary:`预演：${name}`,evidence:[],data:{plan:{toolName:name,input:_args}},error:null,continuation:null,sideEffect:'none'});
      if(research&&['web.search','web.read','browser.observe','browser.act'].includes(name))return research.execute(name,_args,{callId:ownedCall,signal:s});
      return agenticToolOutcomeSchema.parse(await call('executeAgenticTool',{callId:ownedCall},s));
     }});
     if(!ownedCall)throw new GenerationFailure('unknown_result','CODEX_TOOL_RECEIPT_MISSING');
     if(!initial.acknowledgedBlockedCallIds.includes(ownedCall)){
      if(outcome.error?.code==='needs_login'||outcome.error?.code==='captcha')throw new GenerationFailure('waiting_user',outcome.error.code==='captcha'?'RESEARCH_CAPTCHA_REQUIRED':'RESEARCH_LOGIN_REQUIRED');
      if(outcome.status==='blocked'&&outcome.data&&typeof outcome.data==='object'&&!Array.isArray(outcome.data)&&outcome.data.recoveryState==='browser_runtime_unavailable')throw new GenerationFailure('waiting_user','RESEARCH_BROWSER_UNAVAILABLE');
     }
     return {text:JSON.stringify(outcome),success:outcome.status==='ok'||outcome.status==='partial'};
    }catch(error){failure=error instanceof GenerationFailure?error:new GenerationFailure('unknown_result','CODEX_AGENT_TOOL_UNKNOWN');stop.abort();throw failure;}
   }});
  if(failure)throw failure;signal.throwIfAborted();
  const binding=bindingSchema.parse(await call('readCodexCall',{callId},signal));
  if(binding.threadId!==result.sessionId||binding.turnId!==result.providerTurnId)throw new GenerationFailure('unknown_result','CODEX_AGENT_RESULT_SCOPE_MISMATCH');
  // 全回合工具事实投影到既有canonical账本；raw仍保存官方completed，不伪造另一轮模型调用。
  const tools=Object.values(binding.tools).map(tool=>checkpointToolCallSchema.parse({type:'tool-call',toolCallId:tool.toolCallId,toolName:tool.toolName,input:tool.input}));
  const observed=binding.observedUsage;const u=result.usage??(observed?{inputTokens:observed.inputTokens??null,outputTokens:observed.outputTokens??null,totalTokens:observed.totalTokens??null,cachedReadTokens:observed.inputTokenDetails?.cacheReadTokens??null,thoughtTokens:observed.outputTokenDetails?.reasoningTokens??null}:null),receipt=workerProviderReceiptSchema.parse({content:[...tools,{type:'text',text:result.text}],finishReason:{unified:tools.length?'tool-calls':'stop',raw:'completed'},usage:{inputTokens:{total:u?.inputTokens??undefined,cacheRead:u?.cachedReadTokens??undefined},outputTokens:{total:u?.outputTokens??undefined,reasoning:u?.thoughtTokens??undefined}},warnings:[],providerMetadata:{codex:{threadId:result.sessionId,turnId:result.providerTurnId,model:result.model??null,modelProvider:result.modelProvider??null,completionStatus:'completed',projection:'native-turn-v1'}}});
  const settled=z.object({callId:z.string(),status:z.string()}).parse(await call('settleGenerationCall',{callId,status:'settled',providerResult:receipt,usage:{inputTokens:u?.inputTokens??undefined,outputTokens:u?.outputTokens??undefined,totalTokens:u?.totalTokens??undefined}}));
  if(settled.callId!==callId||settled.status!=='settled')throw new GenerationFailure('unknown_result','CODEX_AGENT_SETTLEMENT_UNKNOWN');
  return await finish(receipt);
 }catch(error){
  await call('settleGenerationCall',started?{callId,status:'unknown'}:{callId,status:'rejected'}).catch(()=>{});
  if(failure)throw failure;
  if(error instanceof GenerationFailure)throw error;
  throw new GenerationFailure(started?'unknown_result':'waiting_user',error instanceof CodexHostError?error.code:'CODEX_AGENT_RESULT_UNKNOWN');
 }finally{await session?.rpc.close();if(cwd)await rm(cwd,{recursive:true,force:true});}
}
