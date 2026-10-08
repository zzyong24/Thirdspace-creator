import type { EditorCore } from '@/core';
import type { TProject } from '@/project/types';
import { storageService } from '@/services/storage/service';
import { beginExportLock } from './edit-lock';
import { cancelPendingMediaImports } from './media-registration';
export async function exportFrozenSnapshot(editor:EditorCore,format:'mp4'|'webm'){
 const unlock=beginExportLock();
 try{
  editor.playback.pause();
  editor.save.pause();
  cancelPendingMediaImports('正在导出，未完成的素材导入已暂停，请导出后重试。');
  await editor.save.flush();
  // This exact immutable native snapshot supplies both renderer inputs and the host CAS.
  const snapshot=storageService.snapshot();
  const project=structuredClone(snapshot.document) as unknown as TProject;
  project.metadata.createdAt=new Date(project.metadata.createdAt);
  project.metadata.updatedAt=new Date(project.metadata.updatedAt);
  project.scenes=project.scenes.map(scene=>({...scene,createdAt:new Date(scene.createdAt),updatedAt:new Date(scene.updatedAt)}));
  const scene=project.scenes.find(scene=>scene.id===project.currentSceneId);
  if(!scene)throw new Error('当前剪辑画面不存在，请重新载入稿件。');
  const mediaAssets=editor.media.getAssets().map(asset=>({...asset}));
  const result=await editor.renderer.exportProject({options:{format,quality:'high',includeAudio:true,fps:project.settings.fps},frozen:{tracks:scene.tracks,project,mediaAssets,duration:editor.timeline.getTotalDuration()}});
  if(!result.success||!result.buffer)throw new Error(result.error||'导出失败，请重试。');
  return {...snapshot,blob:new Blob([result.buffer],{type:format==='webm'?'video/webm':'video/mp4'}),fileName:`${project.metadata.name}.${format}`};
 }finally{try{editor.save.resume();}finally{unlock();}}
}
