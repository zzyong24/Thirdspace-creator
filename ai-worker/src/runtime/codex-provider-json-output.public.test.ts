// 公共调用链回归；仅AppServer边界为明确合成fixture。
// 不 mock AI SDK、Codex provider、native turn、账本上下文或三个原Zod。
import {beforeEach,afterEach,expect,it,vi} from 'vitest';
import {generateText,Output,asSchema} from 'ai';
import {z} from 'zod';
const boundary=vi.hoisted(()=>({scenario:null as any,session:null as any,ports:[] as any[],sessions:[] as any[],requests:[] as any[],counter:0}));
vi.mock('../execution/codex-app-server',async original=>({
 ...await original<typeof import('../execution/codex-app-server')>(),
 // 仅替身会话工厂；原Codex参数、MCP验证、错误类全部保留。
 createControlledCodexSession:vi.fn(async(cwd:string,signal:AbortSignal)=>{
  const scenario=boundary.scenario;const ordinal=++boundary.counter;
  const threadId=`fixture-thread-${ordinal}`,turnId=`fixture-turn-${ordinal}`;
  const rpc:any={closed:false,onFailure:undefined,onAbort:undefined,onNotification:undefined,onRequest:undefined,
   async request(method:string,params:any,timeoutMs=120000){
    boundary.requests.push({method,params:structuredClone(params),timeoutMs,threadId,turnId});
    if(method==='thread/start')return {thread:{id:threadId},model:'explicit-fixture-model',modelProvider:'openai'};
    if(method==='mcpServerStatus/list')return {data:[],nextCursor:null};
    if(method==='turn/interrupt')return {};
    if(method==='thread/read'){
     expect(params).toEqual({threadId:scenario.threadId,includeTurns:true});
     return {thread:{id:scenario.threadId,turns:[{id:scenario.turnId,status:'completed',itemsView:'full',items:[{id:'original-final',type:'agentMessage',phase:'final_answer',text:scenario.text}]}]}};
    }
    if(method!=='turn/start')throw Error('UNEXPECTED_SYNTHETIC_RPC_METHOD');
    setImmediate(()=>void (async()=>{
     if(signal.aborted||rpc.closed)return;
     await rpc.onNotification?.('turn/started',{threadId,turn:{id:turnId,status:'inProgress',items:[]}});
     const nativeSchema=params.outputSchema;const props=nativeSchema?.properties;const strictRootRejected=nativeSchema?.type==='object'&&(nativeSchema.additionalProperties!==false||!Array.isArray(nativeSchema.required)||Object.keys(props??{}).some(key=>!nativeSchema.required.includes(key)));
     if(nativeSchema!==undefined&&scenario.rejectNativeSchema&&strictRootRejected){
      // 外部fixture仅模拟官方已明确的顶层strict required/closed规则；不是未来适配helper。
      // 不宣称模拟了供应商全部schema限制，不称真实模型或原历史frame。
      await rpc.onNotification?.('turn/completed',{threadId,turn:{id:turnId,status:'failed',items:[],error:{message:'synthetic invalid_json_schema strict-required',codexErrorInfo:'other'}}});return;
     }
     await rpc.onNotification?.('thread/tokenUsage/updated',{threadId,turnId,tokenUsage:{total:{inputTokens:7,outputTokens:5,totalTokens:12,cachedInputTokens:0,reasoningOutputTokens:0}}});
     await rpc.onNotification?.('item/completed',{threadId,turnId,item:{id:'final',type:'agentMessage',phase:'final_answer',text:scenario.text}});
     await rpc.onNotification?.('turn/completed',{threadId,turn:{id:turnId,status:'completed',itemsView:'full',items:[{id:'final',type:'agentMessage',phase:'final_answer',text:scenario.text}]}});
    })().catch((e:Error)=>rpc.onFailure?.(e)));
    return {turn:{id:turnId,status:'inProgress',items:[]}};
   },
   async close(){rpc.closed=true;signal.removeEventListener('abort',abort);},
  };
  const abort=()=>void (async()=>{try{await rpc.onAbort?.();}finally{await rpc.close();}})();signal.addEventListener('abort',abort,{once:true});
  boundary.session=rpc;boundary.sessions.push({rpc,cwd,signal});
  return {rpc,authenticated:scenario.authenticated!==false,mcpNames:[],loginStatus:'authenticated' as const};
 }),
}));
import {createCodexProviderModel} from './codex-provider';
import {codexCallAuthority,codexWorkerPorts} from '../execution/codex-call-context';
import {createDurableGenerationModel} from '../execution/durable-generation-model';
import {planningThesisOutputSchema} from '../execution/planning-thesis-output';
import {topicCardSchema} from '../prompt/templates/topic-enrich';
import {topicPreferenceDistillSchema} from '../prompt/templates/topic-preference-distill';
import {resolveStructuredBusinessSchema} from '../execution/structured-business-schema';
const callId='same-public-fixture-call';
const spec={engine:'codex' as const,protocolKind:'codex-app-server' as const,schemaVersion:1 as const,runtimeVersion:'0.159.3' as const};
const model=()=>createCodexProviderModel(spec as any);
const port=async(name:string,input:any)=>{boundary.ports.push({name,input:structuredClone(input)});if(name==='readCodexCall')return {threadId:boundary.scenario.threadId,turnId:boundary.scenario.turnId};if(name==='bindCodexCall')return {callId:input.callId,budgetExceeded:false};throw Error('UNEXPECTED_WORKER_PORT');};
async function publicGenerate(schema:z.ZodType|undefined,value:unknown,options:{signal?:AbortSignal;image?:boolean;rawText?:string;recover?:boolean}={}){
 boundary.scenario={...boundary.scenario,text:options.rawText??(schema?JSON.stringify(value):String(value))};
 const signal=options.signal??new AbortController().signal;
 return codexWorkerPorts.run(port,()=>codexCallAuthority.run({callId,recover:options.recover??false},()=>generateText({model:model(),abortSignal:signal,maxRetries:0,maxOutputTokens:2048,
 ...(schema?{output:Output.object({schema})}:{}),
 ...(options.image?{messages:[{role:'user' as const,content:[{type:'text' as const,text:'synthetic public source prompt'},{type:'image' as const,image:new Uint8Array([137,80,78,71,13,10,26,10]),mediaType:'image/png'}]}]}:{prompt:'synthetic public source prompt'}),
 })));
}
function singleTurn(){const turns=boundary.requests.filter(r=>r.method==='turn/start');expect(turns).toHaveLength(1);return turns[0];}
function onlyOriginalBindings(){expect(boundary.ports.every(x=>x.input.callId===callId)).toBe(true);const binds=boundary.ports.filter(x=>x.name==='bindCodexCall');expect(binds.some(x=>x.input.threadId==='fixture-thread-1')).toBe(true);expect(binds.some(x=>x.input.turnId==='fixture-turn-1')).toBe(true);expect(binds.filter(x=>x.input.observedUsage).map(x=>x.input.observedUsage.totalTokens)).toEqual([12,12]);}
beforeEach(()=>{boundary.scenario={rejectNativeSchema:true};boundary.session=null;boundary.ports=[];boundary.sessions=[];boundary.requests=[];boundary.counter=0;});
afterEach(()=>{expect(boundary.sessions.every(s=>s.rpc.closed)).toBe(true);expect(boundary.requests.filter(r=>!['turn/interrupt'].includes(r.method)).every(r=>r.timeoutMs>=120000)).toBe(true);});
const originalCases=[
 {name:'planning.thesis',schema:planningThesisOutputSchema,value:{core:{title:'明确合成论点'}},facets:{__planningThesisGrounding:JSON.stringify(['','','','','','',''])}},
 {name:'topic.enrich',schema:topicCardSchema,value:{oneLiner:'明确合成选题'},facets:{}},
 {name:'topic.preference',schema:topicPreferenceDistillSchema,value:{偏好信号:[{keyword:'明确合成偏好'}]},facets:{}},
];
it.each(originalCases)('原公共 $name Zod/default/refine 不被native strict改写',async({name,schema,value,facets})=>{
 const business=resolveStructuredBusinessSchema({skillId:name,facets} as any)!;
 const result=await publicGenerate(business,value);expect(result.output).toEqual(business.parse(value));expect(schema.safeParse(result.output).success).toBe(true);
 const turn=singleTurn();expect(turn.params).not.toHaveProperty('outputSchema');expect(turn.params.input[0].text).toContain(JSON.stringify(await asSchema(business).jsonSchema));onlyOriginalBindings();
},180000);
const structureCases:Array<{name:string;schema:z.ZodType;value:unknown}>=[
 {name:'严格合法闭合对象',schema:z.object({required:z.string()}),value:{required:'fixture'}},
 {name:'optional字段省略仍合法',schema:z.object({required:z.string(),optional:z.string().optional()}),value:{required:'fixture'}},
 {name:'嵌套optional/default',schema:z.object({nested:z.object({key:z.string(),optional:z.string().optional(),defaulted:z.string().default('original-default')})}),value:{nested:{key:'fixture'}}},
 {name:'nullable原样',schema:z.object({value:z.string().nullable()}),value:{value:null}},
 {name:'开放dictionary键不裁剪',schema:z.object({map:z.record(z.string(),z.string())}),value:{map:{unknownLegalKey:'original',另一个合法键:'原值'}}},
 {name:'数组元素optional',schema:z.object({items:z.array(z.object({key:z.string(),optional:z.string().optional()}))}),value:{items:[{key:'fixture'}]}},
 {name:'联合合法分支',schema:z.object({branch:z.union([z.object({tag:z.literal('a'),x:z.string()}),z.object({tag:z.literal('b'),y:z.number()})])}),value:{branch:{tag:'b',y:2}}},
];
it.each(structureCases)('公共AI SDK原schema族：$name',async({schema,value})=>{
 const originalSchema=await asSchema(schema).jsonSchema,before=JSON.stringify(originalSchema);const result=await publicGenerate(schema,value);expect(result.output).toEqual(schema.parse(value));
 const turn=singleTurn();expect(turn.params).not.toHaveProperty('outputSchema');expect(turn.params.input[0].text).toContain(before);expect(JSON.stringify(await asSchema(schema).jsonSchema)).toBe(before);onlyOriginalBindings();
},180000);
it('recursive/ref家族原结构不展平，不截合法后代',async()=>{
 const recursive:z.ZodType<any>=z.object({label:z.string(),children:z.array(z.lazy(()=>recursive)).optional()});const value={label:'root',children:[{label:'child'}]};const original=JSON.stringify(await asSchema(recursive).jsonSchema);
 const result=await publicGenerate(recursive,value);expect(result.output).toEqual(recursive.parse(value));expect(singleTurn().params.input[0].text).toContain(original);expect(JSON.stringify(await asSchema(recursive).jsonSchema)).toBe(original);
},180000);
it.each(['not-json','{"required":17}'])('不合法原输出 %s 仍由公共SDK/Zod拒绝，无第二turn',async rawText=>{
 await expect(publicGenerate(z.object({required:z.string()}),null,{rawText})).rejects.toBeTruthy();expect(singleTurn().params).not.toHaveProperty('outputSchema');
},180000);
it('原业务空论点仍拒绝，不以文本协议放宽refine',async()=>{
 await expect(publicGenerate(planningThesisOutputSchema,{core:{title:''},branches:[]})).rejects.toBeTruthy();singleTurn();
},180000);
it('非JSON公共文本协议保持，无schema格式提示',async()=>{
 const result=await publicGenerate(undefined,'plain synthetic text');expect(result.text).toBe('plain synthetic text');const turn=singleTurn();expect(turn.params).not.toHaveProperty('outputSchema');expect(turn.params.input[0].text).toBe(JSON.stringify([{role:'user',content:[{type:'text',text:'synthetic public source prompt'}]}]));
},180000);
it('公共图片输入仍由原codexPrompt投影，同一次JSON输出',async()=>{
 const result=await publicGenerate(z.object({answer:z.string()}),{answer:'fixture'},{image:true});expect(result.output).toEqual({answer:'fixture'});const turn=singleTurn();expect(turn.params.input.filter((x:any)=>x.type==='image')).toHaveLength(1);expect(turn.params.input[1].url).toBe('data:image/png;base64,iVBORw0KGgo=');
},180000);
it('已取消原signal在公共consumer拒绝，不能发新thread/turn',async()=>{
 const c=new AbortController();c.abort();await expect(publicGenerate(z.object({answer:z.string()}),{answer:'fixture'},{signal:c.signal})).rejects.toBeTruthy();expect(boundary.requests).toEqual([]);
},180000);
it('原unknown恢复只读同thread/turn，schema修复不得触发再turn',async()=>{
 boundary.scenario={rejectNativeSchema:true,threadId:'original-thread',turnId:'original-turn'};const result=await publicGenerate(z.object({answer:z.string()}),{answer:'fixture'},{recover:true});expect(result.output).toEqual({answer:'fixture'});expect(boundary.requests.map(x=>x.method)).toEqual(['thread/read']);expect(boundary.requests[0].params).toEqual({threadId:'original-thread',includeTurns:true});
},180000);
it('durable公共预留/入场/结算仅同call一次，保真实fixtureusage',async()=>{
 boundary.scenario={rejectNativeSchema:true,text:JSON.stringify({answer:'fixture'})};const transitions:any[]=[];const controller=new AbortController();
 const durable=createDurableGenerationModel({model:model(),operationKey:'schema-fixture',signal:controller.signal,ports:{reserve:async input=>{transitions.push(['reserve',input]);return {callId,status:'reserved'};},start:async id=>{transitions.push(['start',id]);},settle:async(id,receipt)=>{transitions.push(['settle',id,receipt]);}}});
 const result=await codexWorkerPorts.run(port,()=>generateText({model:durable,prompt:'synthetic durable source',output:Output.object({schema:z.object({answer:z.string()})}),abortSignal:controller.signal,maxRetries:0,maxOutputTokens:2048}));expect(result.output).toEqual({answer:'fixture'});expect(transitions.map(x=>x[0])).toEqual(['reserve','start','settle']);expect(transitions[1][1]).toBe(callId);expect(transitions[2][1]).toBe(callId);expect(transitions[2][2]).toMatchObject({status:'settled',usage:{inputTokens:7,outputTokens:5}});singleTurn();
},180000);
