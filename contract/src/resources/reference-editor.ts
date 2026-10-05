import {z} from 'zod';
import {id} from '../primitives';
import {productionSourceMedia,productionSourceTranscript} from './production-main-track';

export const referenceEditorMedia=z.object({mediaId:id,assetId:id,assetFileId:id}).strict();
// SEMANTIC_BOUNDARY_ALLOW: 仅核对原生JSON中的媒体身份/可序列化性与大小，不理解或选择创作内容。
export const referenceEditorDocument=z.object({
  editor:z.enum(['kuaitu','opencut-classic']),revision:z.string().regex(/^[a-f0-9]{40}$/),
  nativeDocument:z.record(z.string(),z.json()),mediaRefs:z.array(referenceEditorMedia).max(10000),
}).strict().superRefine((value,ctx)=>{
  if(JSON.stringify(value.nativeDocument).length>5_000_000)ctx.addIssue({code:'custom',message:'编辑文档超过5MB，请减少内嵌图片'});
  const refs=new Set(value.mediaRefs.map(ref=>ref.mediaId));
  if(refs.size!==value.mediaRefs.length)ctx.addIssue({code:'custom',message:'媒体身份不能重复'});
  const visit=(node:unknown)=>{
    if(Array.isArray(node)){node.forEach(visit);return;}
    if(!node||typeof node!=='object')return;
    const item=node as Record<string,unknown>;
    if(typeof item.mediaId==='string'&&!refs.has(item.mediaId))ctx.addIssue({code:'custom',message:'原生媒体缺少真实文件引用'});
    if(item.type==='image'&&typeof item.src==='string'){
      const prefix='creatoros-media://';
      if(item.src.startsWith(prefix)){if(!refs.has(item.src.slice(prefix.length)))ctx.addIssue({code:'custom',message:'图层缺少真实文件引用'});}
      else if(!/^data:image\/(png|jpeg|webp|gif);base64,/.test(item.src))ctx.addIssue({code:'custom',message:'图片图层必须绑定真实文件，不能保存临时或外部地址'});
    }
    Object.values(item).forEach(visit);
  };
  visit(value.nativeDocument);
});
export type ReferenceEditorDocument=z.infer<typeof referenceEditorDocument>;
export type ReferenceEditorMedia=z.infer<typeof referenceEditorMedia>;
export const productionReferencePlan=z.object({editorVersion:z.literal(3),referenceEditor:referenceEditorDocument.refine(v=>v.editor==='opencut-classic'),revision:z.number().int().nonnegative().optional(),nativeSources:z.array(z.object({mediaId:id,source:productionSourceMedia}).strict()).max(1000).optional(),sourceTranscripts:z.array(productionSourceTranscript).max(1000).optional()}).strict().superRefine((plan,ctx)=>{
 const sources=plan.nativeSources??[],byId=new Map(sources.map(s=>[s.source.sourceId,s.source]));
 if(byId.size!==sources.length||new Set(sources.map(s=>s.mediaId)).size!==sources.length)ctx.addIssue({code:'custom',message:'原生来源身份重复'});
 const seen=new Set<string>();for(const t of plan.sourceTranscripts??[]){const source=byId.get(t.sourceId);if(!source||source.assetFileId!==t.assetFileId||seen.has(t.transcriptId))ctx.addIssue({code:'custom',message:'转写不属于唯一冻结原片'});seen.add(t.transcriptId);if(t.granularity!=='text'&&(new Set(t.tokens.map(x=>x.tokenId)).size!==t.tokens.length||t.tokens.some(x=>x.endTicks>(source?.durationTicks??0))))ctx.addIssue({code:'custom',message:'词句时间码重复或越界'});}
});
export type ProductionReferencePlan=z.infer<typeof productionReferencePlan>;
export const graphicReferenceDesign=z.object({target:z.discriminatedUnion('kind',[
  z.object({kind:z.literal('cover')}).strict(),z.object({kind:z.literal('card'),cardId:id}).strict(),
]),document:referenceEditorDocument.refine(v=>v.editor==='kuaitu')}).strict();
export const graphicReferenceDesigns=z.array(graphicReferenceDesign).max(100).refine(values=>new Set(values.map(v=>v.target.kind==='cover'?'cover':`card:${v.target.cardId}`)).size===values.length,{message:'每个封面或图卡只能有一份设计'});
