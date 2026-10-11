import type {ModelMessage} from 'ai';
const bytes=(value:unknown)=>value instanceof Uint8Array?Buffer.from(value).toString('base64'):value instanceof ArrayBuffer?Buffer.from(value).toString('base64'):undefined;
/** SEMANTIC_BOUNDARY_ALLOW: 只保存用户消息SDK已取得的媒体字节，不读取URL/路径，不改变历史工具事实。 */
export function freezeChatModelMessages(messages:ModelMessage[]){
 const normalized=messages.map(message=>{
  if(message.role!=='user'||!Array.isArray(message.content))return message;
  return {...message,content:message.content.map(part=>{
   const record=part as unknown as Record<string,unknown>;
   if(record.type==='file'&&record.data&&typeof record.data==='object'){
    const data=record.data as Record<string,unknown>,encoded=data.type==='data'?bytes(data.data):undefined;
    if(encoded!==undefined)return {...record,data:{...data,data:encoded}};
   }
   return part;
  })};
 });
 return JSON.parse(JSON.stringify(normalized));
}
