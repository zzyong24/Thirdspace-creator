import {NativeTracksSnapshotCommand} from '@/commands/timeline/native-tracks-snapshot';
import type {EditorCore} from '@/core';
import type {SceneTracks,TimelineElement} from '@/timeline';
import {mediaTime,TICKS_PER_SECOND} from '@/wasm';
import {assertEditable} from './edit-lock';
export class NativeOperationError extends Error {readonly status=409;readonly code='ConflictError';}
// SEMANTIC_BOUNDARY_ALLOW: 仅校验完整持久化JSON前值/owner/scene和合法tick，不理解内容。
export function nativeJson(value:unknown):unknown {if(value===undefined)return undefined;return JSON.parse(JSON.stringify(value,(key,v)=>['file','url','thumbnailUrl','thumbnail','buffer'].includes(key)||typeof v==='string'&&v.startsWith('blob:')?undefined:v));}
export function canonicalNative(value:unknown):string{if(Array.isArray(value))return `[${value.map(canonicalNative).join(',')}]`;if(value&&typeof value==='object')return `{${Object.keys(value).sort().filter(k=>(value as Record<string,unknown>)[k]!==undefined).map(k=>`${JSON.stringify(k)}:${canonicalNative((value as Record<string,unknown>)[k])}`).join(',')}}`;return JSON.stringify(value);}
export async function nativeDigest(value:unknown){const bytes=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(canonicalNative(nativeJson(value))));return `sha256:${Array.from(new Uint8Array(bytes),b=>b.toString(16).padStart(2,'0')).join('')}`;}
export function readNativeContext(editor:EditorCore,snapshot:unknown){return{...(snapshot as object),outputId:editor.project.getActive().metadata.id,sceneId:editor.scenes.getActiveScene().id,trackId:editor.scenes.getActiveScene().tracks.main.id,selectedElements:editor.selection.getSelectedElements(),playheadTick:editor.playback.getCurrentTime(),ticksPerSecond:TICKS_PER_SECOND};}
export async function seekNative(editor:EditorCore,payload:{outputId:string;sceneId:string;tick:number}){if(editor.project.getActive().metadata.id!==payload.outputId||!editor.scenes.getScenes().some(s=>s.id===payload.sceneId)||!Number.isSafeInteger(payload.tick)||payload.tick<0)throw new NativeOperationError('定位目标已改变，当前工程保留。');if(editor.scenes.getActiveScene().id!==payload.sceneId)await editor.scenes.switchToScene({sceneId:payload.sceneId});editor.playback.seek({time:mediaTime({ticks:payload.tick})});return{sceneId:payload.sceneId,tick:editor.playback.getCurrentTime()};}
export type NativeTracksPatch={outputId:string;sceneId:string;expectedBeforeDigest:string;beforeTracks:SceneTracks;afterTracks:SceneTracks};
function preserveRuntime(after:SceneTracks,before:SceneTracks):SceneTracks{const tracks=[before.main,...before.overlay,...before.audio];for(const t of [after.main,...after.overlay,...after.audio])for(const e of t.elements){let old:TimelineElement|undefined;for(const track of tracks){old=track.elements.find(item=>item.id===e.id);if(old)break;}if(old)for(const key of ['file','url','thumbnailUrl','thumbnail','buffer'])if(key in old)(e as unknown as Record<string,unknown>)[key]=(old as unknown as Record<string,unknown>)[key];}return after;}
export class NativePatchReplay {
 private readonly receipts=new Map<string,{fingerprint:Promise<string>;receipt:Promise<{sceneId:string;applied:true}>}>();
 async apply(editor:EditorCore,requestId:string,payload:NativeTracksPatch){
  const prior=this.receipts.get(requestId);
  if(prior){if(await prior.fingerprint!==await nativeDigest(payload))throw new NativeOperationError('同一剪辑回执不能更改原输入。');return prior.receipt;}
  const fingerprint=nativeDigest(payload);
  const receipt=fingerprint.then(()=>this.execute(editor,payload));
  this.receipts.set(requestId,{fingerprint,receipt});return receipt;
 }
 private async execute(editor:EditorCore,p:NativeTracksPatch){
  assertEditable();
  const scene=editor.scenes.getScenes().find(s=>s.id===p.sceneId);
  if(editor.project.getActive().metadata.id!==p.outputId||!scene)throw new NativeOperationError('作品或场景已改变，当前输入保留。');
  const current=canonicalNative(nativeJson(scene.tracks));
  if(current!==canonicalNative(p.beforeTracks)||p.expectedBeforeDigest!==await nativeDigest(scene.tracks))throw new NativeOperationError('时间轴已有新的修改，未覆盖。请先保存本地稿，再读取当前版本核对。');
  // Hash计算期间用户仍可能改轨道；落命令前再次核完整前值。
  if(canonicalNative(nativeJson(scene.tracks))!==current||editor.project.getActive().metadata.id!==p.outputId||canonicalNative(nativeJson(editor.scenes.getScenes().find(s=>s.id===p.sceneId)?.tracks))!==current)throw new NativeOperationError('时间轴在核对时发生变化，当前输入保留。');
  if(!p.afterTracks?.main||!Array.isArray(p.afterTracks.overlay)||!Array.isArray(p.afterTracks.audio)||p.afterTracks.main.id!==scene.tracks.main.id)throw new NativeOperationError('采纳轨道结构不匹配，当前工程保留。');
  editor.command.execute({command:new NativeTracksSnapshotCommand({outputId:p.outputId,sceneId:p.sceneId,before:scene.tracks,after:preserveRuntime(structuredClone(p.afterTracks),scene.tracks)})});
  return{sceneId:p.sceneId,applied:true as const};
 }
}
