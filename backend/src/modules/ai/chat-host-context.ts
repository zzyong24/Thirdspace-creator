import {resolvedWritingContext,workEditorTarget,workCreationTarget} from "@creatoros/contract";
import { createHash } from "node:crypto";
import { z } from "zod";
import { workerSkillSnapshotSchema, scriptHooksContextSchema } from "@creatoros/contract/execution-worker";
import { resolveSkillForSurface } from "../ai-runtime/chat-surface";
import { canonicalJson } from "./canonical-json";
import { ConflictError } from "../execution/execution.errors";
const id = z.string().min(1);
export const chatStructuredContextSchema=z.object({positioningBrief:z.string(),accountsBrief:z.string(),learningsBrief:z.string(),signalsBrief:z.string(),knowledgeBrief:z.string()}).strict();
export const chatStructuredGenerationSchema=z.object({version:z.literal(1),maxOutputTokens:z.number().int().positive().max(65536)}).strict();
export const chatHostContextSchema = z.object({
  schemaVersion: z.literal(1),
  predictionLockPolicyVersion:z.literal(1).optional(),
  resolvedWritingContext:resolvedWritingContext.optional(),
  chatContext: z.object({
    surface: id, functionKey: z.string().optional(), webReadUrl: z.string().optional(), projectId: id.nullable().optional(),
    selection: z.object({kind:id,ids:z.array(id),label:z.string().optional(),artifactId:id.optional(),outputId:id.optional(),versionId:id.optional(),sectionIndex:z.number().int().nonnegative().optional(),excerpt:z.string().optional()}).strict().optional(),
    editorTarget:workEditorTarget.optional(),creationTarget:workCreationTarget.optional(),
    assetAliases:z.record(z.string(),id).optional(),diagnosticRef:z.string().optional(),
  }).strict(),
  mediaRoute: z.discriminatedUnion("kind", [z.object({kind:z.literal("douyin.share"),shareInput:z.string(),transcribe:z.boolean()}).strict(),z.object({kind:z.literal("cover.reference")}).strict(),z.object({kind:z.literal("cover.publication_reference")}).strict()]).nullable(),
  positioningScratch: z.boolean(),
  trustedScriptSources: z.array(z.object({ref:id,label:z.string(),text:z.string(),truncated:z.boolean(),sourceType:z.enum(["message","attachment","project_text"]).optional(),sourceId:id.optional()}).strict()),
  skillSnapshot: workerSkillSnapshotSchema,
  researchContext:z.object({selectionTitle:z.string(),userMaterialQueryTerms:z.array(z.string()),searchConfigured:z.boolean()}).strict().optional(),
  structuredContext:chatStructuredContextSchema.optional(),
  structuredGeneration:chatStructuredGenerationSchema.optional(),
  scriptDraftContext:z.object({latestUserInstruction:z.string()}).strict().optional(),
  scriptHooksContext: scriptHooksContextSchema.optional(),
  scriptHooksGeneration: z.object({version:z.literal(1),maxOutputTokens:z.number().int().positive().max(65536)}).strict().optional(),
}).strict().superRefine((value, ctx) => {
  if (JSON.stringify(value).length > 4_000_000) ctx.addIssue({code:"custom",message:"宿主上下文过大"});
  const refs=value.trustedScriptSources.map(source=>source.ref),skills=value.skillSnapshot.skills.map(skill=>skill.skillId);
  if (new Set(refs).size!==refs.length || new Set(skills).size!==skills.length) ctx.addIssue({code:"custom",message:"宿主上下文来源或Skill重复"});
  if (!skills.includes(resolveSkillForSurface(value.chatContext.surface))) ctx.addIssue({code:"custom",message:"快照缺少当前场景Skill"});
});
export type ChatHostContext=z.infer<typeof chatHostContextSchema>;
type Owner={userId:string;accountId:string|null;groupId?:string|null;projectId:string|null};
export const chatHostContextDigest=(value:ChatHostContext)=>createHash("sha256").update(canonicalJson(value)).digest("hex");
/** 结构和关联校验不代替组装器对选区、附件与源实体的真实归属验证。 */
export function validateChatHostContext(raw:unknown,owner:Owner):ChatHostContext {
  const value=chatHostContextSchema.parse(raw);
  if(value.skillSnapshot.userId!==owner.userId || value.skillSnapshot.accountId!==(owner.accountId??null) || (value.skillSnapshot.groupId??null)!==(owner.groupId??null) || (value.chatContext.projectId??null)!==owner.projectId) throw new ConflictError("宿主上下文归属不符");
  if(value.chatContext.editorTarget&&value.chatContext.editorTarget.projectId!==owner.projectId||value.chatContext.creationTarget&&value.chatContext.creationTarget.projectId!==owner.projectId)throw new ConflictError("作品目标与聊天项目不符");
  if(value.chatContext.editorTarget&&value.chatContext.creationTarget)throw new ConflictError("同一轮只能冻结一种作品目标");
  const selection=value.chatContext.editorTarget?.owner==='wechat_article'?value.chatContext.editorTarget.writingContext:value.chatContext.creationTarget?.writingContext;
  if(Boolean(selection)!==Boolean(value.resolvedWritingContext))throw new ConflictError('写作资料冻结与选择缺失');
  if(value.resolvedWritingContext){const {digest,...body}=value.resolvedWritingContext;if(value.resolvedWritingContext.projectId!==owner.projectId||canonicalJson(value.resolvedWritingContext.selection)!==canonicalJson(selection)||digest!==`sha256:${createHash('sha256').update(canonicalJson(body)).digest('hex')}`||body.brand&&body.brand.guidance!==canonicalJson({oneLiner:body.brand.oneLiner,...body.brand.masterSnapshot}))throw new ConflictError('写作资料冻结与目标或摘要不符');}
  return value;
}
export function readChatHostContextPair(raw:unknown,digest:unknown,owner:Owner):ChatHostContext|null {
  if(raw===undefined && digest===undefined)return null;
  if(raw===undefined || typeof digest!=="string")throw new ConflictError("宿主上下文绑定缺失");
  const value=validateChatHostContext(raw,owner);
  if(chatHostContextDigest(value)!==digest)throw new ConflictError("宿主上下文摘要不符");
  return value;
}
