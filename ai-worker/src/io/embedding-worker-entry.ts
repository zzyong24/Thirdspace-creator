import {embedMany,wrapEmbeddingModel} from "ai";
import {setTimeout as delay} from "node:timers/promises";
import {getRetryAfterMs} from "../runtime/retry-policy";
import {embeddingModelFor} from "../runtime/provider-factory";
import {embeddingIoRequestSchema} from "@creatoros/contract/embedding-io";
const active=new Map<string,AbortController>();
function send(message:unknown){if(process.connected)process.send?.(message as never);}
process.on("message",async raw=>{
 const parsed=embeddingIoRequestSchema.safeParse(raw);if(!parsed.success)return;
 const input=parsed.data;
 if(input.type==="cancel"){active.get(input.requestId)?.abort();return;}
 if(active.has(input.requestId)||active.size>=2){send({type:"error",requestId:input.requestId,code:"invalid"});return;}
 const controller=new AbortController();active.set(input.requestId,controller);
 const timer=setTimeout(()=>controller.abort(),Math.max(0,input.deadlineAt-Date.now()));
 try{
  controller.signal.throwIfAborted();if(Date.now()>=input.deadlineAt)throw new Error("expired");
  // SDK 不做隐式重试；仅整个单次请求明确 429 时重试一次，已完成的分批不重发。
  const rawModel=embeddingModelFor(input.spec);
  if(typeof rawModel==="string"||rawModel.specificationVersion==="v2")throw new Error("embedding factory returned unsupported identity");
  const model=wrapEmbeddingModel({model:rawModel,middleware:{wrapEmbed:async({doEmbed})=>{
   for(let attempt=0;;attempt++){
    controller.signal.throwIfAborted();
    try{return await doEmbed();}catch(error){
     const status=error&&typeof error==="object"?(error as {statusCode?:number}).statusCode:undefined;
     if(status!==429||attempt>=1||controller.signal.aborted)throw error;
     await delay(getRetryAfterMs(error)??1000,undefined,{signal:controller.signal});
    }
   }
  }}});
  const result=await embedMany({model,values:input.texts,maxRetries:0,maxParallelCalls:1,abortSignal:controller.signal});
  controller.signal.throwIfAborted();send({type:"result",requestId:input.requestId,embeddings:result.embeddings});
 }catch(error){
  const status=error&&typeof error==="object"?(error as {statusCode?:number}).statusCode:undefined;
  const code=controller.signal.aborted?"cancelled":status&&status>=400&&status<500&&status!==408?"rejected":"unknown";
  send({type:"error",requestId:input.requestId,code});
 }finally{clearTimeout(timer);active.delete(input.requestId);}
});
process.on("disconnect",()=>{for(const controller of active.values())controller.abort();process.exit(0);});
send({type:"ready"});
