import type { LanguageModelV4CallOptions, LanguageModelV4GenerateResult } from "@ai-sdk/provider";
import type { AssistantMessage, Context, Model, Api, Message, TextContent, ImageContent } from "@earendil-works/pi-ai";

export class PiProtocolError extends Error { readonly statusCode=400; }
const object=(value:unknown):Record<string,any>=>value && typeof value==="object" && !Array.isArray(value)?value as Record<string,any>:{};
const zeroUsage=()=>({input:0,output:0,cacheRead:0,cacheWrite:0,totalTokens:0,cost:{input:0,output:0,cacheRead:0,cacheWrite:0,total:0}});
export function toPiContext(request:LanguageModelV4CallOptions,model:Model<Api>,mediaParts=new Map<string,Record<string,unknown>>()):Context{
  const messages:Message[]=[],systems:string[]=[];
  const wireMedia=(native:Record<string,unknown>):TextContent=>{
    let marker=`[creatoros-media:${mediaParts.size}]`;
    while(JSON.stringify(request).includes(marker)||mediaParts.has(marker))marker+="_";
    mediaParts.set(marker,native);return {type:"text",text:marker};
  };
  const unavailableMedia=(part:any):TextContent=>({type:"text",text:`[附件读取提示：${part.filename??part.mediaType??part.type} 当前模型协议不能直接读取；原附件仍保留，内容未知。${part.data?.type==="url"?`来源：${String(part.data.url)}。`:part.data?.type==="reference"?`文件引用：${JSON.stringify(part.data.reference)}。`:""}可继续使用已有正文，或调用附件提取/转写工具获取正文，不能声称已读取此附件。]`});
  const media=(part:any):TextContent|ImageContent=>{
    if(part.type==="text")return {type:"text",text:part.text};
    const data=part.data;
    if(data?.type==="text")return {type:"text",text:data.text};
    if(part.mediaType?.startsWith("text/")&&data?.type==="data")return {type:"text",text:Buffer.from(data.data,typeof data.data==="string"?"base64":undefined).toString("utf8")};
    if(data?.type==="reference"){
      const ref=object(data.reference),id=ref.openai??ref[model.provider]??ref[request.providerOptions?Object.keys(request.providerOptions)[0]??"":""];
      if(typeof id==="string"&&model.api==="openai-completions")return wireMedia({type:"file",file:{file_id:id}});
      if(typeof id==="string"&&model.api==="openai-responses")return wireMedia({type:"input_file",file_id:id});
      return unavailableMedia(part);
    }
    if(model.api==="openai-completions"&&["audio/wav","audio/mp3","audio/mpeg"].includes(part.mediaType)&&data?.type==="data")return wireMedia({type:"input_audio",input_audio:{data:typeof data.data==="string"?data.data:Buffer.from(data.data).toString("base64"),format:part.mediaType==="audio/wav"?"wav":"mp3"}});
    if(part.mediaType?.startsWith("image/") && data?.type==="data")return {type:"image",mimeType:part.mediaType,data:typeof data.data==="string"?data.data:Buffer.from(data.data).toString("base64")};
    if(part.mediaType==="application/pdf" || (part.mediaType?.startsWith("image/") && data?.type==="url")){
      const encoded=data?.type==="data"?(typeof data.data==="string"?data.data:Buffer.from(data.data).toString("base64")):undefined;
      const url=data?.type==="url"?String(data.url):undefined;
      let native:Record<string,unknown>;
      if(part.mediaType.startsWith("image/"))native=model.api==="anthropic-messages"?{type:"image",source:{type:"url",url}}:model.api==="openai-responses"?{type:"input_image",image_url:url}:{type:"image_url",image_url:{url}};
      else if(model.api==="anthropic-messages")native={type:"document",source:encoded?{type:"base64",media_type:"application/pdf",data:encoded}:{type:"url",url}};
      else if(model.api==="openai-responses")native=encoded?{type:"input_file",filename:part.filename??"document.pdf",file_data:`data:application/pdf;base64,${encoded}`}:{type:"input_file",file_url:url};
      else if(encoded)native={type:"file",file:{filename:part.filename??"document.pdf",file_data:`data:application/pdf;base64,${encoded}`}};
      else return unavailableMedia(part);
      if(!encoded&&!url)throw new PiProtocolError("附件缺少可用数据");
      return wireMedia(native);
    }
    // 可选媒体的协议差异不反杀整项任务；明确声明未读取，保留可用正文继续执行。
    return unavailableMedia(part);
  };
  const toolResult=(part:any)=>{
    const out=part.output;
    const content: Array<TextContent|ImageContent>=out.type==="content"?out.value.map(media):[{type:"text",text:out.type==="execution-denied"?out.reason??"用户拒绝本次执行":typeof out.value==="string"?out.value:JSON.stringify(out.value??null)}];
    messages.push({role:"toolResult",toolCallId:part.toolCallId,toolName:part.toolName,content,isError:out.type.startsWith("error")||out.type==="execution-denied",timestamp:0});
  };
  for(const message of request.prompt){
    if(message.role==="system"){systems.push(message.content);continue;}
    if(message.role==="user"){messages.push({role:"user",content:message.content.map(media),timestamp:0});continue;}
    if(message.role==="tool"){
      for(const part of message.content){if(part.type==="tool-result")toolResult(part);
        // SEMANTIC_BOUNDARY_ALLOW: 授权响应是宿主协议事实；与旧供应商编译器一致不发送它，
        // 本地授权执行仍由后端判断，不能从该历史消息获得执行权。
        else if(part.type!=="tool-approval-response")throw new PiProtocolError("未知工具消息类型");}
      continue;
    }
    const assistant:AssistantMessage={role:"assistant",content:[],api:model.api,provider:model.provider,model:model.id,usage:zeroUsage(),stopReason:"stop",timestamp:0};
    const results:any[]=[];
    for(const part of message.content){
      const metadata=object(part.providerOptions),pi=object(metadata.pi);
      if(part.type==="text")assistant.content.push({type:"text",text:part.text,...(pi.textSignature?{textSignature:pi.textSignature}:{})});
      else if(part.type==="reasoning"){
        const signature=pi.thinkingSignature??object(metadata.anthropic).signature;
        assistant.content.push({type:"thinking",thinking:part.text,...(signature?{thinkingSignature:signature}:{}),...(pi.redacted?{redacted:true}:{})});
      }else if(part.type==="tool-call"){
        assistant.content.push({type:"toolCall",id:part.toolCallId,name:part.toolName,arguments:part.input as Record<string,unknown>,...(pi.thoughtSignature?{thoughtSignature:pi.thoughtSignature}:{})});assistant.stopReason="toolUse";
      }else if(part.type==="tool-result")results.push(part);
      else if(part.type==="file" || part.type==="reasoning-file")assistant.content.push(unavailableMedia(part));
      else throw new PiProtocolError(`Pi 历史消息暂不支持 ${part.type}，未丢弃原始内容`);
    }
    if(assistant.content.length)messages.push(assistant);
    for(const result of results)toolResult(result);
  }
  const tools=(request.tools??[]).map(tool=>{
    if(tool.type!=="function")throw new PiProtocolError("供应商专属工具须先映射到已注册 Pi 工具");
    return {name:tool.name,description:tool.description??"",parameters:tool.inputSchema as any};
  });
  return {systemPrompt:systems.join("\n\n"),messages,tools};
}
export function fromPiMessage(message:AssistantMessage):LanguageModelV4GenerateResult{
  const u=message.usage,known=u.input+u.output+u.cacheRead+u.cacheWrite>0;
  return {content:message.content.map(part=>part.type==="text"
    ? {type:"text" as const,text:part.text,...(part.textSignature?{providerMetadata:{pi:{textSignature:part.textSignature}}}:{})}
    :part.type==="thinking"?{type:"reasoning" as const,text:part.thinking,providerMetadata:{pi:{...(part.thinkingSignature?{thinkingSignature:part.thinkingSignature}:{}),...(part.redacted?{redacted:true}:{})}}}
    :{type:"tool-call" as const,toolCallId:part.id,toolName:part.name,input:JSON.stringify(part.arguments),...(part.thoughtSignature?{providerMetadata:{pi:{thoughtSignature:part.thoughtSignature}}}:{})}),
    finishReason:{unified:message.errorMessage==="Provider finish_reason: content_filter"?"content-filter":message.stopReason==="toolUse"?"tool-calls":message.stopReason==="aborted"?"error":message.stopReason,raw:message.stopReason},
    usage:{inputTokens:{total:known?u.input+u.cacheRead+u.cacheWrite:undefined,noCache:known?u.input:undefined,cacheRead:known?u.cacheRead:undefined,cacheWrite:known?u.cacheWrite:undefined},outputTokens:{total:known?u.output:undefined,text:known&&u.reasoning!==undefined?u.output-u.reasoning:undefined,reasoning:u.reasoning}},warnings:[],
    response:{...(message.responseId?{id:message.responseId}:{}),timestamp:new Date(message.timestamp)},
  };
}
/** 协议参数映射，不对内容作语义改写；未知选项明确失败，禁止静默换语义。 */
/** SEMANTIC_BOUNDARY_ALLOW: 附件占位符只做无损 wire 编码，不选择或裁剪资料。 */
export function piPayload(request:LanguageModelV4CallOptions,api:string,payload:unknown,mediaParts=new Map<string,Record<string,unknown>>()){
  const replace=(value:unknown):unknown=>{
    if(Array.isArray(value))return value.map(replace);
    if(value&&typeof value==="object"){
      const row=object(value);
      if(["text","input_text"].includes(row.type)&&typeof row.text==="string"&&mediaParts.has(row.text))return mediaParts.get(row.text);
      return Object.fromEntries(Object.entries(row).map(([key,item])=>[key,replace(item)]));
    }
    return value;
  };
  const result={...object(replace(payload))},json=request.responseFormat;
  if(json?.type==="json"){
    const format=json.schema?{type:"json_schema",name:json.name??"response",schema:json.schema,strict:true}:{type:"json_object"};
    if(api==="openai-completions")result.response_format=json.schema?{type:"json_schema",json_schema:{name:format.name,schema:format.schema,strict:true}}:format;
    else if(api==="openai-responses")result.text={...object(result.text),format};
    else if(json.schema)result.output_config={...object(result.output_config),format:{type:"json_schema",schema:json.schema}};
    else throw new PiProtocolError("Anthropic 原生 JSON 输出需要 schema");
  }
  for(const [key,value] of Object.entries({top_p:request.topP,top_k:request.topK,frequency_penalty:request.frequencyPenalty,presence_penalty:request.presencePenalty,seed:request.seed}))if(value!==undefined)result[key]=value;
  if(request.stopSequences?.length)result[api==="anthropic-messages"?"stop_sequences":"stop"]=request.stopSequences;
  return result;
}
