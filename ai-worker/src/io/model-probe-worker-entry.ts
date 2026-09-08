import {streamText} from "ai";
import {setTimeout as delay} from "node:timers/promises";
import {modelFor} from "../runtime/provider-factory";
import {generateImage} from "../runtime/multimodal-factory";
import {createMinimaxAdapter} from "../runtime/multimodal-minimax";
import {createOpenaiImagesAdapter} from "../runtime/multimodal-openai-images";
import {modelProbeRequestSchema} from "@creatoros/contract/model-probe-io";
const active=new Map<string,AbortController>();
function send(value:unknown){if(process.connected)process.send?.(value as never);}
process.on("message",async raw=>{
 const parsed=modelProbeRequestSchema.safeParse(raw);if(!parsed.success)return;const input=parsed.data;
 if(input.type==="cancel"){active.get(input.requestId)?.abort();return;}
 if(active.has(input.requestId)||active.size>=2){send({type:"error",requestId:input.requestId,message:"连接测试请求冲突"});return;}
 const controller=new AbortController();active.set(input.requestId,controller);const signal=controller.signal;
 const timer=setTimeout(()=>controller.abort(),Math.max(0,input.deadlineAt-Date.now()));
 try{
  if(Date.now()>=input.deadlineAt)throw new Error("连接测试已超时");signal.throwIfAborted();
  let value:{text:string;reasoningText:string}|{byteLength:number};
  if(input.type==="text"){
   const result=streamText({model:modelFor(input.spec),prompt:"连接测试。请只回复 OK。",maxOutputTokens:128,maxRetries:0,abortSignal:signal});
   let text="",reasoningText="";
   for await(const part of result.fullStream){
    if(part.type==="error")throw part.error;
    if(part.type==="text-delta")text+=part.text;else if(part.type==="reasoning-delta")reasoningText+=part.text;
    if(text.trim()||reasoningText.trim())break;
   }
   value={text,reasoningText};
  }else{
   const fetchBound:typeof fetch=(url,init)=>{signal.throwIfAborted();return fetch(url,{...init,signal});};
   const registry={minimax:createMinimaxAdapter({fetch:fetchBound,sleep:ms=>delay(ms,undefined,{signal}),pollIntervalMs:5000,maxPollAttempts:120}),openai:createOpenaiImagesAdapter({fetch:fetchBound,sleep:ms=>delay(ms,undefined,{signal}),maxTransientAttempts:1})};
   const result=await generateImage({...input.spec,kind:"image"},{prompt:"连接测试:一个纯色小圆点",aspectRatio:"1:1"},registry);
   value={byteLength:result.assetBytes?.byteLength??0};
  }
  signal.throwIfAborted();send({type:"result",requestId:input.requestId,value});
 }catch(error){
  let message=error instanceof Error?error.message:String(error);
  if(input.spec.token)message=message.split(input.spec.token).join("[redacted]");
  const status=error&&typeof error==="object"?(error as {statusCode?:number;status?:number}).statusCode??(error as {status?:number}).status:undefined;
  send({type:"error",requestId:input.requestId,message:`${status??""} ${message}`.slice(0,2000)});
 }finally{controller.abort();clearTimeout(timer);active.delete(input.requestId);}
});
process.on("disconnect",()=>{for(const controller of active.values())controller.abort();process.exit(0);});
send({type:"ready"});
