import {expect,it,vi} from "vitest";
import {prepareReviewContext,projectReviewCandidate} from "./review-context";
import type {ContextDeps} from "./creative-context";
const ctx={userId:"user",accountId:"account",requestId:"review",source:"user" as const};
function deps(metrics="",comments:string[]=[]):ContextDeps {
 return {positioning:{getPositioningCenter:async()=>({profile:null,currentStatement:null})} as never,
 reviewSubject:{getTitle:vi.fn(async()=>"当前作品"),getScript:vi.fn(async()=>"真实稿件"),getMetricsSummary:vi.fn(async()=>metrics),getComments:vi.fn(async()=>comments)}};
}
it("只用当前项目真实metrics或comments准备上下文并透传归属",async()=>{
 const d=deps("播放100");const result=await prepareReviewContext(ctx,{projectId:"project",inputData:{topic:"备用题目"}},d);
 expect(d.reviewSubject!.getMetricsSummary).toHaveBeenCalledWith(ctx,"project");
 expect(result).toMatchObject({subject:"当前作品",reviewScriptBlock:"\n【本次复盘作品·文案】\n真实稿件\n",reviewMetricsBlock:"\n【本次复盘作品·真实数据】播放100\n",reviewCommentsBlock:""});
 const comments=await prepareReviewContext(ctx,{projectId:"project",inputData:{}},deps("",[" 真实评论 "]));expect(comments.reviewCommentsBlock).toContain("· 真实评论");
});
it("标题、稿件和用户自报数据不能替代当前项目发布证据",async()=>{
 expect((await prepareReviewContext(ctx,{projectId:"project",inputData:{}},deps())).reviewScriptBlock).toContain("真实稿件");
 for(const projectId of [null]) await expect(prepareReviewContext(ctx,{projectId,inputData:{metrics:"虚构100万",topic:"话题"}},deps())).rejects.toThrow("missing current-project");
});
it("reader失败保持无证据失败，已有评论可用时不反杀",async()=>{
 const d=deps("",["真评论"]);d.reviewSubject!.getMetricsSummary=async()=>{throw new Error("offline");};expect((await prepareReviewContext(ctx,{projectId:"p",inputData:{}},d)).reviewCommentsBlock).toContain("真评论");
 d.reviewSubject!.getComments=async()=>{throw new Error("offline");};d.reviewSubject!.getScript=async()=>"";await expect(prepareReviewContext(ctx,{projectId:"p",inputData:{}},d)).rejects.toThrow();
});
it("固定schema投影真实learning_list，保留正文并过滤空标题",()=>{
 expect(projectReviewCandidate({untrusted:"unused"},{learnings:[{title:"  方法论  ",insight:" 原始说明 "},{title:"  ",insight:"无标题"}]})).toEqual({resultType:"learning_list",resultData:{items:[{title:"方法论",insight:" 原始说明 "}],observations:[],hypotheses:[],nextExperiment:"",insufficientReason:""}});
});
it.each([{}, {learnings:[]},{learnings:[{title:" ",insight:"有说明无标题"}]},{learnings:[{title:42,insight:"错误类型"}]}])("空结果和坏schema不能变成有效候选 %s",object=>{expect(()=>projectReviewCandidate({},object)).toThrow();});

it("无可迁移经验的有效报告贯穿结构化schema与候选投影",async()=>{
 const {resolveStructuredBusinessSchema}=await import("../../../../ai-worker/src/execution/structured-business-schema");
 const raw={learnings:[],observations:["当前只有稿件"],hypotheses:["开头承诺与正文不一致可能影响理解"],nextExperiment:"保持主题，只将演示提前",insufficientReason:"尚无发布数据"};
 const schema=resolveStructuredBusinessSchema({skillId:"review.insights",facets:{}} as never)!;
 expect(projectReviewCandidate({},schema.parse(raw))).toEqual({resultType:"learning_list",resultData:{items:[],observations:raw.observations,hypotheses:raw.hypotheses,nextExperiment:raw.nextExperiment,insufficientReason:raw.insufficientReason}});
});
