import {z} from "zod";
import {id,platformId} from "../primitives";
import {projectsOperations} from "../operations/projects";
import {candidateOperations} from "../operations/candidate";
import {artifactsOperations} from "../operations/artifacts";
import {articlesOperations} from "../operations/articles";
import {graphicPostsOperations} from "../operations/graphic-posts";
import {knowledgeOperations} from "../operations/knowledge";
import {positioningOperations} from "../operations/positioning";
import {publishingOperations} from "../operations/publishing";
import {contentCalendarOperations} from "../operations/content-calendar";
import {settingsOperations} from "../operations/settings";
import {schedulingOperations} from "../operations/scheduling";
import {canvasDocumentSchema} from "./creative-canvas";
import {assetsOperations} from "../operations/assets";
import {intelligenceOperations} from "../operations/intelligence";
import {platformAccountOperations} from "../operations/platform-accounts";
import {accountGroupOperations} from "../operations/account-groups";
import {analyticsOperations} from "../operations/analytics";
import {pagesOperations} from "../operations/pages";
import {workCompositionsOperations,momentsOperations} from "../operations/work-compositions";
import {creativeCanvasOperations} from "../operations/creative-canvas";
import {productionOperations} from "../operations/production";
import type {Endpoint} from "../endpoint-definition";

/** SEMANTIC_BOUNDARY_ALLOW:仅按已审原操作身份查合同；不推断意图、不授予写权限。 */
const readIds=new Set([
 "projects.list","projects.get","projects.outputs.list","candidates.list","candidates.get","topics.workspace.get",
 "artifacts.list","artifacts.get","artifacts.versions.list","articles.get","articles.versions.get","graphicPosts.get","graphicPosts.versions.get",
 "moments.get","moments.versions.get","workCompositions.get","workCompositions.materials.list","workCompositions.dependencies.get",
 "assets.list","assets.search","assets.get","assets.usage.list","knowledge.list","knowledge.get","knowledge.revisions.list","knowledge.folders.list",
 "intelligence.workspace.get","intelligence.sources.list","intelligence.items.list","intelligence.items.get",
 "positioning.profile.get","pages.positioning.get","positioning.statements.list","positioning.statements.get",
 "accountGroups.list","accountGroups.get","accounts.list","accounts.get","accounts.bindingCapabilities","accounts.bind.status",
 "outputs.publications.list","publications.get","publications.revisions.list",
 "analytics.projects.get","analytics.publications.get","analytics.traffic.get","pages.dashboard.get","pages.projectOverview.get","pages.groupOverview.get","pages.dailyReport.get",
 "group.calendar.list","group.cadence.get","scheduledJobs.list","scheduledJobs.get","jobRuns.listByJob","jobRuns.get","settings.preferences.get",
 "canvas.list","canvas.get","canvas.capabilities","canvas.node.tasks","canvas.generations.material.get",
]);
export const assistantReadEndpointsV1:Readonly<Record<string,Endpoint>>=Object.freeze(Object.fromEntries([
 projectsOperations,candidateOperations,artifactsOperations,articlesOperations,graphicPostsOperations,knowledgeOperations,
 positioningOperations,publishingOperations,contentCalendarOperations,settingsOperations,schedulingOperations,assetsOperations,
 intelligenceOperations,platformAccountOperations,accountGroupOperations,analyticsOperations,pagesOperations,workCompositionsOperations,momentsOperations,creativeCanvasOperations,
].flatMap(operations=>Object.values(operations)).filter(endpoint=>readIds.has(endpoint.id)&&endpoint.method==="GET").map(endpoint=>[endpoint.id,endpoint])));
/** 代码内固定目录，恢复旧任务不能接受任务自报端点或 schema。 */
export type AssistantReadCatalogVersion=1|2;
export const assistantReadEndpoints:Readonly<Record<string,Endpoint>>=Object.freeze({...assistantReadEndpointsV1,[productionOperations.getProductionEditor.id]:productionOperations.getProductionEditor});
function readBranches(endpoints:Readonly<Record<string,Endpoint>>){return Object.values(endpoints).map(endpoint=>{
 const shape:Record<string,z.ZodType>={kind:z.literal(endpoint.id)};
 if(endpoint.params)shape.params=endpoint.params instanceof z.ZodObject?endpoint.params.strict():endpoint.params;
 if(endpoint.query){
  let query:z.ZodType=endpoint.query;
  if(query instanceof z.ZodObject){const object=query.strict();const bounds:Record<string,z.ZodType>={};for(const field of ['limit','pageSize'])if(field in object.shape)bounds[field]=z.coerce.number().int().min(1).max(50).default(20);query=object.extend(bounds);}
  const defaults=query.safeParse({});shape.query=defaults.success?query.default(defaults.data):query;
 }
 return z.object(shape).strict();
});}
export const assistantReadRequestSchemaV1=z.discriminatedUnion('kind',readBranches(assistantReadEndpointsV1) as [z.ZodObject,...z.ZodObject[]]);
export const assistantReadRequestSchema=z.discriminatedUnion('kind',readBranches(assistantReadEndpoints) as [z.ZodObject,...z.ZodObject[]]);
// V1 的字段、顺序和默认值保持已冻结 JSON schema 原样。
export const assistantReadInputSchemaV1=z.object({request:assistantReadRequestSchemaV1,window:z.object({offsetUtf16:z.number().int().nonnegative().default(0),lengthUtf16:z.number().int().min(1).max(20000).default(12000)}).strict().optional(),offset:z.number().int().nonnegative().default(0),limit:z.number().int().min(1).max(50).default(20)}).strict();
export const assistantReadInputSchema=z.object({request:assistantReadRequestSchema,window:z.object({offsetUtf16:z.number().int().nonnegative().default(0),lengthUtf16:z.number().int().min(1).max(20000).default(12000),expectedRevision:z.number().int().nonnegative().optional()}).strict().optional(),offset:z.number().int().nonnegative().default(0),limit:z.number().int().min(1).max(50).default(20)}).strict().superRefine((input,ctx)=>{
 const continuation=input.request.kind==='outputs.production.editor.get'&&(input.window?.offsetUtf16??0)>0;
 if(continuation&&input.window?.expectedRevision===undefined)ctx.addIssue({code:'custom',path:['window','expectedRevision'],message:'原生工程续窗必须复制首读 observedRevision'});
 if(!continuation&&input.window?.expectedRevision!==undefined)ctx.addIssue({code:'custom',path:['window','expectedRevision'],message:'expectedRevision 仅用于同一原生工程的非零续窗'});
});
export type AssistantReadInput=z.infer<typeof assistantReadInputSchema>;
export const assistantFeaturesInputSchema=z.object({feature:z.string().min(1).optional(),offset:z.number().int().nonnegative().default(0),limit:z.number().int().min(1).max(20).default(14)}).strict();

/** 来源只能由宿主装入；正式采纳不接收可篡改的业务正文。 */
export const assistantProposalSourceSchema=z.object({taskId:id,callId:id,toolCallId:z.string().min(1).max(256),candidateDigest:z.string().regex(/^sha256:[a-f0-9]{64}$/)}).strict();
export type AssistantProposalSource=z.infer<typeof assistantProposalSourceSchema>;
const kind=<T extends string>(value:T)=>({kind:z.literal(value)});
export const assistantActionInputSchema=z.discriminatedUnion("kind",[
 projectsOperations.createProject.body.omit({source:true,platformRef:true}).extend(kind("project.create")).strict(),
 candidateOperations.createCandidate.body.extend(kind("topic.create")).strict(),
 z.object({...kind("topic.promote"),candidateId:id}).strict(),
 artifactsOperations.applyScriptPatch.body.extend({...kind("script.patch"),artifactId:id}).strict(),
 articlesOperations.createArticleVersion.body.omit({clientRequestId:true}).extend({...kind("article.save"),outputId:id}).strict(),
 graphicPostsOperations.createGraphicPostVersion.body.omit({clientRequestId:true}).extend({...kind("graphic.save"),outputId:id}).strict(),
 z.object({...kind("asset.tag"),targets:z.array(z.object({assetId:id,expectedVersion:z.string().min(1).max(256)}).strict()).min(1).max(100),tag:z.string().trim().min(1).max(200)}).strict(),
 knowledgeOperations.createKnowledge.body.pick({title:true,sourceNote:true,folderId:true}).extend({...kind("knowledge.create"),note:knowledgeOperations.createKnowledge.body.shape.content}).strict(),
 knowledgeOperations.createKnowledgeFolder.body.extend(kind("knowledge.folder.create")).strict(),
 z.object({...kind("radar.collection.create"),name:z.string().min(1),parentId:id.nullable().optional()}).strict(),
 positioningOperations.upsertProfile.body.extend(kind("positioning.save")).strict(),
 z.object({...kind("group.create"),name:z.string().trim().min(1).max(120)}).strict(),
 z.object({...kind("group.rename"),name:z.string().trim().min(1).max(120),expectedVersion:z.number().int().positive()}).strict(),
 z.object({...kind("account.bind.start"),platform:platformId,expectedGroupVersion:z.number().int().positive()}).strict(),
 publishingOperations.createPublication.body.extend({...kind("publication.prepare"),outputId:id}).strict(),
 contentCalendarOperations.createGroupEntry.body.extend(kind("calendar.plan")).strict(),
 schedulingOperations.createScheduledJob.body.pick({name:true,prompt:true,schedule:true}).extend({...kind("automation.createDraft"),sourceKind:z.enum(["topic.daily","self.metrics","comments"]),targetAccountId:id.nullable()}).strict(),
 z.object({...kind("automation.enable"),jobId:id,enabled:z.boolean()}).strict(),
 settingsOperations.patchPreferences.body.extend(kind("preferences.update")).strict(),
]).superRefine((action,ctx)=>{
 if(action.kind==="automation.createDraft"&&action.sourceKind!=="topic.daily"&&action.targetAccountId===null)ctx.addIssue({code:"custom",message:"该自动化必须选择当前组真实平台账号"});
 if(action.kind==="preferences.update"&&Object.keys(action).length===1)ctx.addIssue({code:"custom",message:"请选择要修改的偏好字段"});
 if(JSON.stringify(action).length>900_000)ctx.addIssue({code:"custom",message:"候选内容过大，请缩小本次修改"});
});
export type AssistantActionInput=z.infer<typeof assistantActionInputSchema>;
export const assistantActionProposeInputSchema=z.object({action:assistantActionInputSchema}).strict();
export const assistantActionCandidateSchema=z.object({schemaVersion:z.literal(1),kind:z.literal("system.action.proposal"),request:assistantActionProposeInputSchema,observations:z.record(z.string(),z.json()),source:assistantProposalSourceSchema}).strict();
export type AssistantActionCandidate=z.infer<typeof assistantActionCandidateSchema>;
export const canvasCreateProposalInputSchema=z.object({title:z.string().min(1).max(160),projectId:id.nullable().optional(),document:canvasDocumentSchema}).strict();
export const canvasCreateCandidateSchema=z.object({schemaVersion:z.literal(1),kind:z.literal("canvas.create.proposal"),request:canvasCreateProposalInputSchema,document:canvasDocumentSchema,source:assistantProposalSourceSchema}).strict();
export const canvasGenerateProposalInputSchema=z.object({baseRevision:z.number().int().positive(),nodeId:id}).strict();
/** 宿主冻结原生成政策；父聊天的continuous不能变成无限生图。 */
export const canvasAssetLimitSchema=z.object({maxCalls:z.number().int().positive().max(10000),maxTokens:z.number().int().positive().max(2_000_000_000),deadlineMs:z.number().int().min(120000).max(2_000_000_000)}).strict();
export const canvasProposalAdmissionSchema=z.object({source:assistantProposalSourceSchema,sourceExecutionTaskId:id,confirmedAt:z.iso.datetime(),deadlineAt:z.iso.datetime(),assetLimit:canvasAssetLimitSchema}).strict().superRefine((value,ctx)=>{
 const duration=Date.parse(value.deadlineAt)-Date.parse(value.confirmedAt);
 if(duration<=0||duration>value.assetLimit.deadlineMs)ctx.addIssue({code:'custom',message:'确认期限必须沿原有限政策且不能续期'});
});
export type CanvasProposalAdmission=z.infer<typeof canvasProposalAdmissionSchema>;
export const canvasFrozenGenerationInputSchema=z.object({projectId:id.nullable().optional(),kind:z.enum(['image','video']),mode:z.enum(['text_to_image','image_to_image','text_to_video','image_to_video']),prompt:z.string().min(1).max(10000),visualMode:z.enum(['real_person','photo_product','graphic','ai_concept']).optional(),templateId:id.optional(),templateVersion:z.number().int().positive().optional(),aspectRatio:z.string().max(32).optional(),durationSec:z.number().int().positive().optional(),resolution:z.enum(['768P','2K']).optional(),referenceAssetId:id.optional(),referenceFileId:id.optional(),referenceChecksum:z.string().regex(/^[a-f0-9]{64}$/).optional(),canvasOwner:z.object({accountId:id.nullable(),groupId:id.optional(),groupVersion:z.number().int().positive().nullable().optional(),membershipVersion:z.number().int().positive().nullable().optional(),canvasId:id,nodeId:id,inputDigest:z.string().regex(/^[a-f0-9]{64}$/),proposalAdmission:canvasProposalAdmissionSchema.optional()}).strict()}).strict();
export const canvasGenerateSnapshotSchema=z.object({canvasId:id,inputRevision:z.number().int().positive(),inputDigest:z.string().regex(/^[a-f0-9]{64}$/),inputData:canvasFrozenGenerationInputSchema,sourceExecutionTaskId:id,parentDeadlineAt:z.iso.datetime().nullable(),assetLimit:canvasAssetLimitSchema}).strict().superRefine((value,ctx)=>{
 if(value.inputData.canvasOwner.proposalAdmission||value.inputData.canvasOwner.canvasId!==value.canvasId||value.inputData.canvasOwner.inputDigest!==value.inputDigest)ctx.addIssue({code:'custom',message:'候选必须是原已保存节点输入，不能预填确认事实'});
});
export type CanvasGenerateSnapshot=z.infer<typeof canvasGenerateSnapshotSchema>;
export const canvasGenerateUnsignedCandidateSchema=z.object({schemaVersion:z.literal(1),kind:z.literal('canvas.generate.proposal'),request:canvasGenerateProposalInputSchema,snapshot:canvasGenerateSnapshotSchema}).strict().superRefine((value,ctx)=>{
 if(value.request.baseRevision!==value.snapshot.inputRevision||value.request.nodeId!==value.snapshot.inputData.canvasOwner.nodeId)ctx.addIssue({code:'custom',message:'候选节点与原请求不符'});
});
export const canvasGenerateCandidateSchema=canvasGenerateUnsignedCandidateSchema.safeExtend({source:assistantProposalSourceSchema});
export const assistantAdoptionReceiptSchema=z.object({source:assistantProposalSourceSchema,status:z.enum(["adopted","accepted"]),operationId:z.string().min(1),result:z.json(),adoptedAt:z.iso.datetime()}).strict();
