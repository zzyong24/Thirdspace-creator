import {expect,it} from "vitest";
import {workSelection,workMemberBinding,workDependency,workReviewStatus,ENDPOINTS,CLI_OPERATION_POLICIES} from "../src/index";
it("四表达全部16子集合法，无视频必选；重复选项非法",()=>{
 const kinds=["video","article","image","moments"] as const;
 for(let mask=0;mask<16;mask++)expect(workSelection.parse(kinds.filter((_,i)=>mask&(1<<i)))).toEqual(kinds.filter((_,i)=>mask&(1<<i)));
 expect(workSelection.safeParse(["moments","moments"]).success).toBe(false);
});
it("新建空视频真实尚无稿件版本，不制造artifact；绑定身份必须一致",()=>{
 const base={member:{kind:"video",outputId:"video-one"},boundAt:"2026-10-02T06:00:00.000Z"};
 expect(workMemberBinding.safeParse({...base,boundVersion:{kind:"not_saved",outputId:"video-one"}}).success).toBe(true);
 expect(workMemberBinding.safeParse({...base,boundVersion:{kind:"not_saved",outputId:"video-other"}}).success).toBe(false);
});
it("手工保存可形成真实依赖，不借AI候选；已落实依赖必须有回执",()=>{
 const version={kind:"artifact",artifactId:"artifact",versionId:"version"};const base={dependencyId:"dependency",compositionId:"composition",member:{kind:"moments",momentsId:"moments"},target:{kind:"moments_field",momentsId:"moments",field:"text"},targetVersion:version,targetFingerprint:"a".repeat(64),sources:[],sourceRefs:[],files:[],ruleRefs:[],status:"current",createdAt:"2026-10-02T06:00:00.000Z"};
 expect(workDependency.safeParse({...base,commitReceipt:{kind:"manual_save",owner:"moments",version,clientRequestId:"save-request",requestDigest:"b".repeat(64),committedAt:base.createdAt}}).success).toBe(true);
 expect(workDependency.safeParse({...base,commitReceipt:null}).success).toBe(false);
});
it("人工确认不冒充模型验证，失败或历史报告不支持当前verified",()=>{
 const scope={kind:"composition",compositionId:"composition"},base={scope,currentFingerprint:"a".repeat(64),state:"not_reviewed",latestReport:null,confirmedReport:null,confirmation:null,modelVerification:"not_verified",visualVerification:"not_verified"};
 expect(workReviewStatus.safeParse(base).success).toBe(true);expect(workReviewStatus.safeParse({...base,modelVerification:"verified"}).success).toBe(false);
 const report={reportId:"report",compositionId:"composition",snapshot:{scope,basisArtifactId:"basis",basisVersionId:"version",selection:[],members:[],fingerprint:"b".repeat(64),frozenAt:"2026-10-02T06:00:00.000Z"},status:"succeeded",taskId:"task",executionTaskId:"execution",settledCallId:"call",outcome:{conclusion:"no_issue_found",issues:[],visualVerification:"not_verified"},errorCode:null,createdAt:"2026-10-02T06:00:00.000Z"};
 expect(workReviewStatus.safeParse({...base,latestReport:report,modelVerification:"verified"}).success).toBe(false);expect(workReviewStatus.safeParse({...base,latestReport:{...report,snapshot:{...report.snapshot,fingerprint:base.currentFingerprint}},modelVerification:"verified"}).success).toBe(true);
});
it("复杂POST读取不创建任务，生成与审核为真实异步external；无发布端点",()=>{
 expect(CLI_OPERATION_POLICIES[ENDPOINTS.getWorkReviewStatus.id]).toMatchObject({effect:"read",asyncTask:false,confirmation:"none"});expect(CLI_OPERATION_POLICIES[ENDPOINTS.getWorkCompositionCanvasContext.id]).toMatchObject({effect:"read",asyncTask:false});
 for(const id of [ENDPOINTS.generateMomentsCandidate.id,ENDPOINTS.retryMomentsCandidate.id,ENDPOINTS.createWorkReview.id])expect(CLI_OPERATION_POLICIES[id]).toMatchObject({effect:"external",asyncTask:true});
 expect(Object.values(ENDPOINTS).filter(endpoint=>endpoint.id.startsWith("moments.")&&endpoint.id.includes("publish"))).toEqual([]);
});
