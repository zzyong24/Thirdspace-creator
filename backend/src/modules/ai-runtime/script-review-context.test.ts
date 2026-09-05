import {describe,it,expect,vi} from "vitest";
import {prepareScriptReviewContext} from "./script-review-context";

const ctx={userId:"user",accountId:"account",requestId:"request",source:"user" as const};
const task={projectId:"project",inputData:{artifactId:"script",artifactVersion:2}};
const rules=[{id:"rule",tier:"official_hard" as const,category:"规则",matchType:"word" as const,pattern:"保证",replacement:null,note:"规则注释"}];
const setup=()=>({scriptSource:{getLatestScript:vi.fn().mockResolvedValue({artifactId:"script",version:2,text:"保证完整原文"})},lintRules:{listActiveLintRules:vi.fn().mockResolvedValue(rules)},positioning:{getPositioningCenter:vi.fn().mockResolvedValue({profile:{persona:"创作者",field:"技术",audience:"用户"}})}});
describe("审核 Worker 冻结上下文",()=>{
  it("冻结当前版本、真实正文、规则命中和定位，后续源变化不会改变快照",async()=>{
    const deps=setup();const facets=await prepareScriptReviewContext(ctx,task,deps);
    const snapshot=JSON.parse(facets.__reviewSnapshot!);
    expect(snapshot).toMatchObject({projectId:"project",artifactId:"script",artifactVersion:2,script:"保证完整原文",lintFindings:[{quote:"保证",tier:"official_hard"}]});
    expect(facets.script).toBe(snapshot.script);expect(facets.lexicon).toContain("保证");expect(facets.positioning).toBe("创作者 · 技术 · 用户");
    deps.scriptSource.getLatestScript.mockResolvedValue({artifactId:"script",version:3,text:"已改稿"});
    expect(JSON.parse(facets.__reviewSnapshot!).artifactVersion).toBe(2);
  });
  it.each([{artifactVersion:1},{artifactVersion:2,artifactId:"other"}])("拒绝过期版本而不读取规则 %j",async(inputData)=>{
    const deps=setup();await expect(prepareScriptReviewContext(ctx,{...task,inputData},deps)).rejects.toThrow("稿件已更新");expect(deps.lintRules.listActiveLintRules).not.toHaveBeenCalled();
  });
  it("无稿不能生成审核快照",async()=>{
    const deps=setup();deps.scriptSource.getLatestScript.mockResolvedValue(null);
    await expect(prepareScriptReviewContext(ctx,task,deps)).rejects.toThrow("暂无可审脚本");
  });
  it("草稿种子真实绑定 null/0，定位失败可按通用标准继续",async()=>{
    const deps=setup();deps.scriptSource.getLatestScript.mockResolvedValue({artifactId:null,version:0,text:"种子原文"});deps.positioning.getPositioningCenter.mockRejectedValue(new Error("unavailable"));
    const facets=await prepareScriptReviewContext(ctx,{projectId:"project",inputData:{artifactId:null,artifactVersion:0}},deps);
    expect(JSON.parse(facets.__reviewSnapshot!)).toMatchObject({artifactId:null,artifactVersion:0,script:"种子原文",lintFindings:[]});expect(facets.positioning).toContain("通用合规标准");
  });
});
