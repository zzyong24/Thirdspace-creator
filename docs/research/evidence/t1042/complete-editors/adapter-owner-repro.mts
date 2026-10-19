import {createDb,projects,contentOutputs} from '../../../../../backend/src/index';
import {createProductionService} from '../../../../../backend/src/modules/production/production.service';
import {createProductionConversion} from '../../../../../backend/src/modules/production/production-conversion.service';
const ctx={userId:'review-user',accountId:'review-account',source:'user' as const,requestId:'review-http'};
const now='2026-10-02T12:00:00.000Z';
async function main(){
 const opened=await createDb(); const db=opened.db;let seq=0,unavailable=false,renderTasks=0;
 const native=()=>({editorVersion:3,referenceEditor:{editor:'opencut-classic',revision:'cf5e79e919144200294fb9fed22a222592a0aeea',nativeDocument:{metadata:{name:'原稿'},scenes:[{tracks:[{elements:[{type:'media',mediaId:'one'}]}]}],extension:{keep:true}},mediaRefs:[{mediaId:'one',assetId:'owned',assetFileId:'exact'}]}});
 try{
  await db.insert(projects).values({id:'review-project',userId:ctx.userId,accountId:ctx.accountId,title:'隔离测试',creationMode:'guided',status:'active',currentStage:'production',startedAt:now,createdAt:now,updatedAt:now});
  await db.insert(contentOutputs).values({id:'review-output',projectId:'review-project',contentType:'video',title:'隔离测试',status:'drafting',createdAt:now,updatedAt:now});
  const owner=createProductionService({db,now:()=>now,nextId:p=>`${p}-review-${++seq}`,assertEditorAsset:async()=>{if(unavailable)throw Error('已保存exact文件暂时不可读取');},createEditorRender:async()=>{renderTasks++;return {id:'should-never-create'};}});
  await owner.saveEditor(ctx,'review-output',{expectedRevision:0,requestId:'review-save-native',plan:native()});
  unavailable=true;const changed=native();changed.referenceEditor.nativeDocument.metadata.name='只修改标题';
  try{await owner.saveEditor(ctx,'review-output',{expectedRevision:1,requestId:'review-save-text-only',plan:changed});console.log('UNCHANGED_UNAVAILABLE_MEDIA_SAVE=PASS');}catch(e){console.log('UNCHANGED_UNAVAILABLE_MEDIA_SAVE=FAIL '+(e as Error).message);}
  unavailable=false;
  try{await owner.renderEditor(ctx,'review-output',{revision:1,requestId:'review-render-native'});console.log('NATIVE_HYPERFRAMES_RENDER=UNEXPECTED_SUCCESS');}catch(e){console.log('NATIVE_HYPERFRAMES_RENDER_ERROR='+(e as Error).message);}
  console.log('NATIVE_HYPERFRAMES_TASKS='+renderTasks);
  await owner.updateProduction(ctx,'review-output',{recordingConfig:{device:'change-only'}});console.log('ORDINARY_CONFIG_UPDATE_PRESERVED_EDITOR='+(await owner.getEditor(ctx,'review-output')).plan?.editorVersion);
  const unused=async()=>{throw Error('empty不应读取不存在媒体');};
  const conversion=createProductionConversion(db,{now:()=>now,nextId:p=>`${p}-review-${++seq}`,ports:{sourceGet:unused,readLegacyMain:unused,source:{readMediaFile:unused,createTask:unused,assertTaskSettled:unused,readTask:unused}}});
  const currentRevision=(await owner.getEditor(ctx,'review-output')).revision;
  try{const prepared=await conversion.prepare(ctx,'review-output',{mode:'empty',expectedRevision:currentRevision,requestId:'review-convert-v3-empty'});console.log('V3_OLD_CONVERSION_PREPARE='+JSON.stringify({editorVersion:prepared.plan.editorVersion,clips:prepared.plan.mainTrack.clips.length,sources:prepared.plan.mainTrack.sources.length,warnings:prepared.warnings}));
  const applied=await conversion.adopt(ctx,'review-output',{conversionRequestId:prepared.requestId,expectedRevision:currentRevision,requestId:'review-adopt-v3-empty',conversionDigest:prepared.conversionDigest});console.log('V3_OLD_CONVERSION_ADOPT='+JSON.stringify({editorVersion:applied.plan.editorVersion,revision:applied.revision}));}catch(e){console.log('V3_OLD_CONVERSION_BLOCKED='+(e as Error).message);}
 }finally{await opened.client.close();}
}
main().catch(e=>{console.error(e);process.exitCode=1;});
