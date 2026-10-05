import {it,expect} from "vitest";
import {productionEditorEdit} from "../src/resources/production-editor";
import {productionPlanV2,productionSourceTranscript} from "../src/resources/production-main-track";
const expectedItemDigest=`sha256:${"a".repeat(64)}`;
const source={sourceId:"source",assetId:"asset",assetFileId:"file",fileDigest:"a".repeat(64),probeDigest:"b".repeat(64),timebase:{num:1,den:30},durationTicks:300,hasAudio:true};
const draft={editorVersion:2,mainTrack:{sources:[source],clips:[]},overlayDraft:{meta:{},scenes:[],captions:[],broll:[],delivery:{width:1920,height:1080,fps:30}},sourceTranscripts:[]};
it("空主轨可保存，派生renderProps不能成为第二当前方案",()=>{
 expect(productionPlanV2.safeParse(draft).success).toBe(true);
 expect(productionPlanV2.safeParse({...draft,renderProps:{}}).success).toBe(false);
});
it("来源转写必须属于冻结文件，token和transcript稳定身份唯一",()=>{
 const base={transcriptId:"asr",sourceId:"source",assetFileId:"file",audioDigest:"c".repeat(64),providerReceiptId:"task",text:"真实句子",providerEvidence:{}};
 expect(productionSourceTranscript.safeParse({...base,granularity:"text"}).success).toBe(true);
 expect(productionSourceTranscript.safeParse({...base,granularity:"text",tokens:[{tokenId:"x",text:"字",startTicks:0,endTicks:1}]}).success).toBe(false);
 for(const item of [
  {...base,granularity:"segment",assetFileId:"other",tokens:[{tokenId:"t",text:"句",startTicks:0,endTicks:1}]},
  {...base,granularity:"word",tokens:[{tokenId:"t",text:"句",startTicks:0,endTicks:1},{tokenId:"t",text:"字",startTicks:1,endTicks:2}]},
  {...base,granularity:"segment",tokens:[{tokenId:"t",text:"句",startTicks:0,endTicks:301}]},
 ]) expect(productionPlanV2.safeParse({...draft,sourceTranscripts:[item]}).success).toBe(false);
});
it("粗剪严格操作能表达实例分割、修边、移除与重排",()=>{
 for(const value of [
  {type:"splitMainClip",clipId:"clip-1",expectedItemDigest,sourceSplitTick:30,newClipId:"clip-2"},
  {type:"trimMainClip",clipId:"clip-1",expectedItemDigest,sourceInTicks:0,sourceOutTicks:60},
  {type:"removeMainClip",clipId:"clip-1",expectedItemDigest},
  {type:"reorderMainClips",clipIds:["clip-2","clip-1"],expectedOrderDigest:expectedItemDigest},
 ]) expect(productionEditorEdit.safeParse(value).success).toBe(true);
});
it("粗剪操作拒绝负入点、重复排序身份及任意脚本字段",()=>{
 expect(productionEditorEdit.safeParse({type:"trimMainClip",clipId:"clip-1",expectedItemDigest,sourceInTicks:-1,sourceOutTicks:60}).success).toBe(false);
 expect(productionEditorEdit.safeParse({type:"reorderMainClips",clipIds:["clip-1","clip-1"],expectedOrderDigest:expectedItemDigest}).success).toBe(false);
 expect(productionEditorEdit.safeParse({type:"removeMainClip",clipId:"clip-1",expectedItemDigest,script:"execute"}).success).toBe(false);
});
