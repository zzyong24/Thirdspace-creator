import {z} from "zod";
import {videoRenderCard,videoRenderCaption,videoRenderBroll,videoRenderDelivery,videoRenderDirection} from "./video-render";

const identity=z.string().min(1).max(256);
const ticks=z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER);
const positiveTicks=ticks.refine(v=>v>0);
const hash=z.string().regex(/^[a-f0-9]{64}$/);
const digest=z.string().regex(/^sha256:[a-f0-9]{64}$/);
export const productionSourceMedia=z.object({sourceId:identity,assetId:identity,assetFileId:identity,
 fileDigest:hash,probeDigest:hash,timebase:z.object({num:positiveTicks,den:positiveTicks}).strict(),
 durationTicks:positiveTicks,hasAudio:z.boolean()}).strict();
export const productionMainClip=z.object({clipId:identity,sourceId:identity,sourceInTicks:ticks,
 sourceOutTicks:positiveTicks,derivedFromClipId:identity.optional()}).strict()
 .refine(c=>c.sourceOutTicks>c.sourceInTicks,{message:"片段必须保留非空源范围"});
export const productionMainTrack=z.object({sources:z.array(productionSourceMedia).max(1000),clips:z.array(productionMainClip).max(20000)}).strict()
 .superRefine((track,ctx)=>{
  // SEMANTIC_BOUNDARY_ALLOW: 仅核验稳定身份和真实时间范围，不决定删留。
  const sources=new Map(track.sources.map(s=>[s.sourceId,s]));
  if(sources.size!==track.sources.length)ctx.addIssue({code:"custom",message:"源身份重复",path:["sources"]});
  if(new Set(track.clips.map(c=>c.clipId)).size!==track.clips.length)ctx.addIssue({code:"custom",message:"片段身份重复",path:["clips"]});
  const byClip=new Map(track.clips.map(c=>[c.clipId,c]));
  track.clips.forEach((c,i)=>{
   const seen=new Set<string>([c.clipId]);let parent=c.derivedFromClipId;
   while(parent){if(seen.has(parent)){ctx.addIssue({code:"custom",message:"片段派生关系循环",path:["clips",i]});break;}seen.add(parent);const ancestor=byClip.get(parent);if(!ancestor)break;if(ancestor.sourceId!==c.sourceId){ctx.addIssue({code:"custom",message:"派生片段必须属于同一冻结来源",path:["clips",i]});break;}parent=ancestor.derivedFromClipId;}

   const s=sources.get(c.sourceId);
   if(!s || c.sourceOutTicks>s.durationTicks)ctx.addIssue({code:"custom",message:"源不存在或范围越界",path:["clips",i]});
  });
 });
const token=z.object({tokenId:identity,text:z.string(),startTicks:ticks,endTicks:positiveTicks}).strict()
 .refine(t=>t.endTicks>t.startTicks,{message:"转写时间范围为空"});
const transcriptBase={transcriptId:identity,sourceId:identity,assetFileId:identity,audioDigest:hash,
 providerReceiptId:identity,text:z.string(),providerEvidence:z.record(z.string(),z.unknown())};
export const productionSourceTranscript=z.discriminatedUnion("granularity",[
 z.object({...transcriptBase,granularity:z.literal("text")}).strict(),
 z.object({...transcriptBase,granularity:z.literal("segment"),tokens:z.array(token)}).strict(),
 z.object({...transcriptBase,granularity:z.literal("word"),tokens:z.array(token)}).strict(),
]);
export const productionOverlayAnchor=z.discriminatedUnion("kind",[
 z.object({kind:z.literal("clip"),clipId:identity,sourceInTicks:ticks,sourceOutTicks:positiveTicks}).strict().refine(a=>a.sourceOutTicks>a.sourceInTicks),
 z.object({kind:z.literal("timeline"),startUs:ticks,endUs:positiveTicks}).strict().refine(a=>a.endUs>a.startUs),
]);
function preserveValidated<T>(schema:z.ZodType<T>){return z.custom<T>().superRefine((value,ctx)=>{const checked=schema.safeParse(value);if(!checked.success)for(const issue of checked.error.issues)ctx.addIssue({...issue,path:issue.path});});}
const overlayIdentity={id:identity,anchor:productionOverlayAnchor};
const checkedOverlayCard=z.discriminatedUnion("kind",[
 videoRenderCard.options[0].extend(overlayIdentity).passthrough(),
 videoRenderCard.options[1].extend(overlayIdentity).passthrough(),
 videoRenderCard.options[2].extend(overlayIdentity).passthrough(),
 videoRenderCard.options[3].extend(overlayIdentity).passthrough(),
 videoRenderCard.options[4].extend(overlayIdentity).passthrough(),
 videoRenderCard.options[5].extend(overlayIdentity).passthrough(),
]);
export const productionOverlayCard=preserveValidated(checkedOverlayCard);
export const productionOverlayCaption=preserveValidated(videoRenderCaption.safeExtend({id:identity,anchor:productionOverlayAnchor}).passthrough());
export const productionOverlayBroll=preserveValidated(videoRenderBroll.extend({id:identity,anchor:productionOverlayAnchor}).passthrough());
export const productionOverlayMediaSlot=z.discriminatedUnion("role",[
 z.object({id:identity,role:z.literal("image-card"),sceneId:identity,anchor:productionOverlayAnchor,label:z.string(),extensions:z.record(z.string(),z.unknown()).optional()}).strict(),
 z.object({id:identity,role:z.literal("broll"),anchor:productionOverlayAnchor,label:z.string(),extensions:z.record(z.string(),z.unknown()).optional()}).strict(),
]);
export const productionPlanV2=z.object({editorVersion:z.literal(2),mainTrack:productionMainTrack,
 overlayDraft:z.object({mediaSlots:z.array(productionOverlayMediaSlot).max(20000).optional(),meta:z.record(z.string(),z.unknown()),
  scenes:z.array(z.object({id:identity,title:z.string(),startSec:z.number().nonnegative(),endSec:z.number().nonnegative(),
   cards:z.array(productionOverlayCard),anchor:productionOverlayAnchor.optional()}).passthrough()),captions:z.array(productionOverlayCaption),broll:z.array(productionOverlayBroll),
  delivery:videoRenderDelivery.passthrough(),direction:preserveValidated(videoRenderDirection).optional()}).passthrough(),
 sourceTranscripts:z.array(productionSourceTranscript),legacySnapshot:z.record(z.string(),z.unknown()).optional(),
}).passthrough().superRefine((plan,ctx)=>{
 if("renderProps" in plan)ctx.addIssue({code:"custom",message:"v2不接受第二份可写renderProps"});
 const itemIds=[...(plan.overlayDraft.mediaSlots??[]).map(s=>s.id),...plan.mainTrack.clips.map(c=>c.clipId),...plan.overlayDraft.captions.map(c=>c.id),...plan.overlayDraft.broll.map(b=>b.id),...plan.overlayDraft.scenes.flatMap(s=>[s.id,...s.cards.map(c=>c.id)])];
 if(new Set(itemIds).size!==itemIds.length)ctx.addIssue({code:"custom",message:"工程片段身份重复，不能明确选中编辑项"});
 for(const [i,slot] of (plan.overlayDraft.mediaSlots??[]).entries())if(slot.role==="image-card"&&!plan.overlayDraft.scenes.some(s=>s.id===slot.sceneId))ctx.addIssue({code:"custom",message:"素材位置所在场景不存在",path:["overlayDraft","mediaSlots",i,"sceneId"]});
 const sources=new Map(plan.mainTrack.sources.map(s=>[s.sourceId,s]));
 const transcripts=new Set<string>();
 // SEMANTIC_BOUNDARY_ALLOW: 核验来源文件、时间和身份，不解释转写或做删留选择。
 plan.sourceTranscripts.forEach((t,i)=>{
  const s=sources.get(t.sourceId);
  if(!s || t.assetFileId!==s.assetFileId || transcripts.has(t.transcriptId))
   ctx.addIssue({code:"custom",message:"转写身份重复或不属于冻结源文件",path:["sourceTranscripts",i]});
  transcripts.add(t.transcriptId);
  if(t.granularity!=="text"){
   const ids=new Set<string>();
   t.tokens.forEach((token,j)=>{
    if(ids.has(token.tokenId) || !s || token.endTicks>s.durationTicks)
     ctx.addIssue({code:"custom",message:"转写词句身份重复或超出源范围",path:["sourceTranscripts",i,"tokens",j]});
    ids.add(token.tokenId);
   });
  }
 });
});
const mainTarget={clipId:identity,expectedItemDigest:digest};
export const productionMainEditOptions=[
 z.object({type:z.literal("splitMainClip"),...mainTarget,sourceSplitTick:positiveTicks,newClipId:identity}).strict(),
 z.object({type:z.literal("trimMainClip"),...mainTarget,sourceInTicks:ticks,sourceOutTicks:positiveTicks}).strict(),
 z.object({type:z.literal("removeMainClip"),...mainTarget}).strict(),
 z.object({type:z.literal("reorderMainClips"),clipIds:z.array(identity).max(20000).refine(ids=>new Set(ids).size===ids.length),expectedOrderDigest:digest}).strict(),
 z.object({type:z.literal("addMainClip"),clipId:identity,sourceId:identity,sourceInTicks:ticks,sourceOutTicks:positiveTicks,
  afterClipId:identity.nullable(),expectedOrderDigest:digest}).strict(),
 z.object({type:z.literal("removeTranscriptRange"),...mainTarget,transcriptId:identity,transcriptDigest:digest,
  tokenIds:z.array(identity).min(1),granularity:z.enum(["word","segment"])}).strict(),
] as const;
export const productionMainTrackEdit=z.discriminatedUnion("type",productionMainEditOptions);
export type ProductionMainTrack=z.infer<typeof productionMainTrack>;
export type ProductionPlanV2=z.infer<typeof productionPlanV2>;
export type ProductionMainTrackEdit=z.infer<typeof productionMainTrackEdit>;
