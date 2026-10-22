// @vitest-environment node
import {expect,it,vi} from 'vitest';
import {mkdtemp,rm} from 'node:fs/promises';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {createServer} from 'node:http';
import {ENDPOINTS,type Endpoint,type RequestContext} from '@creatoros/contract';
import {configureModelFixture} from '@/test/configure-model-fixture';
// 仅选择本候选源码正式编译的原worker文件；不替换模型resolver或业务owner。
vi.mock('@/server/execution-worker-path',async original=>{const actual=await original<typeof import('@/server/execution-worker-path')>();const {fileURLToPath}=await import('node:url');return{...actual,resolveExecutionWorkerPath:()=>fileURLToPath(new URL('../../../../ai-worker/dist/execution-worker.cjs',import.meta.url))};});
import {compositeTransport,getChatRuntime,__resetPersistenceForTests} from '@/server/persistence-client';
import {prepareChatReply} from '@/server/prepare-chat-reply';
const ctx:RequestContext={userId:'canvas-chat-original-user',accountId:'canvas-chat-original-account',source:'user',requestId:'canvas-chat-original'};
async function call<E extends Endpoint>(endpoint:E,params:unknown,body?:unknown,query?:unknown):Promise<E['response']['_output']>{const result=await compositeTransport.request(endpoint,{params,body,query} as never,ctx) as {data:unknown};return endpoint.response.parse(result.data);}
async function callList<E extends Endpoint>(endpoint:E,params:unknown,body?:unknown,query?:unknown):Promise<E['response']['_output'][]>{const result=await compositeTransport.request(endpoint,{params,body,query} as never,ctx) as {data:unknown};if(!Array.isArray(result.data))throw Error('原公共列表回包不是数组');return result.data.map(value=>endpoint.response.parse(value));}
it('原Settings/聊天assembly/Pi Worker/read/propose受控账本只写候选，用户原apply才改Canvas',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'creatoros-chat-canvas-original-'));const calls:Record<string,any>[]=[];let canvasId='',baseRevision=1;
 const server=createServer(async(req,res)=>{let body='';for await(const c of req)body+=c.toString();const input=JSON.parse(body);calls.push(input);const step=calls.length;
 const delta=step===1?{tool_calls:[{index:0,id:'canvas-read-call',type:'function',function:{name:'canvas_read',arguments:'{}'}}]}:step===2?{tool_calls:[{index:0,id:'canvas-propose-call',type:'function',function:{name:'canvas_propose',arguments:JSON.stringify({baseRevision,operations:[{type:'addNode',operationId:'user-visible-op',tempId:'draft-text',node:{id:'draft-text',type:'text',label:'编导候选',position:{x:100,y:100},text:'候选文字'}}]})}}]}:{content:'已保存一项画布建议，请在画布检查后明确应用。'};
 const chunks=[{choices:[{index:0,delta,finish_reason:null}]},{choices:[{index:0,delta:{},finish_reason:step<=2?'tool_calls':'stop'}],usage:{prompt_tokens:10,completion_tokens:10,total_tokens:20}}];res.writeHead(200,{'content-type':'text/event-stream'});res.end(chunks.map(chunk=>`data: ${JSON.stringify({id:'local-fixture-chat',object:'chat.completion.chunk',created:1,model:'local-fixture',...chunk})}\n\n`).join('')+'data: [DONE]\n\n');});
 await new Promise<void>(r=>server.listen(0,'127.0.0.1',r));const baseUrl=`http://127.0.0.1:${(server.address() as {port:number}).port}/v1`;
 vi.stubEnv('DATABASE_URL','');vi.stubEnv('PGLITE_DATA_DIR',join(dir,'db'));__resetPersistenceForTests();
 try{
  await call(ENDPOINTS.putModel,{capability:'topic.generate'},{provider:'openai',modelName:'local-fixture',apiFormat:'openai_chat',baseUrl,secret:'local-fixture-only',isDefault:false});
  await configureModelFixture((id,params,body)=>call(Object.values(ENDPOINTS).find(endpoint=>endpoint.id===id)!,params,body),baseUrl,'local-fixture');
  const canvas=await call(ENDPOINTS.createCanvas,undefined,{title:'原编导画布'});canvasId=canvas.id;baseRevision=canvas.revision;
  const runtime=await getChatRuntime(),conversation=await runtime.ai.createConversation(ctx,{title:'原画布对话',scope:`surface:canvas:${canvasId}`}),message=await runtime.ai.createMessage(ctx,conversation.id,{content:'请读取这张画布，然后保存一项文字候选供我检查'});
  const submitted=await runtime.durable.submit(ctx,{conversationId:conversation.id,sourceMessageId:message.id},(owner,snapshot)=>prepareChatReply(runtime,owner,snapshot,{chatContext:{surface:'canvas',selection:{kind:'canvas',ids:[canvasId],label:canvas.title}},messages:[{id:message.id,role:'user',parts:[{type:'text',text:message.content}]}]}));
  await vi.waitFor(async()=>{const task=await runtime.durable.get(ctx,submitted.executionTaskId);expect(task.status,JSON.stringify({task,calls:calls.length})).toBe('succeeded');},{timeout:20000});
  expect(calls).toHaveLength(3);const definitions=calls[0]!.tools.map((t:any)=>t.function.name);expect(definitions).toContain('canvas_read');expect(definitions).toContain('canvas_propose');expect(calls[1]!.messages.some((m:any)=>m.role==='tool'&&String(m.content).includes(canvasId))).toBe(true);
  const proposals=await callList(ENDPOINTS.listCanvasProposals,{canvasId});expect(proposals).toHaveLength(1);expect(proposals[0]).toMatchObject({baseRevision,status:'pending',operations:[{type:'addNode',operationId:'user-visible-op'}]});
  expect((await call(ENDPOINTS.getCanvas,{canvasId})).document.nodes).toEqual([]);expect((await call(ENDPOINTS.getCanvas,{canvasId})).revision).toBe(baseRevision);
  const applied=await call(ENDPOINTS.applyCanvasProposal,{canvasId,proposalId:proposals[0]!.id},{expectedRevision:baseRevision});expect(applied.revision).toBe(baseRevision+1);expect(applied.document.nodes).toMatchObject([{type:'text',text:'候选文字'}]);expect((await callList(ENDPOINTS.listCanvasProposals,{canvasId}))[0]!.status).toBe('applied');
 }finally{await(globalThis as {__creatorosDisposePersistence?:()=>Promise<void>}).__creatorosDisposePersistence?.();__resetPersistenceForTests();server.closeAllConnections();await new Promise<void>(r=>server.close(()=>r()));vi.unstubAllEnvs();await rm(dir,{recursive:true,force:true});}
},60000);
