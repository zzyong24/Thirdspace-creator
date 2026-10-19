import {describe,it,expect} from "vitest";
import {applyMainTrackEdits,mapMainTrack} from "./production-main-track";
import {itemDigest} from "./production-editor-plan";
import type {ProductionPlanV2} from "@creatoros/contract";
const source={sourceId:"s",assetId:"a",assetFileId:"f",fileDigest:"a".repeat(64),probeDigest:"b".repeat(64),timebase:{num:1,den:3},durationTicks:100,hasAudio:true};
function plan():ProductionPlanV2{return {editorVersion:2,mainTrack:{sources:[source],clips:[{clipId:"a",sourceId:"s",sourceInTicks:0,sourceOutTicks:6}]},overlayDraft:{meta:{},scenes:[],captions:[],broll:[],delivery:{width:1920,height:1080,fps:30}},sourceTranscripts:[]};}
describe("真实源时间到连续主轨的机械映射",()=>{
 it("按有理数累计，不把逐片舍入误差累加",()=>{
  const p=plan();p.mainTrack.clips=Array.from({length:3},(_,i)=>({clipId:String(i),sourceId:"s",sourceInTicks:i,sourceOutTicks:i+1}));
  const m=mapMainTrack(p.mainTrack);expect(m.map(c=>[c.startUs,c.endUs])).toEqual([[0,333333],[333333,666667],[666667,1000000]]);
 });
 it("分割保留左身份，重排和修边不换实例，删除可保存空主轨",()=>{
  const p=plan(),old=structuredClone(p);
  const split=applyMainTrackEdits(p,[{type:"splitMainClip",clipId:"a",expectedItemDigest:itemDigest(p.mainTrack.clips[0]),sourceSplitTick:3,newClipId:"b"}]);
  expect(p).toEqual(old);expect(split.mainTrack.clips.map(c=>c.clipId)).toEqual(["a","b"]);
  expect(split.mainTrack.clips[1]?.derivedFromClipId).toBe("a");
  const moved=applyMainTrackEdits(split,[{type:"reorderMainClips",clipIds:["b","a"],expectedOrderDigest:itemDigest(["a","b"])}]);
  const trimmed=applyMainTrackEdits(moved,[{type:"trimMainClip",clipId:"b",expectedItemDigest:itemDigest(moved.mainTrack.clips[0]),sourceInTicks:4,sourceOutTicks:6}]);
  expect(mapMainTrack(trimmed.mainTrack).map(c=>[c.clipId,c.startUs,c.endUs])).toEqual([["b",0,666667],["a",666667,1666667]]);
  const empty=applyMainTrackEdits(trimmed,trimmed.mainTrack.clips.map(c=>({type:"removeMainClip" as const,clipId:c.clipId,expectedItemDigest:itemDigest(c)})));
  expect(empty.mainTrack.clips).toEqual([]);
 });
 it("批内冲突不污染原稿，拒绝重复身份、越界及漏项排序",()=>{
  const p=plan(),old=structuredClone(p);
  for(const edits of [
   [{type:"splitMainClip",clipId:"a",expectedItemDigest:itemDigest(p.mainTrack.clips[0]),sourceSplitTick:6,newClipId:"b"}],
   [{type:"trimMainClip",clipId:"a",expectedItemDigest:itemDigest(p.mainTrack.clips[0]),sourceInTicks:0,sourceOutTicks:101}],
   [{type:"reorderMainClips",clipIds:[],expectedOrderDigest:itemDigest(["a"])}],
   [{type:"removeMainClip",clipId:"a",expectedItemDigest:itemDigest(p.mainTrack.clips[0])},{type:"removeMainClip",clipId:"missing",expectedItemDigest:itemDigest({})}],
  ]){expect(()=>applyMainTrackEdits(p,edits)).toThrow();expect(p).toEqual(old);}
 });
 it("文字删除仅影响选定实例，纯文本不可伪装词剪",()=>{
  const p=plan();p.mainTrack.clips.push({...p.mainTrack.clips[0]!,clipId:"repeat"});
  p.sourceTranscripts=[{transcriptId:"t",sourceId:"s",assetFileId:"f",audioDigest:"c".repeat(64),providerReceiptId:"receipt",text:"整句",providerEvidence:{},granularity:"segment",tokens:[{tokenId:"token",text:"整句",startTicks:2,endTicks:4}]}];
  const next=applyMainTrackEdits(p,[{type:"removeTranscriptRange",clipId:"a",expectedItemDigest:itemDigest(p.mainTrack.clips[0]),transcriptId:"t",transcriptDigest:itemDigest(p.sourceTranscripts[0]),tokenIds:["token"],granularity:"segment"}],()=>"right");
  expect(next.mainTrack.clips.map(c=>[c.clipId,c.sourceInTicks,c.sourceOutTicks])).toEqual([["a",0,2],["right",4,6],["repeat",0,6]]);
  expect(next.sourceTranscripts).toEqual(p.sourceTranscripts);
 });
});
