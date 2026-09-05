import {expect,it,vi} from "vitest";
import {preparePlanningContractContext,projectPlanningContractCandidate} from "./planning-contract-context";

const ctx={userId:"owner",accountId:"account",requestId:"test",source:"user" as const};
const task={projectId:"project",inputData:{artifactId:"contract",topic:"真实选题"}};
const deps=()=>({
  positioning:{getPositioningCenter:vi.fn(async()=>({profile:{persona:"创作者",field:"技术",audience:"读者",differentiation:"实测",capabilities:[]},currentStatement:null}))},
  learnings:{getSuggestions:vi.fn(async()=>[{title:"过去复盘",insight:"真实经验"}])},
  assertTargetArtifact:vi.fn(async()=>{}),
});
it("先通过目标工件归属门再读取真实上下文，facets保持定位/复盘/选题",async()=>{
  const d=deps();d.positioning.getPositioningCenter.mockImplementation(async()=>{expect(d.assertTargetArtifact).toHaveBeenCalledExactlyOnceWith(ctx,{artifactId:"contract",projectId:"project"});return {profile:{persona:"创作者",field:"技术",audience:"读者",differentiation:"实测",capabilities:[]},currentStatement:null};});
  const facets=await preparePlanningContractContext(ctx,task,d);
  expect(facets.positioning).toContain("创作者");expect(facets.learnings).toContain("真实经验");expect(facets.topic).toContain("真实选题");
});
it("缺目标或跨项目/账号工件立即拒绝，不把归属错误当可选上下文吞掉",async()=>{
  const d=deps();await expect(preparePlanningContractContext(ctx,{...task,inputData:{}},d)).rejects.toThrow("artifactId");expect(d.assertTargetArtifact).not.toHaveBeenCalled();
  d.assertTargetArtifact.mockRejectedValue(new Error("工件归属不符"));await expect(preparePlanningContractContext(ctx,task,d)).rejects.toThrow("归属不符");
  expect(d.positioning.getPositioningCenter).not.toHaveBeenCalled();expect(d.learnings.getSuggestions).not.toHaveBeenCalled();
});
it("可选定位和复盘读取失败保留旧空值降级",async()=>{
  const d=deps();d.positioning.getPositioningCenter.mockRejectedValue(new Error("unavailable"));d.learnings.getSuggestions.mockRejectedValue(new Error("unavailable"));
  const facets=await preparePlanningContractContext(ctx,task,d);expect(facets.positioning).toContain("尚未设置定位");expect(facets.learnings).toBe("");
});
it("候选固定4槽顺序、中文标题优先、兼容ID，正文和contentData一致且无领域写入",()=>{
  const candidate=projectPlanningContractCandidate(task.inputData,{"contract-cta":"  关注后续  ","受众定位":"  真实受众  ","contract-audience":"不能覆盖中文正文","价值主张":"真实价值","核心节奏":"真实节奏","额外字段":"不变成卡片"});
  expect(candidate).toMatchObject({resultType:"artifact_version",artifactId:"contract",resultData:{summary:"AI 内容合同草稿"}});
  const cards=[{id:"contract-audience",title:"受众定位",body:"真实受众"},{id:"contract-value",title:"价值主张",body:"真实价值"},{id:"contract-pacing",title:"核心节奏",body:"真实节奏"},{id:"contract-cta",title:"行动召唤",body:"关注后续"}];
  expect(candidate.resultData.cards).toEqual(cards);expect(candidate.resultData.contentData).toEqual({cards});
  expect(candidate.resultData.body).toBe("# 内容合同\n\n## 受众定位\n真实受众\n\n## 价值主张\n真实价值\n\n## 核心节奏\n真实节奏\n\n## 行动召唤\n关注后续");
});
it("旧合法非空子集继续产候选，不强制补满4卡",()=>{
  expect(projectPlanningContractCandidate(task.inputData,{"受众定位":" ","contract-audience":"真实内容"}).resultData.cards).toEqual([{id:"contract-audience",title:"受众定位",body:"真实内容"}]);
});
it.each([{},[],null,{"受众定位":42},{"受众定位":" "},{"未知":"内容"}])("坏结构或没有可用卡片不生成候选：%j",object=>{
  expect(()=>projectPlanningContractCandidate(task.inputData,object)).toThrow();
});
