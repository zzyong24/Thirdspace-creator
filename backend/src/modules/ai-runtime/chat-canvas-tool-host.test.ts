import {it,expect,vi} from 'vitest';
import {buildChatTools,type ChatToolDeps} from './chat-tools';
import {prepareChatToolDefinitions} from './chat-tool-definitions';
import {resolveSubmittedChatToolParameters} from './chat-submitted-tool-parameters';
import {getChatToolNativeExecutor} from './chat-tool-gate';
import {createChatCanvasToolHost} from './chat-canvas-tool-host';
import frozen from './__fixtures__/canvas-old-chat-definitions.json';
import {createHash} from 'node:crypto';
import type {RequestContext} from '@creatoros/contract';
import {chatWorkerInputSchema,type ExecutionRef} from '@creatoros/contract/execution-worker';
const ctx:RequestContext={userId:'canvas-user',accountId:'canvas-account',source:'user',requestId:'canvas-host-test'},execution:ExecutionRef={executionTaskId:'original-execution',attempt:1,fenceToken:'original-fence'};
const scope={execution,aiTaskId:'original-business',callId:'original-call',toolCallId:'original-tool',signal:new AbortController().signal};
it('T1074 旧已冻结画布宽参数合法建议仍沿真实host到原owner，不重建快照',async()=>{
 const f=await fixture(),definition=f.restored.modelInput.tools.find(d=>d.name==='canvas.propose')!;
 const parameters={type:'object',properties:{baseRevision:{type:'integer',minimum:1,description:'逐字使用 canvas.read 返回的 revision'},operations:{type:'array',minItems:1,maxItems:100,items:{type:'object',additionalProperties:true},description:'操作数组，每项含唯一 operationId 与 type；可用 addNode(tempId,node)、updateNode(nodeId,patch)、moveNode(nodeId,position)、deleteNode(nodeId)、connect(source,target)、disconnect(edgeId)。节点引用须来自 canvas.read。'}},required:['baseRevision','operations'],additionalProperties:false};
 definition.parameters=parameters;definition.version='chat-tools-v1:'+createHash('sha256').update(JSON.stringify({name:definition.name,effect:definition.effect,description:definition.description,parameters})).digest('hex');
 const before=structuredClone(f.restored.modelInput.tools),tools=await f.host(ctx,{} as never,execution,scope.signal),operations=[{type:'deleteNode',operationId:'op',nodeId:'actual-node'}];
 expect(await tools['canvas.propose']!.execute!(ctx,{baseRevision:3,operations},scope)).toMatchObject({status:'ok',sideEffect:'proposal'});
 expect(f.propose).toHaveBeenCalledWith(ctx,'trusted-canvas',3,operations);expect(f.restored.modelInput.tools).toEqual(before);
});
async function fixture(){const readCanvas=vi.fn(async()=>({id:'trusted-canvas',title:'原画布',projectId:null,revision:3,document:{nodes:[],edges:[]}})),propose=vi.fn(async(_ctx:RequestContext,id:string,revision:number,ops:unknown)=>({id:'candidate',canvasId:id,baseRevision:revision,operations:ops as unknown[]}));const definitions=(await prepareChatToolDefinitions(buildChatTools(['canvas.read','canvas.propose'],{} as ChatToolDeps))).definitions;const restored={context:ctx,hostContext:{chatContext:{surface:'canvas',selection:{kind:'canvas',ids:['trusted-canvas']}}},modelInput:{tools:definitions}};const reader={read:vi.fn(async()=>structuredClone(restored))};const host=createChatCanvasToolHost(reader as never,{read:readCanvas,propose});return{reader,host,restored,readCanvas,propose};}
it('当前参考图合同保留且旧global冻结原JSON/hash/schema可精确恢复',async()=>{
 const before=JSON.stringify(frozen);
 for(const entry of frozen){const current=await prepareChatToolDefinitions(buildChatTools(entry.definitions.map(d=>d.name),{} as ChatToolDeps),entry.options);
  for(const def of entry.definitions){const actual=current.definitions.find(d=>d.name===def.name)!;
   if(def.name==='material.generate'){expect(actual.parameters.properties).toHaveProperty('referenceAssetId');expect(actual.version).not.toBe(def.version);}
   else expect(actual).toEqual(def);
   if(def.name==='material.generate'&&!Object.hasOwn(def,'execution'))continue;
   const params=await resolveSubmittedChatToolParameters(chatWorkerInputSchema.shape.tools.element.parse(def));expect(params.schema).toEqual(def.parameters);
   if(def.name==='material.generate'){expect(params.parameters.safeParse({kind:'image',prompt:'原合法输入'}).success).toBe(true);expect(params.parameters.safeParse({kind:'image',prompt:'原合法输入',referenceAssetId:'reference'}).success).toBe(false);expect(params.parameters.safeParse({kind:'image',prompt:'原合法输入',extra:'foreign'}).success).toBe(false);}
  }
 }
 expect(JSON.stringify(frozen)).toBe(before);
 const modern=await prepareChatToolDefinitions(buildChatTools(['material.generate'],{} as ChatToolDeps),{atomicMaterialGenerate:true});const params=await resolveSubmittedChatToolParameters(modern.definitions[0]!);expect(params.parameters.safeParse({kind:'image',prompt:'明确参考图',referenceAssetId:'real-id'}).success).toBe(true);
});
it('历史完整定义任何字段篡改或未知版本不匹配兼容registry',async()=>{
 const def=frozen.flatMap(e=>e.definitions).find(d=>d.name==='material.generate'&&Object.hasOwn(d,'execution'))!;
 for(const field of ['name','version','description','parameters','effect','execution'] as const){const altered={...def,[field]:field==='parameters'?{type:'object',additionalProperties:true}:field==='effect'?'proposal':'unknown'};await expect(Promise.resolve().then(()=>resolveSubmittedChatToolParameters(chatWorkerInputSchema.shape.tools.element.parse(altered)))).rejects.toThrow();}
 await expect(resolveSubmittedChatToolParameters(Object.assign(chatWorkerInputSchema.shape.tools.element.parse(def),{extra:'foreign'}))).rejects.toThrow();
});
it('旧无Canvas的plain material.generate仍原dispatch，未因新Canvas模式要求被阻',async()=>{const dispatch=vi.fn(async()=>({taskId:'original-task'}));const tools=buildChatTools(['material.generate'],{dispatchGenerateAsset:dispatch,humanizeError:()=>null} as unknown as ChatToolDeps);const result=await getChatToolNativeExecutor(tools['material.generate']!)!({kind:'image',prompt:'明确用户输入的图片'},{});expect(result).toMatchObject({taskId:'original-task',error:null});expect(dispatch).toHaveBeenCalledOnce();});
it('每次执行重新受控reader，只有冻结单Canvas，proposal只原owner候选',async()=>{const f=await fixture(),tools=await f.host(ctx,{} as never,execution,scope.signal);expect(tools['canvas.read']!.effect).toBe('none');expect(tools['canvas.propose']!.effect).toBe('proposal');const read=await tools['canvas.read']!.execute!(ctx,{},scope);expect(read).toMatchObject({status:'ok',sideEffect:'none',data:{canvasId:'trusted-canvas'}});expect(f.reader.read).toHaveBeenCalledTimes(2);const operations=[{type:'deleteNode',operationId:'op',nodeId:'actual-node'}];const result=await tools['canvas.propose']!.execute!(ctx,{baseRevision:3,operations},scope);expect(result).toMatchObject({status:'ok',sideEffect:'proposal'});expect(f.propose).toHaveBeenCalledWith(ctx,'trusted-canvas',3,operations);expect(f.reader.read).toHaveBeenCalledTimes(3);});
it('宿主上下文变化/多Canvas/模型自报身份全部拒绝且零owner写',async()=>{const f=await fixture(),tools=await f.host(ctx,{} as never,execution,scope.signal);f.restored.hostContext.chatContext.selection.ids.push('second-canvas');expect(await tools['canvas.propose']!.execute!(ctx,{baseRevision:3,operations:[{type:'deleteNode',operationId:'op',nodeId:'node'}]},scope)).toMatchObject({status:'error',sideEffect:'none'});f.restored.hostContext.chatContext.selection.ids=['trusted-canvas'];expect(await tools['canvas.propose']!.execute!(ctx,{canvasId:'model-canvas',baseRevision:3,operations:[{type:'deleteNode',operationId:'op',nodeId:'node'}]},scope)).toMatchObject({status:'error',error:{code:'invalid_input'},sideEffect:'none'});expect(f.propose).not.toHaveBeenCalled();await expect(f.host({...ctx,accountId:'other-account'},{} as never,execution,scope.signal)).rejects.toThrow('账号与任务不符');});
it('冻结版本/描述/schema/effect任一漂移不执行owner',async()=>{for(const field of ['version','description','parameters','effect'] as const){const f=await fixture();const tools=await f.host(ctx,{} as never,execution,scope.signal);Object.assign(f.restored.modelInput.tools[0]!,{[field]:field==='parameters'?{type:'object'}:field==='effect'?'proposal':'changed'});expect(await tools['canvas.read']!.execute!(ctx,{},scope)).toMatchObject({status:'error',sideEffect:'none'});expect(f.readCanvas).not.toHaveBeenCalled();expect(f.propose).not.toHaveBeenCalled();}});
it('旧冻结任务没有Canvas定义时不要求Canvas定位，取消或scope过期不能写',async()=>{const f=await fixture();f.restored.modelInput.tools=[];f.restored.hostContext.chatContext.selection.ids=[];expect(await f.host(ctx,{} as never,execution,scope.signal)).toEqual({});const g=await fixture(),tools=await g.host(ctx,{} as never,execution,scope.signal),abort=new AbortController();abort.abort();expect(await tools['canvas.propose']!.execute!(ctx,{baseRevision:3,operations:[{type:'deleteNode',operationId:'op',nodeId:'node'}]},{...scope,signal:abort.signal})).toMatchObject({status:'error',error:{code:'cancelled'},sideEffect:'none'});expect(g.propose).not.toHaveBeenCalled();});

it('T1062 空组工具沿原ExecutionRef，跨组同null拒绝，同组平台过滤不会重绑owner',async()=>{
 const f=await fixture(),g={...ctx,accountId:null,groupId:'canvas-group-a'};
 f.restored.context=g;
 const tools=await f.host(g,{} as never,execution,scope.signal);
 expect(await tools['canvas.read']!.execute!(g,{},scope)).toMatchObject({status:'ok'});
 await expect(f.host({...g,groupId:'canvas-group-b'},{} as never,execution,scope.signal)).rejects.toThrow();
 expect(Object.keys(await f.host({...g,accountId:'platform-filter'},{} as never,execution,scope.signal))).toContain('canvas.read');
});
