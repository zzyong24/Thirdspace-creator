import { createHash } from "node:crypto";
import { z } from "zod";
import { workerSkillSnapshotSchema } from "@creatoros/contract/execution-worker";
import { resolveSkillForSurface } from "../ai-runtime/chat-surface";
import { canonicalJson } from "./canonical-json";
import { ConflictError } from "../execution/execution.errors";
const id = z.string().min(1);
export const chatHostContextSchema = z.object({
  schemaVersion: z.literal(1),
  chatContext: z.object({
    surface: id, functionKey: z.string().optional(), webReadUrl: z.string().optional(), projectId: id.nullable().optional(),
    selection: z.object({kind:id,ids:z.array(id),label:z.string().optional(),artifactId:id.optional(),versionId:id.optional(),sectionIndex:z.number().int().nonnegative().optional(),excerpt:z.string().optional()}).strict().optional(),
    assetAliases:z.record(z.string(),id).optional(),diagnosticRef:z.string().optional(),
  }).strict(),
  mediaRoute: z.discriminatedUnion("kind", [z.object({kind:z.literal("douyin.share"),shareInput:z.string(),transcribe:z.boolean()}).strict(),z.object({kind:z.literal("cover.reference")}).strict(),z.object({kind:z.literal("cover.publication_reference")}).strict()]).nullable(),
  positioningScratch: z.boolean(),
  trustedScriptSources: z.array(z.object({ref:id,label:z.string(),text:z.string(),truncated:z.boolean(),sourceType:z.enum(["message","attachment","project_text"]).optional(),sourceId:id.optional()}).strict()),
  skillSnapshot: workerSkillSnapshotSchema,
}).strict().superRefine((value, ctx) => {
  if (JSON.stringify(value).length > 4_000_000) ctx.addIssue({code:"custom",message:"宿主上下文过大"});
  const refs=value.trustedScriptSources.map(source=>source.ref),skills=value.skillSnapshot.skills.map(skill=>skill.skillId);
  if (new Set(refs).size!==refs.length || new Set(skills).size!==skills.length) ctx.addIssue({code:"custom",message:"宿主上下文来源或Skill重复"});
  if (!skills.includes(resolveSkillForSurface(value.chatContext.surface))) ctx.addIssue({code:"custom",message:"快照缺少当前场景Skill"});
});
export type ChatHostContext=z.infer<typeof chatHostContextSchema>;
type Owner={userId:string;accountId:string;projectId:string|null};
export const chatHostContextDigest=(value:ChatHostContext)=>createHash("sha256").update(canonicalJson(value)).digest("hex");
/** 结构和关联校验不代替组装器对选区、附件与源实体的真实归属验证。 */
export function validateChatHostContext(raw:unknown,owner:Owner):ChatHostContext {
  const value=chatHostContextSchema.parse(raw);
  if(value.skillSnapshot.userId!==owner.userId || value.skillSnapshot.accountId!==owner.accountId || (value.chatContext.projectId??null)!==owner.projectId) throw new ConflictError("宿主上下文归属不符");
  return value;
}
export function readChatHostContextPair(raw:unknown,digest:unknown,owner:Owner):ChatHostContext|null {
  if(raw===undefined && digest===undefined)return null;
  if(raw===undefined || typeof digest!=="string")throw new ConflictError("宿主上下文绑定缺失");
  const value=validateChatHostContext(raw,owner);
  if(chatHostContextDigest(value)!==digest)throw new ConflictError("宿主上下文摘要不符");
  return value;
}
