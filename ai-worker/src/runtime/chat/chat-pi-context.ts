import type { ModelMessage } from "ai";

/**
 * SEMANTIC_BOUNDARY_ALLOW:只按时间与传输长度裁剪完整协议回合，不判断业务重要性。
 * 原始用户消息及最新回合保留；真实全文仍在账本/资料端口中，不生成伪摘要。
 */
export function windowChatPiMessages(messages:ModelMessage[],maxCharacters=240_000){
  let shortened=false;
  const hasImage=(message:ModelMessage)=>message.role==="tool"&&message.content.some(part=>part.type==="tool-result"&&
   part.output.type==="content"&&part.output.value.some(item=>item.type==="file"));
  // 同一模型工具批次可以先截图再运行文字工具；最近一张仍须进入下一次模型请求。
  let latestImage=-1;
  for(let i=messages.length-1;i>=0;i--){
    if(messages[i]!.role==="assistant")break;
    if(hasImage(messages[i]!)){latestImage=i;break;}
  }
  const clipped=messages.map((message,index)=>{
    if(message.role!=="tool")return message;
    return {...message,content:message.content.map(part=>{
      if(part.type!=="tool-result")return part;
      if(part.output.type==="content"&&part.output.value.some(item=>item.type==="file")){
        if(index===latestImage)return part;
        shortened=true;
        return {...part,output:{type:"text" as const,value:`[历史截图已省略；原回执仍在工具账本。需要文字证据时调用 tool.result.read，toolCallId=${part.toolCallId}。]`}};
      }
      const encoded=JSON.stringify(part.output);
      if(encoded.length<=16_000)return part;
      shortened=true;
      return {...part,output:{type:"text" as const,value:`[传输窗口仅显示工具结果首尾片段，非完整正文；需要完整证据时请用原来源或资料读取工具。原结果已保留。]\n${encoded.slice(0,12_000)}\n[…中间已省略…]\n${encoded.slice(-4_000)}`}};
    })};
  });
  const pinned=new Set<number>(),groups:number[][]=[];
  let active:number[]|undefined;
  for(let i=0;i<clipped.length;i++){
    const message=clipped[i]!;
    if(message.role==="user" || message.role==="system"){
      pinned.add(i);active=undefined;
    }else if(message.role==="assistant"){
      active=[i];groups.push(active);
    }else if(active)active.push(i);
    else pinned.add(i); // 历史协议保留：不猜测孤立授权响应的归属。
  }
  const size=(index:number)=>JSON.stringify(clipped[index],(_key,value)=>value&&typeof value==="object"&&value.type==="file"?{type:"file",mediaType:value.mediaType,data:"[media]"}:value).length;
  let used=[...pinned].reduce((sum,index)=>sum+size(index),0);
  const selected=new Set(pinned);
  for(let i=groups.length-1;i>=0;i--){
    const group=groups[i]!,bytes=group.reduce((sum,index)=>sum+size(index),0);
    if(i===groups.length-1 || used+bytes<=maxCharacters){for(const index of group)selected.add(index);used+=bytes;}
    else shortened=true;
  }
  return {messages:clipped.filter((_message,index)=>selected.has(index)),shortened};
}
