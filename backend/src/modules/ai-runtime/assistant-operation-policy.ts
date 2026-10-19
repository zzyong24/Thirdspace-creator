import {isAssistantEngineToolAllowed} from "@creatoros/contract";
import type {ToolSet} from "ai";
import type {prepareChatToolDefinitions} from "./chat-tool-definitions";
type Definition=Awaited<ReturnType<typeof prepareChatToolDefinitions>>["definitions"][number];
/** 与执行端共用同一合同政策；先核真实定义，再决定当轮目录。 */
export function selectAssistantTools(engine:"pi"|"codex",tools:ToolSet,definitions:readonly Definition[]):ToolSet{
  return Object.fromEntries(definitions.filter(def=>isAssistantEngineToolAllowed(engine,def)).map(def=>[def.name,tools[def.name]!]));
}
