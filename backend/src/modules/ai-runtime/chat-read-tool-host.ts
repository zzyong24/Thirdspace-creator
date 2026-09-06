import type {ToolSet} from "ai";
import {CHAT_READ_TOOL_NAMES} from "./chat-read-tool-names";
import {createChatHostToolAdapter,type ResolveChatHostTools} from "./chat-host-tool-adapter";
const effects=Object.freeze(Object.fromEntries(CHAT_READ_TOOL_NAMES.map(name=>[name,"none" as const])));
/** 仅允许已审计的短领域读取；搜索和浏览器即使声明 none，也不能进入宿主。 */
export function createChatReadToolHost(prototypes:ToolSet,resolve:ResolveChatHostTools){
 return createChatHostToolAdapter(prototypes,resolve,effects);
}
