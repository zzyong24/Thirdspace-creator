import {ModelRequestBuildError} from "../execution/generation-error";
import {safeErrorMessage} from "./error-diagnostics";
import { providerErrorDetail } from "@creatoros/contract/provider-error-detail";
import { createModels,createProvider,lazyApi,envApiKeyAuth,type Model,type Api,type AssistantMessageEvent } from "@earendil-works/pi-ai";
import type { LanguageModelV4,LanguageModelV4CallOptions,LanguageModelV4StreamPart } from "@ai-sdk/provider";
import type { ApiModelSpec } from "./provider-factory";
import { piProviderDiagnostic } from "./pi-provider-diagnostic";
import { providerIdentityFor } from "./provider-identity";
import { toPiContext,fromPiMessage,piPayload } from "./pi-provider-codec";

export function createPiProviderModel(spec:ApiModelSpec,classifyRejection?:(facts:{statusCode:number;responseHeaders:Record<string,string>;message:string})=>Error):LanguageModelV4{
  const api=spec.apiFormat==="anthropic"?"anthropic-messages":spec.apiFormat==="openai_chat"?"openai-completions":"openai-responses";
  const baseUrl=(spec.apiFormat==="anthropic" && spec.baseUrl ? spec.baseUrl.replace(/\/v1\/?$/,"") : spec.baseUrl)??(spec.apiFormat==="anthropic"?"https://api.anthropic.com":"https://api.openai.com/v1");
  const deepseek=api==="openai-completions" && new URL(baseUrl).hostname==="api.deepseek.com";
  const model:Model<Api>={id:spec.model,name:spec.model,api,provider:"creatoros-pi",baseUrl,reasoning:false,...(deepseek?{compat:{maxTokensField:"max_tokens" as const}}:{}),input:["text","image"],cost:{input:0,output:0,cacheRead:0,cacheWrite:0},contextWindow:200000,maxTokens:32768};
  const models=createModels();
  const implementation=api==="anthropic-messages"?lazyApi(()=>import("@earendil-works/pi-ai/api/anthropic-messages")):api==="openai-completions"?lazyApi(()=>import("@earendil-works/pi-ai/api/openai-completions")):lazyApi(()=>import("@earendil-works/pi-ai/api/openai-responses"));
  models.setProvider(createProvider({id:model.provider,models:[model],auth:{apiKey:envApiKeyAuth("CreatorOS 内存凭据",[])},api:implementation}));
  const identity=providerIdentityFor({...spec,customEndpoint:Boolean(spec.baseUrl),displayModelKey:undefined});
  const events=(request:LanguageModelV4CallOptions)=>{
    const mediaParts=new Map<string,Record<string,unknown>>();
    const buildFailure=(error:unknown)=>new ModelRequestBuildError(safeErrorMessage(new Error(`${error instanceof Error?error.name:"Error"}: ${error instanceof Error?error.message:"请求构造失败"}`.replaceAll(spec.token,"[REDACTED]"))));
    let context:ReturnType<typeof toPiContext>;
    try{context=toPiContext(request,model,mediaParts);}catch(error){throw buildFailure(error);}
    const choice=request.toolChoice;
    const toolChoice=choice?.type==="tool"?(api==="anthropic-messages"?{type:"tool",name:choice.toolName}:api==="openai-responses"?{type:"function",name:choice.toolName}:{type:"function",function:{name:choice.toolName}}):choice?.type==="required"?(api==="anthropic-messages"?"any":"required"):choice?.type;
    let response:{statusCode:number;responseHeaders:Record<string,string>}|undefined,output=false,localFailure:unknown;
    const stream=models.stream({...model,reasoning:Boolean(request.reasoning && !["none","provider-default"].includes(request.reasoning))},context,{apiKey:spec.apiFormat==="anthropic" && spec.authStyle==="bearer"?undefined:spec.token,signal:request.abortSignal,maxTokens:request.maxOutputTokens,temperature:request.temperature,maxRetries:0,
      headers:{...Object.fromEntries(Object.entries(request.headers??{}).filter((entry):entry is [string,string]=>typeof entry[1]==="string")),...(spec.apiFormat==="anthropic" && spec.authStyle==="bearer"?{authorization:`Bearer ${spec.token}`}:{})},
      ...(request.reasoning && !["none","provider-default"].includes(request.reasoning)?{reasoningEffort:request.reasoning}:{}),
      ...(toolChoice?{toolChoice}:{}),
      onPayload:payload=>{try{
        const body=piPayload(request,api,payload,mediaParts);
        // SEMANTIC_BOUNDARY_ALLOW: DeepSeek 协议规定强制工具与思考模式互斥；不改变工具选择。
        if(deepseek && (choice?.type==="tool" || choice?.type==="required")){
          body.thinking={type:"disabled"};delete body.reasoning_effort;
        }
        return body;
      }catch(error){localFailure=buildFailure(error);throw localFailure;}},
      onResponse:fact=>{response={statusCode:fact.status,responseHeaders:fact.headers};},
    } as Parameters<typeof models.stream>[2]);
    return (async function*(){
      for await(const event of stream){
        if(event.type==="error"){
          if(localFailure)throw localFailure;
          // SEMANTIC_BOUNDARY_ALLOW: Pi 对供应商明确结束码的协议映射，不判断内容语义。
          if(event.error.errorMessage==="Provider finish_reason: content_filter"){
            yield {type:"done" as const,reason:"stop" as const,message:{...event.error,stopReason:"stop" as const}};continue;
          }
          console.warn(piProviderDiagnostic(spec,event.error.errorMessage??"供应商未返回完整模型结果",{statusCode:response?.statusCode,output}));
          if(!output && response && response.statusCode>=400){
            // 原错误文字只进入受控分类器，不能挂在 cause/响应字段泄露给调用方。
            const detail=providerErrorDetail(response.statusCode,event.error.errorMessage??"",[spec.token]);
            if(classifyRejection)throw classifyRejection({...response,message:detail});
            throw Object.assign(new Error(detail),{...response,providerErrorDetail:detail});
          }
          throw new Error("PI_MODEL_STREAM_RESULT_UNKNOWN");
        }
        output ||= event.type!=="start";
        yield event;
      }
    })();
  };
  const convert=(event:AssistantMessageEvent,toolInputs:Map<number,"started"|"suppressed">):LanguageModelV4StreamPart[]=>{
    if(event.type==="start")return [{type:"stream-start",warnings:[]}];
    if(event.type==="text_start" || event.type==="thinking_start")return [{type:event.type==="text_start"?"text-start":"reasoning-start",id:String(event.contentIndex)}];
    if(event.type==="text_delta" || event.type==="thinking_delta")return [{type:event.type==="text_delta"?"text-delta":"reasoning-delta",id:String(event.contentIndex),delta:event.delta}];
    if(event.type==="text_end" || event.type==="thinking_end"){
      const part=fromPiMessage(event.partial).content[event.contentIndex];
      return [{type:event.type==="text_end"?"text-end":"reasoning-end",id:String(event.contentIndex),...(part?.providerMetadata?{providerMetadata:part.providerMetadata}:{})}];
    }
    if(event.type==="toolcall_start" || event.type==="toolcall_delta"){
      const call=event.partial.content[event.contentIndex];
      if(toolInputs.get(event.contentIndex)==="suppressed")return [];
      if(call?.type!=="toolCall" || !call.id || !call.name){
        // Pi 支持晚到身份。已有非空参数但无真实身份时省略整个可选参数流，保留最终完整调用。
        if(event.type==="toolcall_delta" && event.delta!=="")toolInputs.set(event.contentIndex,"suppressed");
        return [];
      }
      // 只前送供应商的参数流活性；完整调用仍由 durable 在 finish 和结算后释放。
      const parts:LanguageModelV4StreamPart[]=[];
      if(!toolInputs.has(event.contentIndex)){toolInputs.set(event.contentIndex,"started");parts.push({type:"tool-input-start",id:call.id,toolName:call.name});}
      if(event.type==="toolcall_delta" && event.delta!=="")parts.push({type:"tool-input-delta",id:call.id,delta:event.delta});
      return parts;
    }
    if(event.type==="toolcall_end"){
      const started=toolInputs.get(event.contentIndex)==="started";toolInputs.delete(event.contentIndex);
      return [...(started?[{type:"tool-input-end" as const,id:event.toolCall.id}]:[]),{type:"tool-call",toolCallId:event.toolCall.id,toolName:event.toolCall.name,input:JSON.stringify(event.toolCall.arguments),...(event.toolCall.thoughtSignature?{providerMetadata:{pi:{thoughtSignature:event.toolCall.thoughtSignature}}}:{})}];
    }
    if(event.type==="done"){const result=fromPiMessage(event.message);return [{type:"response-metadata",...result.response},{type:"finish",finishReason:result.finishReason,usage:result.usage,providerMetadata:result.providerMetadata}];}
    return [];
  };
  return {specificationVersion:"v4",...identity,supportedUrls:{},
    async doGenerate(request){let final;for await(const event of events(request))if(event.type==="done")final=fromPiMessage(event.message);if(!final)throw Error("PI_MODEL_RESULT_INCOMPLETE");return final;},
    async doStream(request){
      const networkAbort=new AbortController();
      const toolInputs=new Map<number,"started"|"suppressed">();
      const iterator=events({...request,abortSignal:request.abortSignal?AbortSignal.any([request.abortSignal,networkAbort.signal]):networkAbort.signal}),buffer:LanguageModelV4StreamPart[]=[];
      // 等待首个实际输出或明确拒绝，使账本在尚未出流时仍能识别 401/429/5xx。
      while(true){const next=await iterator.next();if(next.done)throw Error("PI_MODEL_RESULT_INCOMPLETE");buffer.push(...convert(next.value,toolInputs));if(next.value.type!=="start")break;}
      return {stream:new ReadableStream<LanguageModelV4StreamPart>({
        async pull(controller){try{if(buffer.length){controller.enqueue(buffer.shift()!);return;}while(true){const next=await iterator.next();if(next.done){controller.close();return;}const parts=convert(next.value,toolInputs);if(parts.length){buffer.push(...parts);controller.enqueue(buffer.shift()!);return;}}}catch(error){controller.error(error);}},
        async cancel(){networkAbort.abort();await iterator.return(undefined);},
      })};
    },
  };
}
