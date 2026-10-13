import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import type {LanguageModelV4,LanguageModelV4CallOptions,LanguageModelV4GenerateResult} from '@ai-sdk/provider';
import type {CodexModelSpec} from '@creatoros/contract/execution-worker';
import {createControlledCodexSession,CodexHostError} from '../execution/codex-app-server';
import {runCodexNativeTurn,recoverCodexNativeTurn} from '../execution/codex-native-turn';
import {codexCallAuthority,codexWorkerPorts} from '../execution/codex-call-context';
/** 只投影已经授权给原模型的文本/图片，不下载URL、不读取宿主路径。 */
export function codexPrompt(request:LanguageModelV4CallOptions){
 const images:Array<{url:string}>=[];
 const prompt=request.prompt.map(message=>{
  if(message.role==='system')return {role:message.role,content:message.content};
  return {role:message.role,content:message.content.map(part=>{
   if(part.type!=='file'||!part.mediaType.startsWith('image/'))return part;
   const data=part.data;
   if(data.type!=='data')throw new CodexHostError('CODEX_IMAGE_INPUT_UNSUPPORTED');
   const encoded=typeof data.data==='string'?data.data:Buffer.from(data.data).toString('base64');
   const url=`data:${part.mediaType};base64,${encoded}`;
   if(Buffer.byteLength(url)>43_000_000)throw new CodexHostError('CODEX_IMAGE_INPUT_TOO_LARGE');
   images.push({url});return {type:'image',index:images.length-1};
  })};
 });
 // SEMANTIC_BOUNDARY_ALLOW: 仅序列化原输出协议，保留完整schema和业务验证；不选择创作内容。
 const compiledPrompt=JSON.stringify(prompt),format=request.responseFormat;
 const jsonGuidance=format?.type==='json'?'\n\n【原结构化输出协议】\n只输出合法JSON，不要Markdown代码块或解释。'+(format.schema===undefined?'':'\n严格遵守以下原完整JSON Schema，字段可选性、默认值及开放键以它为准：\n'+JSON.stringify(format.schema)):'';
 return {prompt:compiledPrompt+jsonGuidance,images};
}
export function createCodexProviderModel(spec:CodexModelSpec):LanguageModelV4{
 return {specificationVersion:'v4',provider:'codex-app-server',modelId:spec.requestedModel??'codex-default',supportedUrls:{},
  async doGenerate(request){
   const authority=codexCallAuthority.getStore(),call=codexWorkerPorts.getStore();
   if(!authority||!call)throw new CodexHostError('CODEX_CALL_AUTHORITY_REQUIRED');
   const signal=request.abortSignal;
   if(!signal)throw new CodexHostError('CODEX_PARENT_DEADLINE_REQUIRED');signal.throwIfAborted();
   const cwd=await mkdtemp(join(tmpdir(),'creatoros-codex-'));
   let session:Awaited<ReturnType<typeof createControlledCodexSession>>|undefined;
   try{
    session=await createControlledCodexSession(cwd,signal);
    const {rpc,authenticated,mcpNames}=session;
    if(!authenticated)throw new CodexHostError('CODEX_LOGIN_REQUIRED');
    const input=codexPrompt(request);
    const binding=authority.recover?await call('readCodexCall',{callId:authority.callId},signal) as {threadId?:string;turnId?:string;modelFacts?:{model:string|null;modelProvider:string|null}}:undefined;
    const result=authority.recover?
     await recoverCodexNativeTurn(rpc,binding?.threadId??'',binding?.turnId):
     await runCodexNativeTurn({rpc,mcpNames,cwd,signal,tools:[],...input,...(spec.requestedModel?{model:spec.requestedModel}:{}),
      onThread:async threadId=>{await call('bindCodexCall',{callId:authority.callId,threadId},signal);},onAdmission:async()=>{},
      onTurn:async turnId=>{await call('bindCodexCall',{callId:authority.callId,turnId},signal);},onUsage:async usage=>{const bound=await call('bindCodexCall',{callId:authority.callId,observedUsage:{inputTokens:usage.inputTokens??undefined,outputTokens:usage.outputTokens??undefined,totalTokens:usage.totalTokens??undefined}}) as {budgetExceeded?:boolean};return bound.budgetExceeded===true||(request.maxOutputTokens!==undefined&&usage.outputTokens!==null&&usage.outputTokens>request.maxOutputTokens);},onTool:async()=>{throw new CodexHostError('CODEX_TOOL_UNAVAILABLE');}});
    if(result.images?.length)throw new CodexHostError('CODEX_TEXT_RESULT_INVALID');
    const u=result.usage;
    await call('bindCodexCall',{callId:authority.callId,modelFacts:binding?.modelFacts??{model:result.model??null,modelProvider:result.modelProvider??null},...(u?{observedUsage:{inputTokens:u.inputTokens??undefined,outputTokens:u.outputTokens??undefined,totalTokens:u.totalTokens??undefined}}:{})});
    return {content:[{type:'text',text:result.text}],finishReason:{unified:'stop',raw:'completed'},warnings:[],
     usage:{inputTokens:{total:u?.inputTokens??undefined,cacheRead:u?.cachedReadTokens??undefined,noCache:undefined,cacheWrite:undefined},outputTokens:{total:u?.outputTokens??undefined,text:undefined,reasoning:u?.thoughtTokens??undefined}},
     providerMetadata:{codex:{threadId:result.sessionId,turnId:result.providerTurnId,model:result.model??null,modelProvider:result.modelProvider??null}}} satisfies LanguageModelV4GenerateResult;
   }finally{await session?.rpc.close();await rm(cwd,{recursive:true,force:true});}
  },
  async doStream(){throw new CodexHostError('CODEX_STREAM_REQUIRES_DURABLE_TURN');},
 };
}
