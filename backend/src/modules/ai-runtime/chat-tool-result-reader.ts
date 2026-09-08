import { jsonSchema } from "ai";
import { defineChatTool } from "./chat-tool-gate";
export interface ChatToolResultPage { kind: "tool.result.read"; toolCallId: string; text: string; offset: number; totalCharacters: number; hasMore: boolean; nextOffset: number|null }
export type ChatToolResultReader = (input:{toolCallId?:string;offset?:number})=>Promise<ChatToolResultPage>;
export function buildChatToolResultReader(read?:ChatToolResultReader){
 return defineChatTool("tool.result.read",{
  description:"分页读取当前任务或冻结对话中已返回的工具结果。不传toolCallId时读取结果目录，再使用原toolCallId与offset；绝不重新执行原工具，也不读取别的对话。用于恢复上下文中省略的原始结果。",
  inputSchema:jsonSchema<{toolCallId?:string;offset?:number}>({type:"object",properties:{toolCallId:{type:"string",minLength:1},offset:{type:"integer",minimum:0}},additionalProperties:false}),
  execute:async input=>{if(!read)throw Error("TOOL_RESULT_READER_UNAVAILABLE");return read(input);},
 });
}

export type ChatHistoryReader=(input:{messageIndex?:number;offset?:number})=>Promise<ChatToolResultPage>;
export function buildChatHistoryReader(read?:ChatHistoryReader){
 return defineChatTool("history.read",{
  description:"按原消息索引分页读回当前任务冻结历史中省略的消息。只读当前任务，不能跨账号或对话；不传messageIndex先读取消息目录，messageIndex从0开始，超长内容按nextOffset续读。",
  inputSchema:jsonSchema<{messageIndex?:number;offset?:number}>({type:"object",properties:{messageIndex:{type:"integer",minimum:0},offset:{type:"integer",minimum:0}},additionalProperties:false}),
  execute:async input=>{if(!read)throw Error("HISTORY_READER_UNAVAILABLE");return {...await read(input),kind:"history.read",messageIndex:input.messageIndex};},
 });
}
