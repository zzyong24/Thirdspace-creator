import {it,expect} from "vitest";
import {buildGraphicPostFacets,validateGraphicPostTextCandidate} from "./graphic-post-text";
const source={kind:"project" as const,id:"p",versionId:"v"};
const input={projectId:"p",outputId:"image",artifactId:"graphic",baseVersionId:"v0",kind:"cardBriefs",targetPlatform:null,brief:"图卡文字",
 current:{schemaVersion:1,title:"",body:"",summary:"",tags:[],imageUses:[],sourceRefs:[],ruleSnapshotRef:null},
 sourceRefs:[source],sourceMaterials:[{ref:source,label:"正文",text:"真实来源"}],ruleSnapshotRef:null,ruleGuidance:"",ruleOverrides:{}};
it("原图文文字任务生成结构卡片，拒绝伪造引用、重复身份和媒体路径",()=>{
 const value=[{cardId:"one",title:"标题",body:"正文",sourceRefs:[source]}];
 expect(JSON.parse(buildGraphicPostFacets(input).graphicPostContext!).kind).toBe("cardBriefs");
 expect(validateGraphicPostTextCandidate({kind:"cardBriefs",value},input).value).toEqual(value);
 for(const cards of [[...value,...value],[{...value[0],sourceRefs:[{...source,id:"fake"}]}],[{...value[0],assetFileId:"pretend"}]])
  expect(()=>validateGraphicPostTextCandidate({kind:"cardBriefs",value:cards},input)).toThrow();
});

it("连续规划保留原稿真实页来源及画面说明，不能生成其他来源",()=>{
 const inherited={kind:"asset" as const,id:"asset-source",versionId:"file-source"};
 const current={...input.current,sourceRefs:[inherited],cardBriefs:[{cardId:"original",title:"原页",body:"原文",sourceRefs:[inherited]}],seriesProfile:{visualDirection:"铅笔",aspectRatio:"3:4"}};
 const value=[{cardId:"original",title:"原页",body:"扩展内容",visualBrief:"承接下一页的角色",sourceRefs:[inherited]}];
 expect(validateGraphicPostTextCandidate({kind:"cardBriefs",value},{...input,current}).value).toEqual(value);
 expect(()=>validateGraphicPostTextCandidate({kind:"cardBriefs",value:[{...value[0],sourceRefs:[{...inherited,id:"unbound"}]}]},{...input,current})).toThrow("GRAPHIC_POST_SOURCE_REF_UNBOUND");
});
