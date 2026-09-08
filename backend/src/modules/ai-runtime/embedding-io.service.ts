import type {RequestContext} from "@creatoros/contract";
import type {ModelSpec} from "@creatoros/ai-worker";
import {embeddingIoRequestSchema,embeddingIoResponseSchema} from "@creatoros/contract/embedding-io";
import {createRequestIoService} from "./request-io.service";
export function createEmbeddingIoService(deps:{entryPath:()=>string;timeoutMs?:number}){
 const io=createRequestIoService({...deps,parseInput:input=>embeddingIoRequestSchema.parse(input),parseResponse:raw=>{
  const message=embeddingIoResponseSchema.parse(raw);
  return message.type==="result"?{type:"result",requestId:message.requestId,value:message.embeddings}:message.type==="error"?{type:"error",requestId:message.requestId,message:`EMBEDDING_IO_${message.code.toUpperCase()}`}:message;
 }});
 return {async embed(ctx:RequestContext,spec:ModelSpec,texts:string[],signal?:AbortSignal):Promise<number[][]>{
  const count=texts.length;
  const result=await io.request(ctx,{type:"embed",spec:{...spec},texts:[...texts]},signal) as number[][];
  if(result.length!==count||result.some(vector=>vector.length!==result[0]?.length))throw new Error("EMBEDDING_IO_INVALID");
  return result;
 },stop:()=>io.stop()};
}
