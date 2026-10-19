import {chatSubmittedTaskType} from "./chat-task-submission";
import { z } from "zod";
import { workbenchCapabilitySchema } from "./agent-workbench";
/** SEMANTIC_BOUNDARY_ALLOW:仅编码供应商工具标识符，不判断意图。 */
export const chatToolProviderName = (name: string) => name.replace(/[^a-zA-Z0-9_-]/g, "_");
export const codexAcpBinding={protocolKind:"acp",clientCommit:"27efb1b57b9de22105a91e9154b1d29b51ede8cb",adapterVersion:"2.1.1",runtimeVersion:"0.159.3",policy:"creatoros-acp-readonly-v2"} as const;
export const externalAgentBindingSchema=z.object({protocolKind:z.literal(codexAcpBinding.protocolKind),clientCommit:z.literal(codexAcpBinding.clientCommit),adapterVersion:z.literal(codexAcpBinding.adapterVersion),runtimeVersion:z.literal(codexAcpBinding.runtimeVersion),policy:z.enum(["creatoros-acp-readonly-v1","creatoros-acp-readonly-v2"])}).strict();
export const chatWorkerInputSchema = z.object({
  executionEngine:z.enum(["pi","codex","codebuddy"]).optional(),
  externalAgentBinding:externalAgentBindingSchema.optional(),
  /** 宿主从v2根冻结投影；旧输入不补默认。 */
  modelRoutingVersion:z.literal(2).optional(),
  codexNativeImageGeneration:z.literal(false).optional(),
  requestedModel:z.string().min(1).max(512).optional(),
  recoverMissingFinal:z.boolean().optional(),
  terminalToolFailurePolicyVersion:z.literal(1).optional(),
  contextPolicyVersion:z.literal(2).optional(),
  toolOutcomeProjectionVersion:z.literal(1).optional(),
  externalToolProjectionVersion:z.literal(1).optional(),
  kind: z.literal("chat.run"),
  operationKey: z.string().min(1).max(200),
  capability: z.string().min(1).max(128),
  userId: z.string().min(1),
  accountId: z.string().min(1).nullable(),
  groupId: z.string().min(1).nullable().optional(),
  groupVersion: z.number().int().positive().nullable().optional(),
  membershipVersion: z.number().int().positive().nullable().optional(),
  conversationId: z.string().min(1),
  sourceMessageId: z.string().min(1),
  system: z.string().max(500000),
  // 经后端历史投影后形成的模型消息；SDK 转换和文件编码由运行时负责。
  messages: z.array(z.object({role:z.enum(["system","user","assistant","tool"]),content:z.json()}).catchall(z.json())).min(1),
  maxSteps: z.number().int().min(2).max(12),
  maxOutputTokens: z.number().int().positive().max(65536),
  forcedTool: z.string().min(1).optional(),
  forcedToolSequence: z.array(z.string().min(1)).max(12).optional(),
  /** 提交时冻结的可信目录；身份与权限不来自模型参数。 */
  workbenchCapabilities: z.array(workbenchCapabilitySchema).max(100).optional(),
  workbenchPlatform: z.enum(["macos","windows","linux"]).optional(),
  tools: z.array(z.object({
    name:z.string().min(1).max(256),version:z.string().min(1).max(128),
    description:z.string(),parameters:z.record(z.string(),z.json()),
    effect:z.enum(["none","proposal","committed"]),
    execution:z.enum(["host","worker.redfox","worker.web-read","worker.research","worker.script-draft","worker.script-hooks","worker.structured-node","host.task-submit"]).optional(),
  }).strict()).max(100),
}).strict().superRefine((value, ctx) => {
  if(!value.accountId && !value.groupId)ctx.addIssue({code:"custom",message:"聊天缺少组或真实账号范围"});
  if(value.externalAgentBinding && value.executionEngine!=="codex")ctx.addIssue({code:"custom",message:"ACP绑定与引擎不符",path:["externalAgentBinding"]});
  for(const [index,tool] of value.tools.entries())if(tool.execution==="worker.web-read" && (tool.name!=="web.read" || tool.effect!=="committed"))ctx.addIssue({code:"custom",message:"网页读取声明与工具身份不符",path:["tools",index,"execution"]});
  for(const [index,tool] of value.tools.entries())if(tool.execution==="worker.research" && (tool.name!=="material.gather" || tool.effect!=="none"))ctx.addIssue({code:"custom",message:"研究执行声明与工具身份不符",path:["tools",index,"execution"]});
  for(const [index,tool] of value.tools.entries())if(tool.execution==="worker.redfox" && (tool.name!=="redfox.query" || tool.effect!=="committed"))ctx.addIssue({code:"custom",message:"RedFox执行声明与工具身份不符",path:["tools",index,"execution"]});
  const names = value.tools.map(tool => tool.name);
  for(const [index,tool] of value.tools.entries())if(tool.execution==="worker.structured-node" && (!["topic.enrich","positioning.generate","calibration.diagnose","topic.generate","review.analyze","knowledge.distill"].includes(tool.name) || tool.effect!=="proposal"))ctx.addIssue({code:"custom",message:"结构化子节点声明与工具身份不符",path:["tools",index,"execution"]});
  for(const [index,tool] of value.tools.entries())if(tool.execution==="worker.script-draft" && (tool.name!=="script.draft" || tool.effect!=="committed"))ctx.addIssue({code:"custom",message:"整稿执行声明与工具身份不符",path:["tools",index,"execution"]});
  for(const [index,tool] of value.tools.entries())if(tool.execution==="worker.script-hooks" && (tool.name!=="script.hooks" || tool.effect!=="proposal"))ctx.addIssue({code:"custom",message:"内部开场执行声明与工具身份不符",path:["tools",index,"execution"]});
  for(const [index,tool] of value.tools.entries())if(tool.execution==="host.task-submit" && (!chatSubmittedTaskType(tool.name) || tool.name==="script.draft" || tool.effect!=="committed"))ctx.addIssue({code:"custom",message:"事务任务提交声明与工具身份不符",path:["tools",index,"execution"]});
  if (new Set(names.map(chatToolProviderName)).size !== names.length)
    ctx.addIssue({code:"custom",message:"工具名称编码冲突",path:["tools"]});
  for (const name of [value.forcedTool, ...(value.forcedToolSequence ?? [])])
    if(name && !names.includes(name)) ctx.addIssue({code:"custom",message:"指定工具不在冻结范围",path:["tools"]});
  const workbenchNames = new Set<string>();
  if ((value.workbenchCapabilities?.length ?? 0) > 0 && !value.workbenchPlatform) ctx.addIssue({code:"custom",message:"Workbench 冻结目录缺少宿主平台",path:["workbenchPlatform"]});
  for (const [index, capability] of (value.workbenchCapabilities ?? []).entries()) {
    if (workbenchNames.has(capability.name) || !capability.platforms.includes(value.workbenchPlatform!) || !value.tools.some(tool => tool.name === capability.name && tool.execution === undefined))
      ctx.addIssue({code:"custom",message:"Workbench 目录与冻结工具不一致",path:["workbenchCapabilities",index]});
    workbenchNames.add(capability.name);
  }
  // 保留正式入口30MiB图片总量的base64空间，另留原4M文本/工具定义容量。
  if(JSON.stringify(value).length > 46_000_000) ctx.addIssue({code:"custom",message:"聊天冻结输入过大"});
});
