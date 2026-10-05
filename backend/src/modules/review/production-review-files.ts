import {z} from 'zod';
import {productionPlanV2,videoRenderProps,type RequestContext,type WorkAssetFile,type ProductionEditorDocument} from '@creatoros/contract';
import type {Db} from '@creatoros/backend';
import {digest} from './work-review-fingerprint';
export type SavedFileReference={location:string;reference:string};
export interface FrozenProductionFilePort {
 /** 原Production owner读取不可变回执，确属ctx/output/revision/planDigest/location/reference。
  * 缺持久回执返回null；严禁取当前assetFile或从文件名猜assetId。 */
 readFrozenFileBinding(ctx:RequestContext,input:{outputId:string;revision:number;planDigest:string;location:string;reference:string},tx:Db):Promise<{outputId:string;revision:number;planDigest:string;location:string;reference:string;assetId:string;assetFileId:string}|null>;
}
const segment=(id:string)=>encodeURIComponent(id);
const fail=():never=>{throw Object.assign(Error('制作工程缺少所用文件的精确不可变身份'),{code:'REVIEW_PRODUCTION_FILE_IDENTITY_UNAVAILABLE'});};
// SEMANTIC_BOUNDARY_ALLOW: 只枚举正式制作协议的明确媒体字段，不扫描JSON键或选择素材。
export function createProductionReviewFiles(port:FrozenProductionFilePort){
 return async(ctx:RequestContext,outputId:string,editor:ProductionEditorDocument,tx:Db):Promise<WorkAssetFile[]>=>{
  if(editor.outputId!==outputId)throw Error('REVIEW_PRODUCTION_OUTPUT_MISMATCH');
  if(editor.state==='empty'){if(editor.plan!==null)throw Error('REVIEW_PRODUCTION_EMPTY_MISMATCH');return[];}
  if(!editor.plan)fail();const raw=editor.plan!;let files:WorkAssetFile[]=[],refs:SavedFileReference[]=[];
  if(raw.editorVersion===2){const plan=productionPlanV2.parse(raw);files=plan.mainTrack.sources.map(({assetId,assetFileId})=>({assetId,assetFileId}));
   refs=plan.overlayDraft.broll.map(b=>({location:`overlayDraft.broll/${segment(b.id)}/file`,reference:b.file}));
   for(const scene of plan.overlayDraft.scenes)for(const card of scene.cards)if(card.kind==='image')refs.push({location:`overlayDraft.scenes/${segment(scene.id)}/cards/${segment(card.id)}/file`,reference:card.file});
  }else if(raw.editorVersion===1){
   // 原v1 renderProps协议明确媒体字段；保留原id来锚定持久回执，拒绝无id旧槽位。
   const identity=z.object({id:z.string().min(1)}).passthrough();
   const exact=z.object({talkingHead:z.object({file:z.string().min(1),clips:z.array(z.object({clipId:z.string().min(1),file:z.string().min(1)}).passthrough()).optional()}).passthrough(),broll:z.array(identity.extend({file:z.string().min(1)})),scenes:z.array(identity.extend({cards:z.array(identity.extend({kind:z.string(),file:z.string().optional()}))}))}).passthrough().parse(raw.renderProps);
   videoRenderProps.parse(raw.renderProps);
   refs=[{location:'renderProps.talkingHead/file',reference:exact.talkingHead.file},...exact.broll.map(b=>({location:`renderProps.broll/${segment(b.id)}/file`,reference:b.file}))];
   refs.push(...(exact.talkingHead.clips??[]).map(clip=>({location:`renderProps.talkingHead/clips/${segment(clip.clipId)}/file`,reference:clip.file})));
   for(const scene of exact.scenes)for(const card of scene.cards)if(card.kind==='image'){if(!card.file)fail();refs.push({location:`renderProps.scenes/${segment(scene.id)}/cards/${segment(card.id)}/file`,reference:card.file!});}
  }else fail();
  if(new Set(refs.map(ref=>ref.location)).size!==refs.length)fail();
  const planDigest=`sha256:${digest(raw)}`;
  for(const ref of refs){const input={outputId,revision:editor.revision,planDigest,...ref},binding=await port.readFrozenFileBinding(ctx,input,tx);if(!binding)return fail();if(binding.outputId!==input.outputId||binding.revision!==input.revision||binding.planDigest!==input.planDigest||binding.location!==input.location||binding.reference!==input.reference||!binding.assetId||!binding.assetFileId)fail();files.push({assetId:binding.assetId,assetFileId:binding.assetFileId});}
  return[...new Map(files.map(f=>[JSON.stringify(f),f])).values()].sort((a,b)=>a.assetId.localeCompare(b.assetId)||a.assetFileId.localeCompare(b.assetFileId));
 };
}
