export interface ChatToolResultPage { kind: "tool.result.read"; toolCallId: string; text: string; offset: number; totalCharacters: number; hasMore: boolean; nextOffset: number|null }
/** 对已结算结果做传输分页，不重新执行原工具，不判断内容语义。 */
export function pageChatToolResult(toolCallId:string, output:unknown, offset=0):ChatToolResultPage {
 const text=JSON.stringify(output??null);
 if(!Number.isSafeInteger(offset)||offset<0||offset>text.length)throw Error("TOOL_RESULT_OFFSET_OUT_OF_RANGE");
 const end=Math.min(offset+12000,text.length);
 return {kind:"tool.result.read",toolCallId,text:text.slice(offset,end),offset,totalCharacters:text.length,hasMore:end<text.length,nextOffset:end<text.length?end:null};
}
