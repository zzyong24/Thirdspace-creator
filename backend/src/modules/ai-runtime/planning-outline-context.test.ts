import { describe,it,expect } from "vitest";
import { preparePlanningOutlineContext,projectPlanningOutlineCandidate } from "./planning-outline-context";
const outline={structureType:"问题-解决",opening:"抛冲突",sections:[{label:"钩子",intent:"抓注意"},{label:"价值",intent:"给方法"}],ending:"收束",cta:"行动"};
describe("结构方案候选与上下文",()=>{
  it("保留可编辑结构和可检索正文",()=>{
    const candidate=projectPlanningOutlineCandidate({artifactId:"a1"},outline);
    expect(candidate).toMatchObject({resultType:"artifact_version",artifactId:"a1",resultData:{contentData:outline}});
    expect(candidate.resultData.body).toContain("结构方案");
  });
  it("缺少文稿时在准备上下文前拒绝",async()=>{
    await expect(preparePlanningOutlineContext({userId:"u",accountId:"a",source:"user",requestId:"r"},{projectId:null,inputData:{}},{positioning:{getPositioningCenter:async()=>{throw new Error("不应调用");}}})).rejects.toThrow("目标文稿");
  });
  it("空结果不伪造候选",()=>{
    expect(()=>projectPlanningOutlineCandidate({artifactId:"a1"},{...outline,structureType:"",sections:[]})).toThrow("有效结构方案");
  });
});
