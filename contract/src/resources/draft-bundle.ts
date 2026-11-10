import {z} from 'zod';
import {id} from '../primitives';

/**
 * 第三批「一句话出成稿包」合同（schemaVersion 1）。
 * - 按所选账号/组写入：scope 必须二选一，服务端再核验归属。
 * - 分段落地：每段独立状态，可断点续跑；任一段失败不清掉已落地的段。
 * - 最后只到 READY，不含任何「已发布」状态。
 * - 旧结果没有 knowledgeSources：解析时补空数组。
 */
export const DRAFT_BUNDLE_SCHEMA_VERSION=1 as const;
const digest=z.string().regex(/^[a-f0-9]{64}$/);

/** 生成结果引用的知识来源；worker 与各结果复用。 */
export const knowledgeSourceRef=z.object({knowledgeId:id,title:z.string().min(1).max(200)}).strict();
export type KnowledgeSourceRef=z.infer<typeof knowledgeSourceRef>;
/** 兼容旧结果：缺省为 []，并按 knowledgeId 去重。 */
export const knowledgeSources=z.array(knowledgeSourceRef).max(20).default([])
 .transform(list=>list.filter((item,index)=>list.findIndex(other=>other.knowledgeId===item.knowledgeId)===index));

export const draftBundleScope=z.object({groupId:id.nullable(),accountId:id.nullable()}).strict()
 .refine(scope=>Boolean(scope.groupId||scope.accountId),{message:'成稿包必须选定账号或账号组'});
export type DraftBundleScope=z.infer<typeof draftBundleScope>;

export const draftBundleRequest=z.object({
 schemaVersion:z.literal(DRAFT_BUNDLE_SCHEMA_VERSION),
 scope:draftBundleScope,
 idea:z.string().trim().min(2).max(500),
 workKind:z.enum(['article','image']),
 clientRequestId:z.string().min(8).max(128),
}).strict();
export type DraftBundleRequest=z.infer<typeof draftBundleRequest>;

/** 段顺序即编排顺序；断点续跑从第一个未完成段开始。 */
export const DRAFT_BUNDLE_STAGES=['project','titles','script','work','cover','publication'] as const;
export const draftBundleStage=z.enum(DRAFT_BUNDLE_STAGES);
export type DraftBundleStage=z.infer<typeof draftBundleStage>;
export const draftBundleStageState=z.object({
 status:z.enum(['pending','running','done','failed']),
 taskId:id.nullable().default(null),
 attempts:z.number().int().nonnegative().default(0),
 error:z.string().max(500).nullable().default(null),
}).strict();
export type DraftBundleStageState=z.infer<typeof draftBundleStageState>;

const versionRef=z.object({outputId:id,versionId:id}).strict();
export const draftBundleTitle=z.object({text:z.string().trim().min(1).max(80),angle:z.string().max(120).default('')}).strict();
export const draftBundlePublication=z.object({
 title:z.string().min(1).max(80),description:z.string().max(1000),tags:z.array(z.string().min(1).max(30)).max(10),
 /** 生成时所依据的标题文本；标题改选后用于判断物料是否过期。 */
 basedOnTitle:z.string().min(1).max(80),
}).strict();
export const draftBundleCover=z.object({headline:z.string().min(1).max(40),composition:z.string().max(500),assetId:id.nullable().default(null)}).strict();

export const draftBundleDecisions=z.object({
 title:z.enum(['pending','decided']).default('pending'),
 content:z.enum(['pending','adopted','rewrite']).default('pending'),
 release:z.enum(['pending','ready']).default('pending'),
}).strict();

/** 改选标题后只联动重写的段（月明 2026-11-10 拍板）：口播和图文不自动重写。 */
export const DRAFT_BUNDLE_TITLE_CHANGE_REGENERATES=['publication'] as const satisfies readonly DraftBundleStage[];

export const draftBundleResult=z.object({
 kind:z.literal('bundle.draft'),
 schemaVersion:z.literal(DRAFT_BUNDLE_SCHEMA_VERSION),
 bundleId:id,
 /** sha256(userId, scope, normalized idea, workKind)：同账号同想法重复提交得到同一包。 */
 idempotencyKey:digest,
 scope:draftBundleScope,
 idea:z.string(),
 workKind:z.enum(['article','image']),
 projectId:id.nullable().default(null),
 titles:z.array(draftBundleTitle).length(3).nullable().default(null),
 selectedTitleIndex:z.number().int().min(0).max(2).nullable().default(null),
 script:versionRef.nullable().default(null),
 work:versionRef.extend({kind:z.enum(['article','image'])}).strict().nullable().default(null),
 cover:draftBundleCover.nullable().default(null),
 publication:draftBundlePublication.nullable().default(null),
 knowledgeSources,
 stages:z.object(Object.fromEntries(DRAFT_BUNDLE_STAGES.map(stage=>[stage,draftBundleStageState])) as Record<DraftBundleStage,typeof draftBundleStageState>).strict(),
 decisions:draftBundleDecisions,
 /** 只到 ready；没有 published。 */
 status:z.enum(['running','awaiting_decision','ready','failed']),
 updatedAt:z.string(),
}).strict().superRefine((value,ctx)=>{
 if(value.selectedTitleIndex!==null&&!value.titles)ctx.addIssue({code:'custom',path:['selectedTitleIndex'],message:'未出标题不能选标题'});
 if(value.decisions.title==='decided'&&value.selectedTitleIndex===null)ctx.addIssue({code:'custom',path:['decisions','title'],message:'已决定标题必须有选中项'});
 if(value.status==='ready'&&(value.decisions.release!=='ready'||value.decisions.title!=='decided'||value.decisions.content==='pending'))ctx.addIssue({code:'custom',path:['status'],message:'三处决定未完成不能 READY'});
 if(value.work&&value.work.kind!==value.workKind)ctx.addIssue({code:'custom',path:['work','kind'],message:'成稿类型与请求不一致'});
});
export type DraftBundleResult=z.infer<typeof draftBundleResult>;

/** 第一个未完成的段；全部完成返回 null。 */
export function nextDraftBundleStage(stages:Record<DraftBundleStage,{status:DraftBundleStageState['status']}>):DraftBundleStage|null{
 return DRAFT_BUNDLE_STAGES.find(stage=>stages[stage].status!=='done')??null;
}
/** 选中标题文本与已生成物料所依据的标题不同，即物料过期需要重写。 */
export function draftBundlePublicationStale(result:Pick<DraftBundleResult,'titles'|'selectedTitleIndex'|'publication'>):boolean{
 if(!result.publication||!result.titles||result.selectedTitleIndex===null)return false;
 return result.titles[result.selectedTitleIndex]!.text!==result.publication.basedOnTitle;
}
