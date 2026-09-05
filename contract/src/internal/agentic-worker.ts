import { z } from "zod";
export const agenticWorkerInputSchema=z.object({
 kind:z.literal("agentic.run"),operationKey:z.string().min(1).max(200),
 taskType:z.enum(["agentic.research","agentic.material","agentic.collect"]),
 goal:z.string().min(1).max(100000),systemPrompt:z.string().max(500000),capability:z.string().min(1).max(128),
 maxOutputTokens:z.number().int().positive().max(65536),dryRun:z.boolean(),
 tools:z.array(z.object({name:z.string().min(1).max(256),version:z.string().min(1).max(128),label:z.string().min(1),description:z.string(),parameters:z.record(z.string(),z.json()),effect:z.enum(["none","proposal","committed"])}).strict()).min(1).max(100),
}).strict().refine(value=>new Set(value.tools.map(tool=>tool.name)).size===value.tools.length,"工具定义重复");
export const reserveAgenticModelSchema=z.object({
 request:z.record(z.string(),z.json()).refine(value=>JSON.stringify(value).length<=4_000_000,"模型请求过大"),
 maxOutputTokens:z.number().int().positive().max(65536),
}).strict();
