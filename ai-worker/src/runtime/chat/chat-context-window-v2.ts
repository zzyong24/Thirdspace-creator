import type { ModelMessage } from "ai";
/** SEMANTIC_BOUNDARY_ALLOW: 按完整协议回合与传输长度投影；不做摘要或语义重要性判断。 */
export function windowChatContextV2(messages:ModelMessage[],system:string,toolDefinitions:unknown,maxCharacters=240000,frozenMessageCount=messages.length){
 let shortened=false;
 const clipped=messages.map((message,index)=>{
  if(message.role==="tool")return {...message,content:message.content.map(part=>{
   if(part.type!=="tool-result")return part;
   // SEMANTIC_BOUNDARY_ALLOW: 分页协议回执已由宿主限页，不能再次裁掉游标或正文。
   if(["skill.read","skill_read","tool.result.read","tool_result_read","history.read","history_read"].includes(part.toolName))return part;
   const body=JSON.stringify(part.output);
   if(body.length<=14000)return part;
   shortened=true;
   return {...part,output:{type:"text" as const,value:`[原工具结果已省略，可调用 tool.result.read，toolCallId=${part.toolCallId}，offset=0 分页读回；不要重做原操作。]\n${body.slice(0,8000)}`}};
  })};
  if(message.role!=="user")return message;
  const clip=(text:string)=>{
   if(text.length<=24000)return text;
   shortened=true;
   return `[长消息仅展示首尾，可调用 history.read，messageIndex=${index}，offset=0 读回原消息。]\n${text.slice(0,16000)}\n[中段省略]\n${text.slice(-8000)}`;
  };
  return {...message,content:typeof message.content==="string"?clip(message.content):message.content.map(part=>part.type==="text"?{...part,text:clip(part.text)}:part)};
 });
 // 图像/文件载荷不按base64字符冒充文本token；保留原多模态数据。
 const measure=(value:unknown)=>{
  if(value && typeof value==="object" && "role" in value && "content" in value && Array.isArray(value.content)){
   return JSON.stringify({...value,content:value.content.map(part=>part && typeof part==="object" && part.type==="image"?{...part,image:"[media]"}:part && typeof part==="object" && part.type==="file"?{...part,data:"[media]"}:part)}).length;
  }
  return JSON.stringify(value).length;
 };
 const groups:number[][]=[];let active:number[]=[];let latestUser=-1,originalUser=-1;
 for(let i=0;i<clipped.length;i++){
  const role=clipped[i]!.role;
  if((role==="user" || role==="assistant" || role==="system") && active.length){groups.push(active);active=[];}
  if(role==="user"){latestUser=i;if(i<frozenMessageCount)originalUser=i;}
  active.push(i);
 }
 if(active.length)groups.push(active);
 let used=measure(system)+measure(toolDefinitions);
 const selected=new Set<number>();
 for(let i=groups.length-1;i>=0;i--){
  const group=groups[i]!,size=group.reduce((sum,index)=>sum+measure(clipped[index]),0);
  if(i===groups.length-1 || group.includes(latestUser) || group.includes(originalUser) || used+size<=maxCharacters){group.forEach(index=>selected.add(index));used+=size;}else shortened=true;
 }
 return {messages:clipped.filter((_,index)=>selected.has(index)),shortened};
}
