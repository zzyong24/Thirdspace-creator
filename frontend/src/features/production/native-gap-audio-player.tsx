'use client';
import * as React from 'react';
import {productionReferencePlan,projectProductionRoughPlan,readProductionNativeScene,type ProductionPauseGap,type ProductionEditorDocument,type ReferenceEditorMedia} from '@creatoros/contract';

/** 仅宿主↔native 内部返回值；不进入 rough DTO、receipt 或 transcript。 */
export type OriginalAudioRange=({status:'decoded';assetFileId:string;sourceId:string;contextEpoch:number;videoFirstTimestamp:number|null;audioFirstTimestamp:number;rangeStartSeconds:number;rangeEndSeconds:number;chunks:Array<{buffer:AudioBuffer;timestamp:number}>})|{status:'manual_review';reason:string;chunks:[]};
export type GapAudioBinding={ref:ReferenceEditorMedia;sourceId:string;fileDigest:string;startSeconds:number;endSeconds:number};
export class GapAudioUnavailableError extends Error {constructor(message:string){super(message);this.name='GapAudioUnavailableError';}}
function unavailable():never {throw new GapAudioUnavailableError('此项原片身份或时钟尚未核实，请手工对照原片；其余建议可继续处理。');}
// SEMANTIC_BOUNDARY_ALLOW: 只核真实ID、相邻词句、源时间、clip实例和文件引用，不判断静音、语气或删留。
export function resolveGapAudioBinding(document:ProductionEditorDocument,gap:ProductionPauseGap,sceneId:string):GapAudioBinding {
 if(document.plan?.editorVersion!==3)return unavailable();
 const plan=productionReferencePlan.parse(document.plan),scene=readProductionNativeScene(plan,sceneId),view=projectProductionRoughPlan(plan,{sceneId});
 if(!scene||!view)return unavailable();
 const clips=view.mainTrack.clips.filter(c=>c.clipId===gap.clipId&&c.sourceId===gap.sourceId);
 const element=scene.tracks.main.elements.filter(e=>e.id===gap.clipId&&e.type==='video');
 const bindings=(plan.nativeSources??[]).filter(b=>b.source.sourceId===gap.sourceId&&b.mediaId===element[0]?.mediaId);
 if(clips.length!==1||element.length!==1||bindings.length!==1)return unavailable();
 const source=bindings[0].source,refs=plan.referenceEditor.mediaRefs.filter(r=>r.mediaId===bindings[0].mediaId&&r.assetId===source.assetId&&r.assetFileId===source.assetFileId);
 const transcripts=(plan.sourceTranscripts??[]).filter(t=>t.transcriptId===gap.transcriptId&&t.sourceId===source.sourceId&&t.assetFileId===source.assetFileId);
 if(refs.length!==1||transcripts.length!==1||!source.hasAudio||transcripts[0].granularity==='text'||source.timebase.num!==gap.sourceTimebase.num||source.timebase.den!==gap.sourceTimebase.den)return unavailable();
 const tokens=transcripts[0].tokens,index=tokens.findIndex(t=>t.tokenId===gap.leftTokenId),left=tokens[index],right=tokens[index+1];
 if(!left||!right||right.tokenId!==gap.rightTokenId||left.endTicks!==gap.sourceStartTicks||right.startTicks!==gap.sourceEndTicks||gap.sourceStartTicks<clips[0].sourceInTicks||gap.sourceEndTicks>clips[0].sourceOutTicks)return unavailable();
 const startSeconds=gap.sourceStartTicks*gap.sourceTimebase.num/gap.sourceTimebase.den,endSeconds=gap.sourceEndTicks*gap.sourceTimebase.num/gap.sourceTimebase.den;
 if(!Number.isFinite(startSeconds)||!Number.isFinite(endSeconds)||endSeconds<=startSeconds)return unavailable();
 return {ref:refs[0],sourceId:source.sourceId,fileDigest:source.fileDigest,startSeconds,endSeconds};
}
// SEMANTIC_BOUNDARY_ALLOW: 只消除秒差转样本时的IEEE754取整误差，不判断声音、删留或补齐缺口。
function sampleCoordinate(seconds:number,origin:number,rate:number):number {
 const value=(seconds-origin)*rate,nearest=Math.round(value);
 // 相减误差取决于两个绝对秒数；上限仅为百万分之一个sample的十分之一，超限保持原格点。
 const roundoff=8*Number.EPSILON*Math.max(1,Math.abs(seconds*rate),Math.abs(origin*rate));
 return Number.isSafeInteger(nearest)&&roundoff<=1e-7&&Math.abs(value-nearest)<=roundoff?nearest:value;
}
/** 裁剪 straddling AAC 块；不得用 input.first 归零、固定编码延迟或补零代替实际覆盖。 */
export function cropOriginalAudio(context:Pick<AudioContext,'createBuffer'>,range:OriginalAudioRange,start:number,end:number):AudioBuffer {
 if(range.status==='manual_review')throw new GapAudioUnavailableError(range.reason);
 if(range.videoFirstTimestamp!==0||range.rangeStartSeconds!==start||range.rangeEndSeconds!==end||!Number.isFinite(range.audioFirstTimestamp)||!range.chunks.length)return unavailable();
 const chunks=[...range.chunks].sort((a,b)=>a.timestamp-b.timestamp),rate=chunks[0].buffer.sampleRate,channels=chunks[0].buffer.numberOfChannels;
 if(!Number.isFinite(rate)||rate<=0||channels<1||!Number.isFinite(start)||end<=start)return unavailable();
 // 起止各最多扩展一个真实sample，完整覆盖请求；不合并不同采样时钟。
 const firstTimestamp=chunks[0].timestamp;
 if(!Number.isFinite(firstTimestamp)||firstTimestamp>start)return unavailable();
 const origin=firstTimestamp+Math.floor(sampleCoordinate(start,firstTimestamp,rate))/rate,frames=Math.ceil(sampleCoordinate(end,origin,rate)),result=context.createBuffer(channels,frames,rate);
 let covered=0;
 for(const chunk of chunks){
  const buffer=chunk.buffer;if(!Number.isFinite(chunk.timestamp)||buffer.sampleRate!==rate||buffer.numberOfChannels!==channels)return unavailable();
  const offset=Math.round((chunk.timestamp-origin)*rate);
  if(Math.abs(chunk.timestamp-origin-offset/rate)>1/rate)return unavailable();
  const from=Math.max(0,-offset,covered-offset),to=Math.min(buffer.length,frames-offset);
  if(to<=from)continue;
  if(offset+from>covered)return unavailable();
  for(let channel=0;channel<channels;channel++)result.getChannelData(channel).set(buffer.getChannelData(channel).subarray(from,to),offset+from);
  covered=Math.max(covered,offset+to);if(covered===frames)break;
 }
 if(covered!==frames)return unavailable();
 return result;
}
/** 完成只能来自running音频设备的自然ended；abort/stop/中断不得解锁确认。 */
export async function playOriginalAudioRange(context:AudioContext,buffer:AudioBuffer,signal:AbortSignal):Promise<void> {
 signal.throwIfAborted();if(context.state!=='running')throw new GapAudioUnavailableError('音频设备未开始播放，请重新试听此项。');
 const node=context.createBufferSource();node.buffer=buffer;node.playbackRate.value=1;node.loop=false;node.connect(context.destination);
 await new Promise<void>((resolve,reject)=>{
  let settled=false,started=false;const startAt=context.currentTime;
  const cleanup=()=>{node.onended=null;signal.removeEventListener('abort',cancel);context.removeEventListener('statechange',stateChanged);node.disconnect();};
  const finish=(error?:Error)=>{if(settled)return;settled=true;cleanup();if(error){try{node.stop();}catch{}reject(error);}else resolve();};
  const cancel=()=>finish(new DOMException('原声试听已取消','AbortError'));
  const stateChanged=()=>{if(context.state!=='running')finish(new GapAudioUnavailableError('播放被中断，请重新完整试听此项。'));};
  node.onended=()=>{if(!started||signal.aborted||context.state!=='running'||context.currentTime+1/buffer.sampleRate<startAt+buffer.duration)finish(new GapAudioUnavailableError('原声尚未完整播放，请重新试听。'));else finish();};
  signal.addEventListener('abort',cancel,{once:true});context.addEventListener('statechange',stateChanged);
  try{signal.throwIfAborted();node.start(startAt);started=true;}catch(error){finish(error instanceof Error?error:Error('原声播放未开始'));}
 });
}
export type NativeGapAudioPlayerProps={reviewKey:string;contextSignal?:AbortSignal;disabled?:boolean;startSeconds:number;endSeconds:number;retainedEndSeconds:number;decode:(signal:AbortSignal)=>Promise<OriginalAudioRange>;onConfirmed(value:boolean):void;createContext?:()=>AudioContext};
export function NativeGapAudioPlayer({reviewKey,contextSignal,disabled,startSeconds,endSeconds,retainedEndSeconds,decode,onConfirmed,createContext}:NativeGapAudioPlayerProps){
 const [state,setState]=React.useState<'idle'|'playing'|'complete'|'manual'>('idle'),[checked,setChecked]=React.useState(false),[message,setMessage]=React.useState<string|null>(null);
 const generation=React.useRef(0),session=React.useRef<{controller:AbortController;context:AudioContext}|null>(null),callbacks=React.useRef({onConfirmed});callbacks.current={onConfirmed};
 const cancel=React.useCallback(()=>{generation.current++;const current=session.current;session.current=null;current?.controller.abort();if(current)void current.context.close().catch(()=>{});},[]);
 React.useEffect(()=>{cancel();setState('idle');setChecked(false);setMessage(null);callbacks.current.onConfirmed(false);return()=>{cancel();callbacks.current.onConfirmed(false);};},[reviewKey,cancel]);
 React.useEffect(()=>{if(disabled){cancel();setState('idle');setChecked(false);callbacks.current.onConfirmed(false);}},[disabled,cancel]);
 async function listen(){
  cancel();setChecked(false);callbacks.current.onConfirmed(false);setMessage(null);setState('playing');
  const epoch=generation.current,controller=new AbortController(),signal=contextSignal?AbortSignal.any([controller.signal,contextSignal]):controller.signal;let context:AudioContext;
  try{context=createContext?.()??new AudioContext();}catch{setState('manual');setMessage('音频设备不可用，请手工对照此项原片。');return;}
  session.current={controller,context};
  try{
   // resume仍在真实点击调用栈，不使用定时器解锁或retimed时间轴预览。
   await context.resume();signal.throwIfAborted();
   const range=await decode(signal);signal.throwIfAborted();
   const buffer=cropOriginalAudio(context,range,startSeconds,endSeconds);
   await playOriginalAudioRange(context,buffer,signal);
   if(epoch===generation.current&&!signal.aborted)setState('complete');
  }catch(error){if(epoch===generation.current&&!signal.aborted){setState('manual');setMessage(error instanceof Error?error.message:'此项原声暂无法核实，请手工对照原片。');}}
  finally{if(session.current?.controller===controller)session.current=null;await context.close().catch(()=>{});}
 }
 return <div className="space-y-2 rounded border p-3 text-sm"><p>原声停顿 {startSeconds.toFixed(3)}–{endSeconds.toFixed(3)} 秒 · 按原速完整播放</p><p>保留 {startSeconds.toFixed(3)}–{retainedEndSeconds.toFixed(3)} 秒；删除 {retainedEndSeconds.toFixed(3)}–{endSeconds.toFixed(3)} 秒</p><button className="rounded border px-3 py-2 disabled:opacity-40" disabled={disabled||state==='playing'} onClick={()=>void listen()}>{state==='playing'?'正在播放原声…':'完整试听此项原声'}</button>{state==='playing'&&<button className="ml-2 rounded border px-3 py-2" onClick={()=>{cancel();setState('idle');}}>停止试听</button>}{state==='complete'&&<label className="flex gap-2"><input type="checkbox" checked={checked} onChange={event=>{setChecked(event.target.checked);callbacks.current.onConfirmed(event.target.checked);}}/>我已听完原声，并核对这次保留和删除的范围</label>}{message&&<p role="status" className="text-xs text-muted-foreground">{message}</p>}</div>;
}
