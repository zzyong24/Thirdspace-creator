import { z } from 'zod';
const text = z.string().trim().max(10000);
const ref = z.string().trim().min(1).max(500);
const url = z.string().url().max(8192).refine(v => { try { const u = new URL(v); return ['http:', 'https:'].includes(u.protocol) && !u.username && !u.password; } catch { return false; } }, '只支持无凭据HTTP链接');
export const topicGridCell = z.object({ id: ref, text, evidence: z.enum(['evidence','hypothesis']), sourceRefs: z.array(ref).max(20), version: z.number().int().positive().default(1), position:z.number().int().min(0).max(8).optional(), basis:text.default(''), publicQueryAllowed:z.boolean().default(false) }).strict();
export const topicProblem = z.object({ id: ref, text: text.min(1), role: z.enum(['own_conversation','own_comment','peer_comment','industry_material','hypothesis']), sourceUrl: url.nullable(), sourceRef: text, capturedAt: z.string().datetime(), eventAt: z.string().datetime().nullable(), readScope: text.min(1), publicStatus: z.enum(['public','private','unknown']), projectId: ref.nullable() }).strict();
export const topicAuthorMaterial = z.object({ id:ref, text:text.min(1), sourceRef:ref, projectId:ref.nullable(), contextRef:z.object({projectKey:ref,contextId:ref,version:ref}).nullable(), entryVerification:z.object({status:z.enum(['verified','unverified','unavailable']),checkedAt:z.string().datetime(),expiresAt:z.string().datetime(),entryUrl:url,conditions:text.min(1)}).nullable().default(null), result:z.object({input:text.min(1),steps:z.array(text.min(1)).min(1).max(20),output:text.min(1),acceptance:text.min(1),resultRef:ref}).nullable().default(null) }).strict();
export const topicWorkspaceConfig = z.object({ audience:text, platform:text, preparationMinutes:z.number().int().min(1).max(10080).default(240), audienceGrid:z.array(topicGridCell).max(9), industryGrid:z.array(topicGridCell).max(9), problems:z.array(topicProblem).max(200), authorMaterials:z.array(topicAuthorMaterial).max(100), gridVersion:z.number().int().positive().default(1), audienceCenter:text.default(''), industryCenter:text.default(''), contextMaterialIds:z.array(ref).max(100).nullable().default(null), semanticPairs:z.array(z.object({id:ref,audienceCellId:ref,industryCellId:ref,task:text.min(1),reason:text.min(1)}).strict()).max(100).default([]), editorialPolicy:text.default('') }).strict().superRefine((v,ctx)=>{
 const ids=[...v.audienceGrid,...v.industryGrid,...v.problems,...v.authorMaterials].map(x=>x.id);
 if(new Set(ids).size!==ids.length)ctx.addIssue({code:'custom',message:'材料和格子ID不得重复'});
 const refs=new Set([...v.problems,...v.authorMaterials].map(x=>x.id));
 for(const role of ['audienceGrid','industryGrid'] as const){const positions=v[role].map(c=>c.position).filter(p=>p!==undefined);if(new Set(positions).size!==positions.length)ctx.addIssue({code:'custom',message:'格子位置不得重复'});}
 for(const id of v.contextMaterialIds??[])if(!v.authorMaterials.some(m=>m.id===id))ctx.addIssue({code:'custom',message:`代表作者材料不存在：${id}`});
 for(const pair of v.semanticPairs)if(!v.audienceGrid.some(c=>c.id===pair.audienceCellId)||!v.industryGrid.some(c=>c.id===pair.industryCellId))ctx.addIssue({code:'custom',message:'配对的格子不存在'});
 for(const cell of [...v.audienceGrid,...v.industryGrid]) for(const id of cell.sourceRefs) if(!refs.has(id))ctx.addIssue({code:'custom',message:`格子来源不存在：${id}`});
});
export const topicWorkspaceResource=z.object({version:z.number().int().nonnegative(),config:topicWorkspaceConfig,updatedAt:z.string().datetime().nullable()}).strict();
export const topicFeedbackReason=z.enum(['audience_mismatch','not_interested','too_hard','entry_unavailable','duplicate','tested']);
export const audienceTaskProposal=z.object({
 gridVersion:z.number().int().positive().nullable().default(null),gridRelationReason:text.default(''),
 propositionKey:text.default(''),audience:text.default(''),audienceFit:z.enum(['matched','uncertain','mismatched']).default('uncertain'),audienceReason:text.default(''),
 job:text.default(''),input:text.default(''),entryUrl:z.union([url,z.literal('')]).default(''),steps:z.array(text).max(20).default([]),output:text.default(''),acceptance:text.default(''),costAndLimits:text.default(''),authorCanDo:text.default(''),viewerCanUse:text.default(''),estimatedMinutes:z.number().int().nonnegative().nullable().default(null),route:z.enum(['record','test','research','reserve','unsuitable']).default('research'),
 testPlan:z.object({sample:text,steps:z.array(text).max(20),visibleResult:text,acceptance:text,failureStory:text}).nullable().default(null),cellIds:z.array(ref).max(18).default([]),problemIds:z.array(ref).max(20).default([]),authorMaterialIds:z.array(ref).max(20).default([]),changedFromCandidateId:ref.nullable().default(null),changeReason:text.default(''),
});
export const topicSourceRead=z.object({id:ref,name:text,status:z.enum(['success','partial','not_called','failed','permission_denied']),url:url.nullable(),note:text,readAt:z.string().datetime().nullable()}).strict();
export const audienceTaskAssessment=audienceTaskProposal.extend({workspaceVersion:z.number().int().nonnegative(),positioningVersionId:ref.nullable(),assessedAt:z.string().datetime(),evidenceStatus:z.enum(['evidence','hypothesis']),verificationNotes:z.array(text),sourceReads:z.array(topicSourceRead).max(100).default([])}).strict();
export type TopicWorkspaceConfig=z.infer<typeof topicWorkspaceConfig>;
export type TopicWorkspaceResource=z.infer<typeof topicWorkspaceResource>;
export type AudienceTaskProposal=z.infer<typeof audienceTaskProposal>;
export type AudienceTaskAssessment=z.infer<typeof audienceTaskAssessment>;
export const emptyTopicWorkspaceConfig=():TopicWorkspaceConfig=>({audience:'',platform:'',preparationMinutes:240,audienceGrid:[],industryGrid:[],problems:[],authorMaterials:[],gridVersion:1,audienceCenter:'',industryCenter:'',contextMaterialIds:null,semanticPairs:[],editorialPolicy:''});
export const topicRecommendationContext=z.object({version:z.number().int().nonnegative(),positioningVersionId:ref.nullable(),config:topicWorkspaceConfig,rejected:z.array(z.object({id:ref,title:text,angle:text,reason:text,propositionKey:text,projectId:ref.nullable()})).max(500)}).strict();
export type TopicRecommendationContext=z.infer<typeof topicRecommendationContext>;
export type TopicSourceRead=z.infer<typeof topicSourceRead>;
