import {createServer} from 'node:http';
import {it,expect,vi} from 'vitest';
import {createPiProviderModel} from './pi-provider';
it.each([false,true])('真实OpenAI晚到tool身份保留原完整调用；身份前已有参数=%s',async earlyArguments=>{
 const server=createServer((req,res)=>{
  req.resume();res.writeHead(200,{'content-type':'text/event-stream'});
  const emit=(delta:unknown)=>res.write(`data: ${JSON.stringify({id:'message',object:'chat.completion.chunk',model:'fixture',choices:[{index:0,delta,finish_reason:null}]})}\n\n`);
  emit({role:'assistant',tool_calls:[{index:0}]});
  setTimeout(()=>{
   emit({tool_calls:[{index:0,...(earlyArguments?{}:{id:'late-id',type:'function'}),function:{...(earlyArguments?{}:{name:'write'}),arguments:'{"content":"'}}]});
   setTimeout(()=>{
    emit({tool_calls:[{index:0,id:'late-id',type:'function',function:{name:'write',arguments:'晚到"}'}}]});
    res.end(`data: ${JSON.stringify({id:'message',object:'chat.completion.chunk',model:'fixture',choices:[{index:0,delta:{},finish_reason:'tool_calls'}],usage:{prompt_tokens:2,completion_tokens:3,total_tokens:5}})}\n\ndata: [DONE]\n\n`);
   },20);
  },20);
 });
 await new Promise<void>(r=>server.listen(0,'127.0.0.1',r));const controller=new AbortController();
 try{
  const model=createPiProviderModel({apiFormat:'openai_chat',baseUrl:`http://127.0.0.1:${(server.address() as {port:number}).port}/v1`,model:'fixture',token:'fixture'});
  const result=await model.doStream({prompt:[{role:'user',content:[{type:'text',text:'写入'}]}],maxOutputTokens:128,abortSignal:controller.signal,
   tools:[{type:'function',name:'write',inputSchema:{type:'object',properties:{content:{type:'string'}}}}]});
  const reader=result.stream.getReader(),parts=[];while(true){const next=await reader.read();if(next.done)break;parts.push(next.value);}
  expect(parts.filter(part=>part.type==='tool-call')).toEqual([{type:'tool-call',toolCallId:'late-id',toolName:'write',input:'{"content":"晚到"}'}]);
  if(earlyArguments)expect(parts.some(part=>part.type.startsWith('tool-input'))).toBe(false);
  else{
   expect(parts.filter(part=>part.type==='tool-input-start')).toEqual([{type:'tool-input-start',id:'late-id',toolName:'write'}]);
   expect(parts.filter(part=>part.type==='tool-input-delta').map(part=>part.delta).join('')).toBe('{"content":"晚到"}');
   expect(parts.filter(part=>part.type==='tool-input-end')).toEqual([{type:'tool-input-end',id:'late-id'}]);
  }
 }finally{controller.abort();server.closeAllConnections();await new Promise<void>(r=>server.close(()=>r()));}
});
it('真实HTTP工具参数事件使用同一provider身份并原样透传，完整调用只在end出现',async()=>{
 let finish!:()=>void,requests=0;
 const server=createServer((req,res)=>{
  requests++;req.resume();res.writeHead(200,{'content-type':'text/event-stream'});
  const emit=(value:Record<string,unknown>)=>res.write(`event: ${value.type}\ndata: ${JSON.stringify(value)}\n\n`);
  emit({type:'message_start',message:{id:'message',type:'message',role:'assistant',model:'fixture',content:[],stop_reason:null,stop_sequence:null,usage:{input_tokens:2,output_tokens:0}}});
  emit({type:'content_block_start',index:0,content_block:{type:'tool_use',id:'provider-owned',name:'write',input:{}}});
  emit({type:'content_block_delta',index:0,delta:{type:'input_json_delta',partial_json:'{"content":"'}});
  emit({type:'content_block_delta',index:0,delta:{type:'input_json_delta',partial_json:'中文"}'}});
  finish=()=>{emit({type:'content_block_stop',index:0});emit({type:'message_delta',delta:{stop_reason:'tool_use',stop_sequence:null},usage:{output_tokens:3}});emit({type:'message_stop'});res.end();};
 });
 await new Promise<void>(r=>server.listen(0,'127.0.0.1',r));
 const controller=new AbortController();
 try{
  const model=createPiProviderModel({apiFormat:'anthropic',baseUrl:`http://127.0.0.1:${(server.address() as {port:number}).port}`,model:'fixture',token:'fixture'});
  const result=await model.doStream({prompt:[{role:'user',content:[{type:'text',text:'写入'}]}],maxOutputTokens:128,abortSignal:controller.signal,
   tools:[{type:'function',name:'write',inputSchema:{type:'object',properties:{content:{type:'string'}}}}]});
  const reader=result.stream.getReader(),parts=[];
  while(parts.filter(part=>part.type==='tool-input-delta').length<2){const next=await reader.read();expect(next.done).toBe(false);if(next.done)break;parts.push(next.value);}
  expect(parts).toEqual([{type:'stream-start',warnings:[]},{type:'tool-input-start',id:'provider-owned',toolName:'write'},
   {type:'tool-input-delta',id:'provider-owned',delta:'{"content":"'},{type:'tool-input-delta',id:'provider-owned',delta:'中文"}'}]);
  finish();while(true){const next=await reader.read();if(next.done)break;parts.push(next.value);}
  expect(parts[4]).toEqual({type:'tool-input-end',id:'provider-owned'});
  expect(parts[5]).toMatchObject({type:'tool-call',toolCallId:'provider-owned',toolName:'write',input:'{"content":"中文"}'});
  expect(parts.at(-1)).toMatchObject({type:'finish',finishReason:{unified:'tool-calls'}});expect(requests).toBe(1);
 }finally{controller.abort();server.closeAllConnections();await new Promise<void>(r=>server.close(()=>r()));}
});
it.each([401,'disconnect'] as const)('正式模型适配器记录失败诊断且不自行重发：%s',async status=>{
 let requests=0;const log=vi.spyOn(console,'warn').mockImplementation(()=>{});
 const server=createServer((req,res)=>{requests++;req.resume();if(status==='disconnect'){req.socket.destroy();return;}res.writeHead(status,{'content-type':'application/json'});res.end(JSON.stringify({type:'error',error:{type:'authentication_error',message:'invalid fixture-secret'}}));});
 await new Promise<void>(r=>server.listen(0,'127.0.0.1',r));
 try{
  const baseUrl=`http://127.0.0.1:${(server.address() as {port:number}).port}`;
  const model=createPiProviderModel({apiFormat:'anthropic',baseUrl,model:'fixture',token:'fixture-secret'});
  await expect(model.doStream({prompt:[{role:'user',content:[{type:'text',text:'test'}]}],maxOutputTokens:128,abortSignal:AbortSignal.timeout(5000)})).rejects.toThrow();
  expect(requests).toBe(1);expect(log).toHaveBeenCalled();expect(JSON.stringify(log.mock.calls)).not.toContain('fixture-secret');
  expect(JSON.stringify(log.mock.calls)).toContain(status===401?'status=401':'output=false');
 }finally{log.mockRestore();server.closeAllConnections();await new Promise<void>(r=>server.close(()=>r()));}
});
