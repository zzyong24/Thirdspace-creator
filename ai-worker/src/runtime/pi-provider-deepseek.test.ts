import type {LanguageModelV4,LanguageModelV4CallOptions} from '@ai-sdk/provider';
import {afterEach,expect,it,vi} from 'vitest';
import {createPiProviderModel} from './pi-provider';
import {modelFor} from './provider-factory';
import {classifyLlmError} from './retry-policy';
import {generationFailure} from '../execution/generation-error';
import {providerErrorDetail,redactProviderErrorDetail} from '@creatoros/contract/provider-error-detail';
afterEach(()=>vi.unstubAllGlobals());
const spec={apiFormat:'openai_chat' as const,baseUrl:'https://api.deepseek.com',model:'deepseek-flash',token:'synthetic-fixture-credential'};
it.each(['tool','required','auto'] as const)('DeepSeek 请求保留工具与消息，强制工具关闭思考：%s',async choice=>{
 let body:any;
 vi.stubGlobal('fetch',vi.fn(async (_url,init)=>{body=JSON.parse(init.body);return new Response(JSON.stringify({error:{message:'fixture refused',code:'invalid_request_error'}}),{status:400,headers:{'content-type':'application/json'}});}));
 const tools:NonNullable<LanguageModelV4CallOptions["tools"]>=Array.from({length:37},(_,i)=>({type:'function' as const,name:`tool_${i}`,inputSchema:{type:'object',properties:{query:{type:'string'}},required:['query'],additionalProperties:false}}));
 await expect(createPiProviderModel(spec).doGenerate({prompt:[{role:'system',content:'系统指令'},{role:'user',content:[{type:'text',text:'用户请求'}]}],tools,toolChoice:choice==='tool'?{type:'tool',toolName:'tool_0'}:{type:choice},maxOutputTokens:8192,reasoning:'medium'})).rejects.toThrow();
 expect(body.max_tokens).toBe(8192);expect(body.max_completion_tokens).toBeUndefined();
 expect(body.tools).toHaveLength(37);expect(body.tools[0].function.strict).toBe(false);
 expect(body.tools[0].function.parameters).toEqual({type:'object',properties:{query:{type:'string'}},required:['query'],additionalProperties:false});
 expect(body.messages.map((m:any)=>m.role)).toEqual(['system','user']);
 expect(body.messages[0].content).toBe('系统指令');
 expect(body.tool_choice).toEqual(choice==='tool'?{type:'function',function:{name:'tool_0'}}:choice);
 expect(body.parallel_tool_calls).toBeUndefined();expect(body.response_format).toBeUndefined();
 if(choice!=='auto'){expect(body.thinking).toEqual({type:'disabled'});expect(body.reasoning_effort).toBeUndefined();}
 else expect(body.thinking).toEqual({type:'enabled'});
});
it('实际 modelFor 拒绝经分类后保留安全诊断且不携带头或凭据',async()=>{
 vi.stubGlobal('fetch',vi.fn(async()=>new Response(JSON.stringify({error:{message:`invalid tool_choice ${spec.token}`,code:'invalid_request_error'}}),{status:400,headers:{'content-type':'application/json','x-private-header':'private-header-fixture'}})));
 let caught:unknown;try{await (modelFor(spec) as LanguageModelV4).doGenerate({prompt:[{role:'user',content:[{type:'text',text:'test'}]}]});}catch(error){caught=error;}
 const failure=generationFailure(caught,false);
 expect(failure.outcome).toBe('failed');expect(failure.errorCode).toBe('http_400');
 expect(failure.errorMessage).toContain('invalid tool_choice');expect(failure.errorMessage).not.toContain(spec.token);expect(failure.message).not.toContain('private-header-fixture');
});
it('诊断仅投影消息和码、脱敏并限制长度',()=>{
 const detail=providerErrorDetail(422,JSON.stringify({error:{code:'bad_schema',message:'token=fixture-secret '+ 'x'.repeat(900)},headers:{private:'fixture-header'},request:{private:'fixture-request'}}));
 expect(detail).toContain('http_422');expect(detail).toContain('bad_schema');expect(detail).not.toContain('fixture-secret');expect(detail).not.toContain('fixture-header');expect(detail).not.toContain('fixture-request');expect(detail.length).toBeLessThanOrEqual(512);
 expect(redactProviderErrorDetail('Bearer fixture-auth sk-fixture-key https://fixture.invalid/?token=fixture')).not.toMatch(/fixture-auth|fixture-key|fixture.invalid/);
});

it.each([400,404,422])('请求错误 %s 不重试且保留稳定状态码',status=>{expect(classifyLlmError({statusCode:status,message:'invalid request'})).toEqual({reason:`http_${status}`,retryable:false});});

it('未显式配置effort的首轮强制工具也关闭DeepSeek默认思考',async()=>{
 let body:any;
 vi.stubGlobal('fetch',vi.fn(async(_url,init)=>{body=JSON.parse(init.body);return new Response(JSON.stringify({error:{message:'fixture refusal'}}),{status:400,headers:{'content-type':'application/json'}});}));
 await expect(createPiProviderModel(spec).doGenerate({prompt:[{role:'user',content:[{type:'text',text:'test'}]}],tools:[{type:'function',name:'read',inputSchema:{type:'object',properties:{}}}],toolChoice:{type:'tool',toolName:'read'},maxOutputTokens:8192})).rejects.toThrow();
 expect(body.thinking).toEqual({type:'disabled'});expect(body.reasoning_effort).toBeUndefined();expect(body.max_tokens).toBe(8192);
});
