import {setTimeout as realDelay} from 'node:timers/promises';
import {afterEach,expect,it,vi} from 'vitest';
import type {LanguageModelV4StreamPart} from '@ai-sdk/provider';
import {createPiProviderModel} from '../runtime/pi-provider';
import {runChatPiLoop} from '../runtime/chat/chat-pi-loop';
import {createDurableStreamModel} from './durable-stream-model';
import type {DurableGenerationPorts} from './durable-generation-model';

// 只旁观真实 Pi SSE 解析结果，不替换供应商解析、SDK 或 durable 行为。
const parsed=vi.hoisted(()=>({deltas:[] as string[]}));
vi.mock('@earendil-works/pi-ai/api/anthropic-messages',async importOriginal=>{
 const actual=await importOriginal<typeof import('@earendil-works/pi-ai/api/anthropic-messages')>();
 return {...actual,stream:(...args:Parameters<typeof actual.stream>)=>{
  const source=actual.stream(...args),iterate=source[Symbol.asyncIterator].bind(source);
  source[Symbol.asyncIterator]=async function*(){for await(const event of {[Symbol.asyncIterator]:iterate}){
   if(event.type==='toolcall_delta')parsed.deltas.push(event.delta);yield event;
  }};
  return source;
 }};
});

afterEach(()=>{vi.useRealTimers();vi.unstubAllGlobals();vi.restoreAllMocks();});
async function until(predicate:()=>boolean){
 for(let n=0;n<400;n++){if(predicate())return;await realDelay(5);}
 throw new Error('FIXTURE_PROGRESS_NOT_OBSERVED');
}
async function fixture(){
 parsed.deltas=[];
 let wire!:ReadableStreamDefaultController<Uint8Array>,requests=0,firstText=false,terminal:unknown;
 const encoder=new TextEncoder(),controller=new AbortController(),parts:LanguageModelV4StreamPart[]=[],settlements:Array<Parameters<DurableGenerationPorts['settle']>[1]>=[];
 const emit=(value:Record<string,unknown>)=>wire.enqueue(encoder.encode(`event: ${value.type}\ndata: ${JSON.stringify(value)}\n\n`));
 const start=()=>emit({type:'message_start',message:{id:'message-1',type:'message',role:'assistant',model:'fixture',content:[],stop_reason:null,stop_sequence:null,usage:{input_tokens:10,output_tokens:0}}});
 const text=(value:string)=>{emit({type:'content_block_start',index:0,content_block:{type:'text',text:''}});emit({type:'content_block_delta',index:0,delta:{type:'text_delta',text:value}});emit({type:'content_block_stop',index:0});};
 const finish=(reason:string)=>{emit({type:'message_delta',delta:{stop_reason:reason,stop_sequence:null},usage:{output_tokens:12}});emit({type:'message_stop'});wire.close();};
 vi.stubGlobal('fetch',vi.fn(async(_url:unknown,init?:RequestInit)=>{
  requests++;
  const body=new ReadableStream<Uint8Array>({start(c){wire=c;},cancel(){}});
  init?.signal?.addEventListener('abort',()=>{try{wire.error(init.signal!.reason);}catch{}},{once:true});
  start();text(requests===1?'正在准备工具输入。':'完成');
  if(requests===1)emit({type:'content_block_start',index:1,content_block:{type:'tool_use',id:'tool-1',name:'write',input:{}}});
  else finish('end_turn');
  return new Response(body,{status:200,headers:{'content-type':'text/event-stream'}});
 }));
 let release!:()=>void,settling=false,confirmed=false,reservations=0;
 const settlementGate=new Promise<void>(resolve=>{release=resolve;});
 const dispatch=vi.fn(async(_name:string,_input:unknown,_options:{toolCallId:string})=>{expect(confirmed).toBe(true);return {ok:true};});
 const model=createDurableStreamModel({model:createPiProviderModel({apiFormat:'anthropic',baseUrl:'https://isolated.invalid',model:'fixture',token:'fixture-token'}),operationKey:'original-task',signal:controller.signal,
  streamEvents:()=>({async push(part){parts.push(part);},async close(){}}),
  ports:{async reserve(){return {callId:`model-${++reservations}`,status:'reserved'};},async start(){},async settle(id,input){
   settlements.push(input);if(id==='model-1'&&input.status==='settled'){settling=true;await settlementGate;confirmed=true;}
  }},
 });
 const run=runChatPiLoop({model,system:'执行给定工具后说明结果',messages:[{role:'user',content:'写入固定内容'}],definitions:[{name:'write',description:'隔离写入探针',parameters:{type:'object',properties:{content:{type:'string'}},required:['content'],additionalProperties:false}}],
  execute:dispatch,approve:async()=> 'approved',approvalId:()=> 'approval',signal:controller.signal,maxOutputTokens:128,messageId:'liveness',onChunk:async chunk=>{if(chunk.type==='text-delta')firstText=true;},
 }).then(value=>{terminal={ok:true,value};},error=>{terminal={ok:false,error};});
 await until(()=>firstText||terminal!==undefined);expect(terminal).toBeUndefined();
 return {run,emit,finish,parts,settlements,dispatch,release,controller,terminal:()=>terminal,settling:()=>settling,requests:()=>requests,
  delta:(partial_json:string,index=1)=>emit({type:'content_block_delta',index,delta:{type:'input_json_delta',partial_json}}),
  startSecond:()=>emit({type:'content_block_start',index:2,content_block:{type:'tool_use',id:'tool-2',name:'write',input:{}}}),
  endTool:(index=1)=>emit({type:'content_block_stop',index}),
  disconnect:()=>wire.error(new Error('ISOLATED_STREAM_INTERRUPTED'))};
}

it('真实Pi→SDK→durable→chat：持续工具参数delta跨180秒不误杀，finish及结算确认前不派发',async()=>{
 vi.useFakeTimers({toFake:['setTimeout','clearTimeout','Date']});
 const f=await fixture();
 try{
  f.delta('{"content":"');await until(()=>parsed.deltas.includes('{"content":"'));await realDelay(20);
  for(const chunk of ['a','b','c','d']){
   await vi.advanceTimersByTimeAsync(60_000);await realDelay(20);
   expect(f.terminal(),`持续参数流在虚拟时间${Date.now()}误终止`).toBeUndefined();
   f.delta(chunk);await until(()=>parsed.deltas.includes(chunk));await realDelay(20);expect(f.dispatch).not.toHaveBeenCalled();
  }
  f.delta('"}');f.endTool();await until(()=>f.parts.some(part=>part.type==='tool-input-end'));
  expect(f.dispatch).not.toHaveBeenCalled();expect(f.settlements).toEqual([]);
  f.finish('tool_use');await until(f.settling);expect(f.dispatch).not.toHaveBeenCalled();
  const receipt=f.settlements[0]!;expect(receipt.status).toBe('settled');
  if(receipt.status==='settled'){
   expect(receipt.providerResult.content).toEqual([{type:'text',text:'正在准备工具输入。'},
    {type:'tool-call',toolCallId:'tool-1',toolName:'write',input:'{"content":"abcd"}'}]);
  }
  f.release();await f.run;expect(f.terminal()).toMatchObject({ok:true});expect(f.dispatch).toHaveBeenCalledTimes(1);expect(f.requests()).toBe(2);
 }finally{f.release();f.controller.abort();await f.run;}
},10_000);

it('顺序双tool：首tool完整后第二tool持续参数跨180秒，两个调用均等整模型结算后各执行一次',async()=>{
 vi.useFakeTimers({toFake:['setTimeout','clearTimeout','Date']});
 const f=await fixture();
 try{
  f.delta('{"content":"first"}');f.endTool();await until(()=>f.parts.some(part=>part.type==='tool-call'));
  f.startSecond();f.delta('{"content":"',2);await until(()=>parsed.deltas.includes('{"content":"'));await realDelay(20);
  for(const chunk of ['a','b','c','d']){
   await vi.advanceTimersByTimeAsync(60_000);await realDelay(20);
   expect(f.terminal(),'第二tool仍持续输入但被idle误杀').toBeUndefined();
   f.delta(chunk,2);await until(()=>parsed.deltas.includes(chunk));await realDelay(20);expect(f.dispatch).not.toHaveBeenCalled();
  }
  f.delta('"}',2);f.endTool(2);await until(()=>f.parts.filter(part=>part.type==='tool-call').length===2);
  expect(f.dispatch).not.toHaveBeenCalled();expect(f.settlements).toEqual([]);
  f.finish('tool_use');await until(f.settling);expect(f.dispatch).not.toHaveBeenCalled();
  const receipt=f.settlements[0]!;expect(receipt.status).toBe('settled');
  if(receipt.status==='settled'){
   expect(receipt.providerResult.content).toEqual([{type:'text',text:'正在准备工具输入。'},
    {type:'tool-call',toolCallId:'tool-1',toolName:'write',input:'{"content":"first"}'},
    {type:'tool-call',toolCallId:'tool-2',toolName:'write',input:'{"content":"abcd"}'}]);
   expect(receipt.providerResult.stream?.parts).toEqual(JSON.parse(JSON.stringify(f.parts)));
   expect(receipt.providerResult.usage).toMatchObject({inputTokens:{total:10},outputTokens:{total:12}});
  }
  f.release();await f.run;expect(f.terminal()).toMatchObject({ok:true});expect(f.dispatch).toHaveBeenCalledTimes(2);expect(f.requests()).toBe(2);
  expect(f.dispatch.mock.calls.map(args=>(args[2] as {toolCallId:string}).toolCallId)).toEqual(['tool-1','tool-2']);
 }finally{f.release();f.controller.abort();await f.run;}
},10_000);

it('空字符串tool参数delta不能持续刷新180秒空闲期限',async()=>{
 vi.useFakeTimers({toFake:['setTimeout','clearTimeout','Date']});
 const f=await fixture();
 try{
  f.delta('{"content":"');await until(()=>parsed.deltas.length===1);await realDelay(20);
  for(let n=1;n<=2;n++){
   await vi.advanceTimersByTimeAsync(60_000);f.delta('');await until(()=>parsed.deltas.length===n+1);await realDelay(20);
  }
  await vi.advanceTimersByTimeAsync(60_001);await realDelay(20);
  expect(f.terminal()).toMatchObject({ok:false,error:{message:'CHAT_MODEL_IDLE_TIMEOUT'}});
  expect(f.dispatch).not.toHaveBeenCalled();expect(f.requests()).toBe(1);
 }finally{f.release();f.controller.abort();await f.run;}
});

it.each(['partial_disconnect','partial_cancel','ended_disconnect','ended_cancel','double_disconnect','double_cancel'] as const)('真实参数流%s不派发工具或保存半成canonical回执',async mode=>{
 const f=await fixture();
 try{
  f.delta(mode.startsWith('partial')?'{"content":"unfinished':'{"content":"complete"}');
  await until(()=>parsed.deltas.length===1);
  if(!mode.startsWith('partial')){f.endTool();await until(()=>f.parts.some(part=>part.type==='tool-call'));}
  if(mode.startsWith('double')){f.startSecond();f.delta('{"content":"unfinished',2);await until(()=>parsed.deltas.length===2);}
  expect(f.dispatch).not.toHaveBeenCalled();expect(f.settlements).toEqual([]);
  if(mode.endsWith('cancel'))f.controller.abort();else f.disconnect();
  await f.run;expect(f.terminal()).toMatchObject({ok:false});expect(f.dispatch).not.toHaveBeenCalled();
  expect(f.requests()).toBe(1);expect(f.settlements.length).toBeGreaterThan(0);
  expect(f.settlements.every(receipt=>receipt.status!=='settled'&&!('providerResult' in receipt))).toBe(true);
 }finally{f.release();f.controller.abort();await f.run;}
});
