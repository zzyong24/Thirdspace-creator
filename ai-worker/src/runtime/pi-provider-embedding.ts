import type { EmbeddingModelV4 } from "@ai-sdk/provider";
import type { ModelSpec } from "./provider-factory";
/** Pi 未提供 embedding：这是独立 OpenAI-compatible HTTP 端口，不伪称 Pi 向量能力。 */
export function createHttpEmbeddingModel(spec:ModelSpec,classifyRejection?:(facts:{statusCode:number;responseHeaders:Record<string,string>;message:string})=>Error):EmbeddingModelV4{
  return {specificationVersion:"v4",provider:spec.baseUrl?"creatoros-custom-embedding.embedding":"openai.embedding",modelId:spec.model,maxEmbeddingsPerCall:2048,supportsParallelCalls:true,
    async doEmbed(options){
      const result=await fetch(`${(spec.baseUrl??"https://api.openai.com/v1").replace(/\/$/,"")}/embeddings`,{method:"POST",signal:options.abortSignal,
        headers:{"content-type":"application/json",...options.headers,authorization:`Bearer ${spec.token}`},body:JSON.stringify({model:spec.model,input:options.values,encoding_format:"float"})});
      if(!result.ok){
        const facts={statusCode:result.status,responseHeaders:Object.fromEntries(result.headers),message:await result.text()};
        if(classifyRejection)throw classifyRejection(facts);
        throw Object.assign(new Error(`Embedding provider HTTP ${result.status}`),{statusCode:result.status,responseHeaders:facts.responseHeaders});
      }
      const raw=await result.json() as {data?:Array<{index:number;embedding:number[]}>;usage?:{total_tokens?:number}};
      if(!Array.isArray(raw.data)||raw.data.length!==options.values.length)throw Error("EMBEDDING_RESPONSE_INCOMPLETE");
      const sorted=[...raw.data].sort((a,b)=>a.index-b.index);
      for(const [index,row] of sorted.entries())if(row.index!==index || !Array.isArray(row.embedding) || !row.embedding.length || row.embedding.some(value=>!Number.isFinite(value)))throw Error("EMBEDDING_RESPONSE_INVALID");
      const tokens=raw.usage?.total_tokens;
      return {embeddings:sorted.map(row=>row.embedding),...(typeof tokens==="number"&&Number.isInteger(tokens)&&tokens>=0?{usage:{tokens}}:{}),warnings:[]};
    },
  };
}
