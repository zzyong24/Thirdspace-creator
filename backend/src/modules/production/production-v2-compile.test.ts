import {expect,it} from "vitest";
import {productionPlanV2,type ProductionPlanV2} from "@creatoros/contract";
import {compileV2RenderablePlan} from "./production-v2-compile";
const source={sourceId:"s",assetId:"video",assetFileId:"original-file",fileDigest:"a".repeat(64),probeDigest:"b".repeat(64),timebase:{num:1,den:3},durationTicks:30,hasAudio:true};
const anchor={kind:"clip" as const,clipId:"left",sourceInTicks:0,sourceOutTicks:6};
function plan(){return {editorVersion:2,mainTrack:{sources:[source],clips:[{clipId:"left",sourceId:"s",sourceInTicks:0,sourceOutTicks:3},{clipId:"right",sourceId:"s",sourceInTicks:3,sourceOutTicks:6,derivedFromClipId:"left"},{clipId:"repeat",sourceId:"s",sourceInTicks:0,sourceOutTicks:6}]},overlayDraft:{meta:{title:"真实剪辑"},scenes:[],captions:[{id:"sentence",start:0,end:2,cn:"完整原句",anchor,extension:{keep:true}}],broll:[],delivery:{width:1920,height:1080,fps:30}},sourceTranscripts:[]} as unknown as ProductionPlanV2;}
it("保存保留真实锚点和扩展，编译按切分血缘映射但不串同源重复实例",()=>{
 const p=plan(),parsed=productionPlanV2.parse(p);expect(parsed.overlayDraft.captions[0]).toMatchObject({anchor,extension:{keep:true}});
 const compiled=compileV2RenderablePlan(p);
 expect(compiled.props.captions.map(c=>[c.start,c.end,c.cn])).toEqual([[0,1,"完整原句"],[1,2,"完整原句"]]);
 expect(compiled.props.talkingHead.durationSec).toBe(4);expect(compiled.props.talkingHead.clips).toHaveLength(3);
 expect(compiled.mediaBindings.map(b=>b.assetFileId)).toEqual(["original-file","original-file","original-file"]);
 expect(new Set(compiled.mediaBindings.map(b=>b.mountAs)).size).toBe(3);expect(p).toEqual(plan());
});
it("无映射的可选图层保留草稿并提示，纯主轨仍可输出，空工程可存但不能编译",()=>{
 const p=plan();p.overlayDraft.captions[0]!.anchor={...anchor,clipId:"deleted"};
 const result=compileV2RenderablePlan(p);expect(result.props.captions).toEqual([]);expect(result.warnings.join(" ")).toContain("sentence");expect(p.overlayDraft.captions).toHaveLength(1);
 p.mainTrack.clips=[];expect(productionPlanV2.safeParse(p).success).toBe(true);expect(()=>compileV2RenderablePlan(p)).toThrow("至少一段");
});
it("微秒映射累计无逐片舍入误差，独立媒体源偏移不变",()=>{
 const p=plan();p.mainTrack.clips=Array.from({length:3},(_,i)=>({clipId:`c${i}`,sourceId:"s",sourceInTicks:i,sourceOutTicks:i+1}));p.overlayDraft.captions=[];
 const result=compileV2RenderablePlan(p);expect(result.props.talkingHead.clips?.map(c=>[c.startSec,c.endSec,c.sourceInSec])).toEqual([[0,.333333,0],[.333333,.666667,1/3],[.666667,1,2/3]]);
});
it("模板保留微秒切点、三份独立媒体与源偏移，收集器不漏重复实例",async()=>{
 const {generateVideoRenderHtml,collectMediaFiles}=await import("../execution/video-render/template");
 const p=plan();p.mainTrack.clips=Array.from({length:3},(_,i)=>({clipId:`c${i}`,sourceId:"s",sourceInTicks:i,sourceOutTicks:i+1}));p.overlayDraft.captions=[];
 const props=compileV2RenderablePlan(p).props,html=generateVideoRenderHtml(props);
 expect(html).toContain('data-start="0.333333"');expect(html).toContain('data-duration="0.333334"');expect(html).toContain('data-media-start="0.666667"');
 expect(html.match(/class="clip talking-head"/g)).toHaveLength(3);expect(collectMediaFiles(props).videos).toHaveLength(3);
});
it("同批主轨和字幕编辑保留未知字段，任何触点冲突均零写入",async()=>{
 const {applyV2EditorEdits}=await import("./production-v2-edits"),{itemDigest}=await import("./production-editor-plan");
 const p=plan(),copy=structuredClone(p),caption=p.overlayDraft.captions[0]!,clip=p.mainTrack.clips[0]!;
 const edits=[{type:"trimMainClip",clipId:clip.clipId,expectedItemDigest:itemDigest(clip),sourceInTicks:1,sourceOutTicks:3},{type:"updateCaption",itemId:caption.id,expectedItemDigest:itemDigest(caption),patch:{cn:"人工改句"}}];
 const next=applyV2EditorEdits(p,edits,()=>"new-id");expect(next.overlayDraft.captions[0]).toMatchObject({cn:"人工改句",anchor,extension:{keep:true}});expect(next.mainTrack.clips[0]?.sourceInTicks).toBe(1);expect(p).toEqual(copy);
 expect(()=>applyV2EditorEdits(p,[...edits,{type:"removeItem",itemId:"missing",expectedItemDigest:itemDigest({})}],()=>"new-id")).toThrow();expect(p).toEqual(copy);
});
it("连续分割再删中间片段仍保留末尾字幕，跨源派生与循环拒绝",async()=>{
 const {applyMainTrackEdits}=await import("./production-main-track"),{itemDigest}=await import("./production-editor-plan");
 const p=plan();p.mainTrack.clips=[{clipId:"left",sourceId:"s",sourceInTicks:0,sourceOutTicks:6}];
 const first=applyMainTrackEdits(p,[{type:"splitMainClip",clipId:"left",expectedItemDigest:itemDigest(p.mainTrack.clips[0]),sourceSplitTick:2,newClipId:"middle"}]);
 const second=applyMainTrackEdits(first,[{type:"splitMainClip",clipId:"middle",expectedItemDigest:itemDigest(first.mainTrack.clips[1]),sourceSplitTick:4,newClipId:"last"}]);
 const result=applyMainTrackEdits(second,[{type:"removeMainClip",clipId:"middle",expectedItemDigest:itemDigest(second.mainTrack.clips[1])}]);
 expect(compileV2RenderablePlan(result).props.captions.map(c=>[c.start,c.end,c.cn])).toEqual([[0,.666667,"完整原句"],[.666667,1.333333,"完整原句"]]);
 const bad=plan();bad.mainTrack.sources.push({...source,sourceId:"other"});bad.mainTrack.clips[1]!.sourceId="other";expect(productionPlanV2.safeParse(bad).success).toBe(false);
 const cycle=plan();cycle.mainTrack.clips[0]!.derivedFromClipId="right";expect(productionPlanV2.safeParse(cycle).success).toBe(false);
});
it("跨场景素材切出连续实例和正确入点，明确改卡片时间真实生效",async()=>{
 const {applyV2EditorEdits}=await import("./production-v2-edits"),{itemDigest}=await import("./production-editor-plan");const p=plan();
 const card={kind:"quote" as const,id:"card",text:"真实观点",tone:"muted" as const,at:0,anchor:{kind:"timeline" as const,startUs:0,endUs:4000000}};
 p.overlayDraft.scenes=[{id:"scene-a",title:"上段",startSec:0,endSec:2,cards:[card]},{id:"scene-b",title:"下段",startSec:2,endSec:4,cards:[]}];
 p.overlayDraft.broll=[{id:"material",file:"image",at:0,durationSec:4,label:"素材",big:false,anchor:{kind:"timeline",startUs:0,endUs:4000000}}];
 const compiled=compileV2RenderablePlan(p);expect(compiled.props.broll.map(b=>[b.at,b.durationSec,b.mediaStartSec])).toEqual([[0,2,0],[2,2,2]]);
 const next=applyV2EditorEdits(p,[{type:"updateCard",itemId:"card",expectedItemDigest:itemDigest(card),card:{...card,at:1}}],()=>"new");expect(compileV2RenderablePlan(next).props.scenes[0]!.cards[0]?.at).toBe(1);
});
it("分割场景卡片身份不重复、素材入点持续，完整原句保留复核提示",async()=>{
 const {applyMainTrackEdits}=await import("./production-main-track"),{itemDigest}=await import("./production-editor-plan");
 const p=plan();p.mainTrack.clips=[{clipId:"left",sourceId:"s",sourceInTicks:0,sourceOutTicks:6}];
 p.overlayDraft.scenes=[{id:"scene",title:"原场景",startSec:0,endSec:2,anchor,cards:[{id:"card",kind:"quote",text:"完整观点",at:0,tone:"muted",anchor}]}];
 p.overlayDraft.broll=[{id:"material",file:"actual-material",at:0,durationSec:2,label:"素材",big:false,mediaStartSec:5,anchor}];
 let n=0;const next=applyMainTrackEdits(p,[{type:"splitMainClip",clipId:"left",expectedItemDigest:itemDigest(p.mainTrack.clips[0]),sourceSplitTick:3,newClipId:"second"}],()=>`overlay-${++n}`);
 const cards=next.overlayDraft.scenes.flatMap(scene=>scene.cards);expect(new Set(cards.map(card=>card.id)).size).toBe(cards.length);
 expect(next.overlayDraft.broll.map(item=>item.mediaStartSec)).toEqual([5,6]);
 const compiled=compileV2RenderablePlan(next);expect(compiled.props.broll.map(item=>item.mediaStartSec)).toEqual([5,6]);expect(compiled.warnings.join(" ")).toContain("完整原句");
 expect(compiled.props.captions.map(item=>item.cn)).toEqual(["完整原句","完整原句"]);
});
