import {describe,expect,it} from "vitest";
import {getTemplate} from "../prompt/registry";
import {buildPublicationTextFacets,validatePublicationTextCandidate} from "./publication-text";

const frozen={projectId:"project-1",outputId:"output-1",platform:"xiaohongshu",kind:"publish_tags",
  publicationId:null,baseRevisionId:null,outputType:"image",title:"标题",brief:"真实项目说明",
  current:{title:"",description:"",platformTags:[]},sourceRefs:[{kind:"project",id:"project-1",versionId:"version-1"}],
  ruleSnapshotRef:null,ruleGuidance:"",ruleOverrides:{}};
describe("T-1029 发布物料单项生成",()=>{
  it("注册独立平台化 Skill，并仅保留指定字段",()=>{
    expect(getTemplate("publication.text").id).toBe("publication.text");
    expect(buildPublicationTextFacets(frozen).publicationContext).toContain("xiaohongshu");
    expect(validatePublicationTextCandidate({kind:"publish_tags",value:["内容创作","工作流"]},frozen))
      .toEqual({kind:"publish_tags",value:["内容创作","工作流"]});
    expect(()=>validatePublicationTextCandidate({kind:"description",value:"简介"},frozen)).toThrow("PUBLICATION_TEXT_KIND_MISMATCH");
  });
  it("平台与作品形式不匹配时拒绝提交",()=>{
    expect(()=>buildPublicationTextFacets({...frozen,platform:"douyin"})).toThrow("PUBLICATION_PLATFORM_TYPE_MISMATCH");
  });
});
