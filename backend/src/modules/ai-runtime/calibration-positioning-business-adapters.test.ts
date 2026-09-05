import {expect,it,vi} from "vitest";
import {createCalibrationDiagnoseBusinessAdapter,createCalibrationScoreBusinessAdapter,createPositioningGenerateBusinessAdapter} from "./calibration-positioning-business-adapters";
const ctx={userId:"u",accountId:"a",requestId:"r",source:"user" as const};
const skillSnapshot={snapshotVersion:1 as const,userId:"u",accountId:"a",resolvedAt:"now",platformPolicyVersion:"1",platformPolicy:"真实候选",skills:[]};
const task=(inputData:Record<string,unknown>)=>({id:"t",projectId:null,retryOfTaskId:null,skillSnapshot,inputData});
const positioning={getPositioningCenter:async()=>({profile:null,currentStatement:null})};
const frozen=(skillId:string,facets:Record<string,string|undefined>)=>({frozenInput:{kind:"model.structured",operationKey:skillId,skillId,capability:skillId,maxOutputTokens:100,facets,skillSnapshot:{...skillSnapshot,skills:[{skillId,baseVersion:"1",overlayRevision:null,overlayVersion:null,effective:{methodSystem:"",template:"",tools:[],requiredFacets:[],contextRequirements:[],outputSchema:{type:"object"},completionPolicy:null,completionPolicyAdapter:null}}]}}});
it("诊断冻结真实主体/量表，保留文稿、锚点与原评分归一，不接受伪目标或维度",async()=>{
 const get=vi.fn(async()=>({title:"真实作品",scriptText:"完整文稿"}));
 const adapter=createCalibrationDiagnoseBusinessAdapter({positioning,subject:{get},rubric:{current:async()=>({rubricVersionId:"rubric-real",dimensions:[{key:"hook",label:"钩子",description:"三秒明确冲突"}]})}});
 const facets=await adapter.prepare(ctx,task({subjectType:"publication",subjectId:"subject-real",rubricVersionId:"forged"}));
 expect(get).toHaveBeenCalledWith(ctx,"publication","subject-real");expect(facets.script).toBe("完整文稿");expect(facets.title).toBe("真实作品");expect(facets.rubricBlock).toContain("三秒明确冲突");
 const result=adapter.project({subjectId:"forged"},{subjectId:"forged",dimensions:[{key:" hook ",score:3.6,reason:" 原因 "},{key:"invented",score:5}],performance:{完播率:120}},frozen(adapter.skillId,facets));
 expect(result).toMatchObject({resultType:"calibration_diagnosis",resultData:{subjectType:"publication",subjectId:"subject-real",rubricVersionId:"rubric-real",diagnosis:{dimensions:[{key:"hook",score:4,reason:"原因"}],performance:{完播率:null}}}});
 expect(()=>adapter.project({}, {dimensions:[{key:"invented",score:5}]},frozen(adapter.skillId,facets))).toThrow();
 await expect(adapter.prepare(ctx,task({subjectType:"script",subjectId:"x"}))).rejects.toThrow();expect(get).toHaveBeenCalledTimes(1);
});
it("诊断缺主体/空量表拒绝，不以输入覆盖真实量表",async()=>{
 const get=vi.fn(async()=>({title:"",scriptText:""}));const adapter=createCalibrationDiagnoseBusinessAdapter({positioning,subject:{get},rubric:{current:async()=>({rubricVersionId:"r",dimensions:[]})}});
 await expect(adapter.prepare(ctx,task({}))).rejects.toThrow();expect(get).not.toHaveBeenCalled();
 await expect(adapter.prepare(ctx,task({subjectType:"content_output",subjectId:"x"}))).rejects.toThrow();
});
it("评分先验locked，冻结预测维度和实际指标，投影忽略伪造目标/指标",async()=>{
 const metrics=vi.fn(async()=>[{key:"views",value:42,unit:"次"}]);let status="draft";
 const adapter=createCalibrationScoreBusinessAdapter({positioning,prediction:{get:async()=>({status,subjectType:"content_output",subjectId:"output-real",title:"作品",dimensions:[{key:"hook",label:"原版钩子",predicted:2}]})},metrics:{forSubject:metrics}});
 await expect(adapter.prepare(ctx,task({predictionId:"p"}))).rejects.toThrow("锁定");expect(metrics).not.toHaveBeenCalled();status="locked";
 const facets=await adapter.prepare(ctx,task({predictionId:"p"}));expect(metrics).toHaveBeenCalledWith(ctx,"content_output","output-real");expect(facets.metricsBlock).toContain("42次");expect(facets.rubricBlock).toContain("原版钩子");expect(facets.rubricBlock).toContain("当初盲预测 2 分");
 expect(adapter.project({predictionId:"forged"},{predictionId:"forged",metrics:[{key:"views",value:999}],dimensions:[{key:"hook",score:4,reason:" 真实理由 "},{key:"other",score:5,reason:"非本预测维度"}]},frozen(adapter.skillId,facets))).toMatchObject({resultType:"calibration_score",resultData:{predictionId:"p",metrics:[{key:"views",value:42}],dimensions:[{key:"hook",score:4,reason:"真实理由"}]}});
 expect(()=>adapter.project({}, {dimensions:[{key:"other",score:5,reason:"非本预测维度"}]},frozen(adapter.skillId,facets))).toThrow();
});
it("缺实际指标诚实保留空数组与缺数据提示，不妨碍可编辑评分候选",async()=>{
 const adapter=createCalibrationScoreBusinessAdapter({positioning,prediction:{get:async()=>({status:"locked",subjectType:"publication",subjectId:"pub",title:"",dimensions:[{key:"x",label:"X",predicted:null}]})},metrics:{forSubject:async()=>[]}});
 const facets=await adapter.prepare(ctx,task({predictionId:"p"}));expect(facets.metricsBlock).toContain("暂无采集到的真实指标");expect(facets.subjectTitle).toBe("（未命名作品）");
 expect(adapter.project({}, {dimensions:[{key:"x",score:3,reason:"缺数据，保守评分"}]},frozen(adapter.skillId,facets))).toMatchObject({resultData:{metrics:[]}});
});
it("定位保持归一与硬约束/空作品降级，不物化任何目标",async()=>{
 const adapter=createPositioningGenerateBusinessAdapter({positioning,positioningWorks:{listProjects:async()=>{throw new Error("作品不可用");}}});
 const facets=await adapter.prepare(ctx,task({}));expect(facets.current).toContain("尚未设置定位");expect(facets.works).toBe("");
 expect(adapter.project({}, {persona:" 真实人设 ",keywords:["a"],facets:{statusNote:"伪造动态计数"},downstreamRules:{forbidRule:"不露脸"}},frozen(adapter.skillId,facets))).toMatchObject({resultType:"positioning_profile",resultData:{suggestion:{persona:"真实人设",keywords:["a","",""],facets:{statusNote:""},downstreamRules:{forbidRule:"不露脸"}}}});
 expect(()=>adapter.project({}, {},frozen(adapter.skillId,facets))).toThrow();
});
