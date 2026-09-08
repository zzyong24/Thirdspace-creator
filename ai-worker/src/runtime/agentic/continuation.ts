import type { Context } from "@earendil-works/pi-ai";

export const AGENTIC_CONTINUATION_PROMPT = "继续当前尚未完成的任务。基于本会话已完成的工具调用和结果推进剩余工作，不要重复已完成的有副作用操作。确认当前用户意图已交付后再结束。";

/** SEMANTIC_BOUNDARY_ALLOW: 按时间保留完整工具回合，做传输窗口缩减，不评判素材或内容语义。
 * 完整回执仍在宿主账本；仅缩减进入模型的旧观察，保持原始意图与最近完整调用链。
 */
export function windowAgenticContext(context: Context): Context {
  const limit = 160_000;
  // 与宿主normalizePiContext相同的协议投影，忽略timestamp/SDK元数据，确保边界一致。
  const sizeOf=(messages:Context["messages"])=>JSON.stringify(messages.map(message=>message.role==="toolResult"
    ? {role:message.role,toolCallId:message.toolCallId,toolName:message.toolName,content:message.content,isError:message.isError}
    : {role:message.role,content:message.content})).length;
  const clipped=context.messages.map(message=>{
    if(message.role!=="toolResult")return message;
    return {...message,content:message.content.map(part=>part.type==="text" && part.text.length>24000
      ? {...part,text:`[本次传输仅显示结果首尾片段，完整回执保留；需要证据请继续读取原来源。]\n${part.text.slice(0,16000)}\n[…中间省略…]\n${part.text.slice(-8000)}`} : part)};
  });
  if (sizeOf(clipped) <= limit) return {...context,messages:clipped};
  const first = clipped[0];
  if (!first) return context;
  const groups: Context["messages"][] = [];
  for (const message of clipped.slice(1)) {
    if (message.role !== "toolResult" || groups.length === 0) groups.push([]);
    groups[groups.length - 1]!.push(message);
  }
  let size = sizeOf([first]);
  const kept: Context["messages"][] = [];
  for (let i = groups.length - 1; i >= 0; i--) {
    const group = groups[i]!;
    const bytes = sizeOf(group);
    if (kept.length > 0 && size + bytes > limit) break;
    kept.unshift(group); size += bytes;
  }
  const removed = context.messages.length - 1 - kept.flat().length;
  if (!removed) return {...context,messages:clipped};
  return {...context, messages:[first, {role:"user",content:`较早的 ${removed} 条过程消息已移出本次上下文窗口，完整结果保留在任务记录。继续当前意图；缺少证据时使用已有读取工具核对，不要凭记忆补造或重复写入。`,timestamp:0},...kept.flat()]};
}
