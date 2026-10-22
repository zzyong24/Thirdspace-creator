import {afterEach,expect,it,vi} from 'vitest';
import type {LanguageModelV4CallOptions} from '@ai-sdk/provider';
import {createPiProviderModel} from './pi-provider';
afterEach(()=>vi.unstubAllGlobals());
const spec={apiFormat:'openai_chat' as const,baseUrl:'https://api.deepseek.com',model:'deepseek-flash',token:'synthetic-fixture'};
const request:LanguageModelV4CallOptions={prompt:[{role:'user',content:[{type:'text',text:'帮我梳理账号定位'}]}],reasoning:'medium',tools:[{type:'function',name:'positioning.generate',inputSchema:{type:'object',properties:{}}}],toolChoice:{type:'auto'}};
const reasoning=' 精确保留\n推理内容 ';
function mock(stream:boolean){
 const bodies:any[]=[];
 vi.stubGlobal('fetch',vi.fn(async(url,init)=>{
  const body=JSON.parse(init.body);bodies.push(body);
  if(String(url).includes('api.deepseek.com') && body.thinking?.type!=='disabled' && body.messages.some((m:any)=>m.role==='assistant'&&!m.reasoning_content))return new Response(JSON.stringify({error:{message:'The reasoning_content in the thinking mode must be passed back to the API.'}}),{status:400});
  const tool={id:'call-positioning',type:'function',function:{name:'positioning.generate',arguments:'{}'}};
  const message=bodies.length===1?{role:'assistant',content:null,...(body.thinking?.type==='disabled'?{}:{reasoning_content:reasoning}),tool_calls:[tool]}:{role:'assistant',content:'完成'};
  const finish_reason=bodies.length===1?'tool_calls':'stop';
  const common={id:'fixture',object:'chat.completion',created:1,model:spec.model};
  if(!stream)return new Response(JSON.stringify({...common,choices:[{index:0,message,finish_reason}],usage:{prompt_tokens:1,completion_tokens:1,total_tokens:2}}),{headers:{'content-type':'application/json'}});
  return new Response(`data: ${JSON.stringify({...common,choices:[{index:0,delta:message,finish_reason:null}]})}\n\ndata: ${JSON.stringify({...common,choices:[{index:0,delta:{},finish_reason}]})}\n\ndata: [DONE]\n\n`,{headers:{'content-type':'text/event-stream'}});
 }));return bodies;
}
it.each([false,true])('思考工具多轮无损回传（SSE=%s）',async stream=>{
 const bodies=mock(stream),model=createPiProviderModel(spec);
 const first=await model.doGenerate(request);
 expect(first.content).toContainEqual(expect.objectContaining({type:'reasoning',text:reasoning}));
 const content:any[]=first.content.map(part=>part.type==='tool-call'?{...part,input:JSON.parse(part.input)}:{...part,providerOptions:part.providerMetadata});
 await model.doGenerate({...request,prompt:[...request.prompt,{role:'assistant',content},{role:'tool',content:[{type:'tool-result',toolCallId:'call-positioning',toolName:'positioning.generate',output:{type:'text',value:'候选定位'}}]}]});
 expect(bodies[1].messages.find((m:any)=>m.role==='assistant').reasoning_content).toBe(reasoning);
 expect(bodies[1].thinking).toEqual({type:'enabled'});
});
it('强制工具之后auto请求保持关闭，重建model亦兼容旧历史',async()=>{
 const bodies=mock(false);
 await createPiProviderModel(spec).doGenerate({...request,toolChoice:{type:'tool',toolName:'positioning.generate'}});
 await createPiProviderModel(spec).doGenerate({...request,prompt:[...request.prompt,{role:'assistant',content:[{type:'tool-call',toolCallId:'call-positioning',toolName:'positioning.generate',input:{}}]},{role:'tool',content:[{type:'tool-result',toolCallId:'call-positioning',toolName:'positioning.generate',output:{type:'text',value:'候选定位'}}]}]});
 expect(bodies.map(b=>b.thinking)).toEqual([{type:'disabled'},{type:'disabled'}]);
});
it('OpenAI官方不增加DeepSeek扩展',async()=>{
 const bodies=mock(false);
 await createPiProviderModel({...spec,baseUrl:'https://api.openai.com/v1'}).doGenerate({...request,prompt:[...request.prompt,{role:'assistant',content:[{type:'reasoning',text:reasoning},{type:'text',text:'正文'}]}]});
 expect(bodies[0].thinking).toBeUndefined();expect(bodies[0].messages.every((m:any)=>!('reasoning_content' in m))).toBe(true);
});

it('嵌套定位结构化节点使用真实模板和DeepSeek适配边界',async()=>{
 const {runStructuredNode}=await import('../nodes/structured-node');
 const {POSITIONING_GENERATE_TEMPLATE,positioningSuggestionSchema}=await import('../prompt/templates/positioning-generate');
 const bodies:any[]=[];
 vi.stubGlobal('fetch',vi.fn(async(_url,init)=>{
  bodies.push(JSON.parse(init.body));
  return new Response(JSON.stringify({id:'nested',object:'chat.completion',created:1,model:spec.model,choices:[{index:0,message:{role:'assistant',content:JSON.stringify({oneLiner:'帮助独立创作者梳理定位'}),reasoning_content:'定位推理'},finish_reason:'stop'}],usage:{prompt_tokens:2,completion_tokens:3,total_tokens:5}}),{headers:{'content-type':'application/json'}});
 }));
 const result=await runStructuredNode({model:createPiProviderModel(spec),template:POSITIONING_GENERATE_TEMPLATE,facets:{current:'待梳理',accounts:'',works:''},outputSchema:positioningSuggestionSchema,structuredOutputMode:"text"});
 expect(result.object.oneLiner).toBe('帮助独立创作者梳理定位');
 expect(bodies).toHaveLength(1);expect(bodies[0].messages.some((m:any)=>m.role==='user')).toBe(true);
});
it('AI SDK流式响应重建消息后继续回传推理',async()=>{
 const {streamText,generateText}=await import('ai');
 const bodies=mock(true),model=createPiProviderModel(spec);
 const first=streamText({model,prompt:'帮我梳理账号定位',maxRetries:0});
 await first.consumeStream();
 const response=await first.response;
 await generateText({model,messages:[{role:'user',content:'帮我梳理账号定位'},...response.messages],maxRetries:0});
 expect(bodies[1].messages.find((m:any)=>m.role==='assistant').reasoning_content).toBe(reasoning);
});
