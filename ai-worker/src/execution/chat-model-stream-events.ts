import type { LanguageModelV4StreamPart } from "@ai-sdk/provider";
import { createPersistentStreamWriter } from "./persistent-stream-writer";
/** 仅投影模型展示内容，不把工具声明或finish当成已完成事实。 */
export function createChatModelStreamEvents(callId:string,append:Parameters<typeof createPersistentStreamWriter>[1]) {
  const writer=createPersistentStreamWriter(callId,append);
  return {
    async push(part:LanguageModelV4StreamPart) {
      if(["text-start","text-delta","text-end","reasoning-start","reasoning-delta","reasoning-end"].includes(part.type) && "id" in part) {
        await writer.push(JSON.parse(JSON.stringify({...part,id:`${callId}:${part.id}`})));
      } else if(part.type==="source") {
        await writer.push(JSON.parse(JSON.stringify(part.sourceType==="url"
          ? {type:"source-url",sourceId:part.id,url:part.url,title:part.title,providerMetadata:part.providerMetadata}
          : {type:"source-document",sourceId:part.id,mediaType:part.mediaType,title:part.title,filename:part.filename,providerMetadata:part.providerMetadata})));
      } else if(part.type==="file" || part.type==="reasoning-file") {
        const url=part.data.type==="url"?part.data.url.toString():`data:${part.mediaType};base64,${typeof part.data.data==="string"?part.data.data:Buffer.from(part.data.data).toString("base64")}`;
        await writer.push(JSON.parse(JSON.stringify({type:part.type,mediaType:part.mediaType,url,providerMetadata:part.providerMetadata})));
      }
    },
    close:()=>writer.close(),
  };
}
