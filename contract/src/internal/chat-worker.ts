import { z } from "zod";
/** SEMANTIC_BOUNDARY_ALLOW:仅编码供应商工具标识符，不判断意图。 */
export const chatToolProviderName = (name: string) => name.replace(/[^a-zA-Z0-9_-]/g, "_");
export const chatWorkerInputSchema = z.object({
  kind: z.literal("chat.run"),
  operationKey: z.string().min(1).max(200),
  capability: z.string().min(1).max(128),
  userId: z.string().min(1),
  accountId: z.string().min(1),
  conversationId: z.string().min(1),
  sourceMessageId: z.string().min(1),
  system: z.string().max(500000),
  // 经后端历史投影后形成的模型消息；SDK 转换和文件编码由运行时负责。
  messages: z.array(z.object({role:z.enum(["system","user","assistant","tool"]),content:z.json()}).catchall(z.json())).min(1),
  maxSteps: z.number().int().min(2).max(12),
  maxOutputTokens: z.number().int().positive().max(65536),
  forcedTool: z.string().min(1).optional(),
  forcedToolSequence: z.array(z.string().min(1)).max(12).optional(),
  tools: z.array(z.object({
    name:z.string().min(1).max(256),version:z.string().min(1).max(128),
    description:z.string(),parameters:z.record(z.string(),z.json()),
    effect:z.enum(["none","proposal","committed"]),
    execution:z.enum(["host","worker.research","worker.script-hooks","worker.structured-node","host.task-submit"]).optional(),
  }).strict()).max(100),
}).strict().superRefine((value, ctx) => {
  for(const [index,tool] of value.tools.entries())if(tool.execution==="worker.research" && (tool.name!=="material.gather" || tool.effect!=="none"))ctx.addIssue({code:"custom",message:"研究执行声明与工具身份不符",path:["tools",index,"execution"]});
  const names = value.tools.map(tool => tool.name);
  for(const [index,tool] of value.tools.entries())if(tool.execution==="worker.structured-node" && (!["topic.enrich","positioning.generate"].includes(tool.name) || tool.effect!=="proposal"))ctx.addIssue({code:"custom",message:"结构化子节点声明与工具身份不符",path:["tools",index,"execution"]});
  for(const [index,tool] of value.tools.entries())if(tool.execution==="worker.script-hooks" && (tool.name!=="script.hooks" || tool.effect!=="proposal"))ctx.addIssue({code:"custom",message:"内部开场执行声明与工具身份不符",path:["tools",index,"execution"]});
  for(const [index,tool] of value.tools.entries())if(tool.execution==="host.task-submit" && (tool.name!=="planning.thesis" || tool.effect!=="committed"))ctx.addIssue({code:"custom",message:"事务任务提交声明与工具身份不符",path:["tools",index,"execution"]});
  if (new Set(names.map(chatToolProviderName)).size !== names.length)
    ctx.addIssue({code:"custom",message:"工具名称编码冲突",path:["tools"]});
  for (const name of [value.forcedTool, ...(value.forcedToolSequence ?? [])])
    if(name && !names.includes(name)) ctx.addIssue({code:"custom",message:"指定工具不在冻结范围",path:["tools"]});
  if(JSON.stringify(value).length > 4_000_000) ctx.addIssue({code:"custom",message:"聊天冻结输入过大"});
});
