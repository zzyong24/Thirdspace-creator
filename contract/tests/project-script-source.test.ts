import { describe, expect, it } from "vitest";
import { articleSourceRef, graphicPostSourceRef } from "../src/index";

describe("主脚本不可变来源引用", () => {
  it.each([articleSourceRef, graphicPostSourceRef])("接受真实 artifact/version 引用", schema => {
    expect(schema.parse({kind: "project_script", id: "script-a", versionId: "version-a"})).toEqual({kind: "project_script", id: "script-a", versionId: "version-a"});
    expect(schema.safeParse({kind: "project_script", id: "script-a", versionId: ""}).success).toBe(false);
    expect(schema.safeParse({kind: "project_script", id: "script-a", versionId: "version-a", text: "客户端伪造正文"}).success).toBe(false);
  });
});


it("T-1055 兼容元数据出处与 exact 配图候选，不改旧稿形状", async()=>{
 const {articleDocument,articleCandidateProposal,graphicPostDocument,graphicPostCardBriefs,articleResource}=await import("../src/index");
 const source={kind:"publication_revision",projectId:"p",sourceOutputId:"v",publicationId:"pub",revisionId:"r"};
 const old={schemaVersion:1,title:"",summary:"",sections:[],factItems:[],visualBriefs:[],imageUses:[]};
 expect(articleDocument.parse(old)).toEqual(old);
 expect(articleDocument.safeParse({...old,tags:["沿用"],metadataSource:source,imageMatchWarnings:["图片已不可用，正文已保留。"]}).success).toBe(true);
 expect(articleResource.safeParse({projectId:"p",outputId:"a",artifactId:"s",currentVersionId:"v",current:old,versions:[],scriptContext:{state:"ready",scriptRef:{kind:"project_script",id:"s",versionId:"v"},scriptText:"保存主稿",metadata:{title:"原标题",summary:"原简介",tags:["原标签"]},metadataSource:source}}).success).toBe(true);
 const candidate={proposedTitle:"t",proposedTitleSourceRefs:[],proposedSummary:"s",proposedSummarySourceRefs:[],proposedFactItems:[],proposedSections:[],proposedVisualBriefs:[{sectionId:"one",brief:"图片",proposedAssetId:"a",proposedAssetFileId:"f"}],sourceRefs:[]};
 expect(articleCandidateProposal.safeParse(candidate).success).toBe(true);
 expect(articleCandidateProposal.safeParse({...candidate,proposedVisualBriefs:[{sectionId:"one",brief:"旧视觉建议",proposedAssetId:"a"}]}).success).toBe(true);
 expect(articleCandidateProposal.safeParse({...candidate,proposedVisualBriefs:[{sectionId:"one",brief:"图片",proposedAssetFileId:"f"}]}).success).toBe(false);
 expect(graphicPostCardBriefs.safeParse([{cardId:"one",title:"t",body:"b",sourceRefs:[],proposedImage:{assetId:"a",assetFileId:"f"}}]).success).toBe(true);
 expect(graphicPostDocument.safeParse({schemaVersion:1,title:"",summary:"",body:"",tags:[],imageUses:[],sourceRefs:[],ruleSnapshotRef:null,metadataSource:source}).success).toBe(true);
});
