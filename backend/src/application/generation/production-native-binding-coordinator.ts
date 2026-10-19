import {createHash} from 'node:crypto';
import {productionPlanV2,type RequestContext,type ProductionEditorVersion} from '@creatoros/contract';
import type {ProductionService,createProductionFileBindingsService} from '@creatoros/backend/modules/production';
type BindingOwner=ReturnType<typeof createProductionFileBindingsService>;
export type ProductionCaptureWarning={code:'PRODUCTION_NATIVE_FILE_BINDING_UNAVAILABLE';outputId:string;revision:number;requestId:string|null;message:string};
/** 原保存/采用先成功提交；可选审核证据失败不能反杀原合法任务。未知旧alias一律不登记。 */
export function createProductionWithNativeFileCapture(deps:{owner:ProductionService;bindings:Pick<BindingOwner,'getOriginalCommitReceipt'|'recordFrozenFileBindings'>;onWarning(ctx:RequestContext,warning:ProductionCaptureWarning):void}) :ProductionService{
 async function capture(ctx:RequestContext,outputId:string,version:ProductionEditorVersion){
  if(version.plan.editorVersion!==2)return version;
  try{
   const plan=productionPlanV2.parse(version.plan);if(!plan.mainTrack.sources.length)return version;
   if(!version.requestId)throw Error('原保存回执缺少请求号');
   const commitReceipt=await deps.bindings.getOriginalCommitReceipt(ctx,outputId,version.requestId);if(!commitReceipt)throw Error('未找到原正式保存回执');
   const clientRequestId=`production-native-${createHash('sha256').update(JSON.stringify([outputId,version.revision,version.requestId,version.planDigest])).digest('hex')}`;
   await deps.bindings.recordFrozenFileBindings(ctx,{clientRequestId,outputId,revision:version.revision,planDigest:version.planDigest,commitReceipt,bindings:plan.mainTrack.sources.map(s=>({location:`mainTrack.sources/${encodeURIComponent(s.sourceId)}/assetFileId`,reference:s.assetFileId,assetId:s.assetId,assetFileId:s.assetFileId,fileDigest:s.fileDigest}))});
  }catch(error){try{deps.onWarning(ctx,{code:'PRODUCTION_NATIVE_FILE_BINDING_UNAVAILABLE',outputId,revision:version.revision,requestId:version.requestId,message:error instanceof Error?error.message:'精确文件采用回执暂不可登记'});}catch{/* 原保存已经提交，警告sink自身失败也不允许使其变成失败。 */}}
  return version;
 }
 return{...deps.owner,
  saveEditor:async(c,id,body)=>capture(c,id,await deps.owner.saveEditor(c,id,body)),
  adoptEditorSource:async(c,id,body)=>capture(c,id,await deps.owner.adoptEditorSource(c,id,body)),
  applyEditor:async(c,id,body)=>capture(c,id,await deps.owner.applyEditor(c,id,body)),
  restoreEditor:async(c,id,body)=>capture(c,id,await deps.owner.restoreEditor(c,id,body)),
 };
}
