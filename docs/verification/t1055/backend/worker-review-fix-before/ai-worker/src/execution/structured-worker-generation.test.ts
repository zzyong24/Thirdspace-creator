import {createHash} from "node:crypto";
import { createServer } from "node:http";
import { expect, it, vi } from "vitest";
import * as structuredNode from "../nodes/structured-node";
import * as businessSchemas from "./structured-business-schema";
import { workerSkillSnapshotSchema, type WorkerPort } from "@creatoros/contract/execution-worker";
import { generateStructuredInWorker } from "./structured-worker-generation";

const input={kind:"model.structured" as const,operationKey:"review",capability:"default",maxOutputTokens:500,skillId:"script.review",facets:{script:"原文片段"},skillSnapshot:{
  snapshotVersion:1 as const,userId:"fixture-user",accountId:"fixture-account",resolvedAt:"2026-09-05T00:00:00.000Z",platformPolicyVersion:"1",platformPolicy:"冻结平台规则",
  skills:[{skillId:"script.review",baseVersion:"old",overlayRevision:null,overlayVersion:null,effective:{methodSystem:"冻结审核方法",template:"审核 {{script}}",tools:[],requiredFacets:["script"],contextRequirements:[],outputSchema:{type:"object",additionalProperties:true},completionPolicy:null,completionPolicyAdapter:null}}],
}};
const report={verdict:"risk",summary:"有风险",findings:[{quote:"原文片段",severity:"warn",reason:"测试理由",ruleRef:"公约33"}]};
async function fixture(content:string|((request:Record<string,any>,index:number)=>string),reasoning:string|undefined,native=false,protocolFallback=false,skillId="script.review",disconnect=false){
  const requests:Array<Record<string,any>>=[];
  const server=createServer(async(req,res)=>{
    const chunks:Buffer[]=[];for await(const chunk of req)chunks.push(Buffer.from(chunk));requests.push(JSON.parse(Buffer.concat(chunks).toString()));
    if(disconnect){req.socket.destroy();return;}
    res.writeHead(protocolFallback && requests.length===1?400:200,{"content-type":requests.at(-1)!.stream && !(protocolFallback && requests.length===1)?"text/event-stream":"application/json"});
    if(protocolFallback && requests.length===1){res.end(JSON.stringify({error:{message:"response_format unsupported",type:"invalid_request_error"}}));return;}
    const responseContent=typeof content==="function"?content(requests.at(-1)!,requests.length-1):content;
    if(requests.at(-1)!.stream){
      const chunk={id:"fixture",object:"chat.completion.chunk",created:1,model:"review-fixture-model",choices:[{index:0,delta:{role:"assistant",content:responseContent,...(reasoning===undefined?{}:{reasoning_content:reasoning})},finish_reason:null}]};
      const finish={...chunk,choices:[{index:0,delta:{},finish_reason:"stop"}],usage:{prompt_tokens:2,completion_tokens:3,total_tokens:5}};
      res.end('data: '+JSON.stringify(chunk)+'\n\ndata: '+JSON.stringify(finish)+'\n\ndata: [DONE]\n\n');return;
    }
    res.end(JSON.stringify({id:"fixture",object:"chat.completion",created:1,model:"review-fixture-model",choices:[{index:0,message:{role:"assistant",content:responseContent,...(reasoning===undefined?{}:{reasoning_content:reasoning})},finish_reason:"stop"}],usage:{prompt_tokens:2,completion_tokens:3,total_tokens:5}}));
  });await new Promise<void>(done=>server.listen(0,"127.0.0.1",done));
  const rows=new Map<string,Record<string,any>>(),saved:string[]=[];
  const call=async(port:WorkerPort,raw:unknown):Promise<unknown>=>{
    const data=raw as Record<string,any>;
    if(port==="reserveGenerationCall"){
      let row=rows.get(data.operationKey);if(!row){row={callId:`call-${rows.size+1}`,status:"reserved"};rows.set(data.operationKey,row);}return {callId:row.callId,status:row.status,...(row.providerResult?{providerResult:row.providerResult}:{}),...(row.rejectionCode?{rejectionCode:row.rejectionCode}:{})};
    }
    const row=[...rows.values()].find(row=>row.callId===data.callId)!;
    if(port==="startCall"){row.status="started";return {callId:row.callId,status:"started"};}
    if(port==="settleGenerationCall"){Object.assign(row,data);return {callId:row.callId,status:row.status};}
    if(port==="saveGenerationResult"){saved.push(data.text);return {};}
    throw new Error(`unexpected ${port}`);
  };
  const run=()=>generateStructuredInWorker({...input,skillId,...(skillId==="planning.thesis"?{facets:{...input.facets,__planningThesisGrounding:JSON.stringify(["冻结真实材料",...Array(6).fill("")])}}:{}),skillSnapshot:{...input.skillSnapshot,skills:input.skillSnapshot.skills.map(skill=>({...skill,skillId}))}},{apiFormat:"openai_chat",baseUrl:`http://127.0.0.1:${(server.address() as {port:number}).port}/v1`,model:"review-fixture-model",token:"fixture",structuredOutputs:native},new AbortController().signal,call);
  return {run,requests,saved,rows,call,spec:{apiFormat:"openai_chat" as const,baseUrl:`http://127.0.0.1:${(server.address() as {port:number}).port}/v1`,model:"review-fixture-model",token:"fixture"},close:async()=>{server.closeAllConnections();await new Promise<void>(done=>server.close(()=>done()));}};
}
it.each([
  {content:"{}",native:false},
  {content:"{}",native:true},
  {content:JSON.stringify({verdict:"pass",summary:"   ",findings:[]}),native:false},
  {content:JSON.stringify({verdict:"pass",summary:"结论"}),native:false},
  {content:"",reasoning:"{}",native:false},
  {content:"不是最终JSON",reasoning:JSON.stringify(report),native:false},
])("script.review固定完整性门拒绝空/残缺输出，不借宽松旧snapshot造pass：%j",async test=>{
  const f=await fixture(test.content,"reasoning" in test?test.reasoning:undefined,test.native);
  try{await expect(f.run()).rejects.toMatchObject({outcome:"failed"});expect(f.saved).toEqual([]);expect([...f.rows.values()].every(row=>row.status==="settled")).toBe(true);}finally{await f.close();}
});
it("审核partial不能保存结果或冒充提交未知（局部模拟节点完成策略结果）",async()=>{
  const original=structuredNode.runStructuredNode;
  const spy=vi.spyOn(structuredNode,"runStructuredNode").mockImplementation(async options=>{
    const result=await original(options);
    return {...result,validation:{status:"partial",errors:[{code:"MIN_SEGMENTS",path:"findings",message:"完成策略尚未满足"}],policySnapshot:{policy:{schemaVersion:1,minSegments:2,maxSegments:null,requiredSequence:[],repairAttempts:0},adapter:{id:"fixture-review",version:"1"}},originalSegmentCount:1,finalSegmentCount:1,repairAttemptsUsed:0,repairReasons:[]}};
  });
  const f=await fixture(JSON.stringify(report),undefined);
  try{await expect(f.run()).rejects.toMatchObject({outcome:"failed",errorCode:"STRUCTURED_OUTPUT_INVALID"});expect(f.requests).toHaveLength(1);expect(f.saved).toEqual([]);}
  finally{spy.mockRestore();await f.close();}
});
it.each([{reasoning:false,native:false},{reasoning:false,native:true},{reasoning:true,native:false},{reasoning:true,native:true}])("script.review保留同次完整reasoning恢复和协议归一化：%j",async test=>{
  const f=await fixture(test.reasoning?"":JSON.stringify(report),test.reasoning?JSON.stringify(report):undefined,test.native,test.native && test.reasoning);
  try{
    const result=await f.run();const parsed=JSON.parse(result.text);
    expect(parsed.object).toMatchObject({verdict:"risk",summary:"有风险",findings:[{quote:"原文片段",severity:"warn",category:"公约33"}]});
    expect(parsed.modelLabel).toBe("review-fixture-model");expect(f.saved).toEqual([result.text]);
    if(test.native)expect(f.requests[0]?.response_format?.json_schema?.schema?.required).toEqual(expect.arrayContaining(["verdict","summary","findings"]));
    expect(f.requests[0]?.messages).toEqual(expect.arrayContaining([expect.objectContaining({role:"system",content:expect.stringContaining("冻结审核方法")})]));
    const count=f.requests.length;expect((await f.run()).text).toBe(result.text);expect(f.requests).toHaveLength(count);
  }finally{await f.close();}
});

for(const native of [false,true]){
 it.each([
  {skillId:"review.insights",object:{}},
  {skillId:"review.insights",object:{learnings:[]}},
  {skillId:"review.insights",object:{learnings:[{title:"  ",insight:"只有解释"}]}},
  {skillId:"planning.contract",object:{}},
  {skillId:"planning.contract",object:{"受众定位":"  ",unknown:"有文字"}},
  {skillId:"planning.contract",object:{"contract-audience":3}},
 ])(`业务输出必须在保存前拒绝，宽snapshot/native=${native}：%j`,async test=>{
  const f=await fixture(JSON.stringify(test.object),undefined,native,false,test.skillId);
  try{await expect(f.run()).rejects.toMatchObject({outcome:"failed",errorCode:"STRUCTURED_OUTPUT_INVALID"});expect(f.saved).toEqual([]);expect(f.requests.length).toBeGreaterThan(0);}
  finally{await f.close();}
 });
 it.each([
  {skillId:"review.insights",object:{learnings:[{title:" 一条可用经验 ",insight:""}]}},
  {skillId:"planning.contract",object:{"contract-audience":"旧ID格式的单槽合同"}},
  {skillId:"planning.contract",object:{"价值主张":"标题格式单槽合同"}},
 ])(`业务旧合法子集可成功保存，native=${native}：%j`,async test=>{
  const f=await fixture(JSON.stringify(test.object),undefined,native,false,test.skillId);
  try{const result=await f.run();expect(JSON.parse(result.text).object).toMatchObject(test.object);if(test.skillId==="review.insights")expect(JSON.parse(result.text).object).toMatchObject({observations:[],hypotheses:[],nextExperiment:"",insufficientReason:"",learnings:[{source:"",applicability:""}]});expect(f.saved).toEqual([result.text]);}
  finally{await f.close();}
 });
}

it.each([false,true])("structured旧fallback回执兼容且拒绝原文篡改=%s",async tamper=>{
const voiceover = " 第一段原文。\n".repeat(20),
  hash = createHash("sha256").update(voiceover).digest("hex");
const generation = {
  finishReason: "stop",
  usage: { inputTokens: 2, outputTokens: 3, cachedTokens: 0, totalTokens: 5 },
  attempts: [
    {
      kind: "initial" as const,
      finishReason: "stop",
      usage: {
        inputTokens: 2,
        outputTokens: 3,
        cachedTokens: 0,
        totalTokens: 5,
      },
    },
  ],
};
const snapshot = {
  snapshotVersion: 1 as const,
  userId: "u",
  accountId: "a",
  resolvedAt: "2026-09-05",
  platformPolicyVersion: "1",
  platformPolicy: "候选",
  skills: [
    "script.draft",
    "script.storyboard.segment",
    "script.voiceover.compose",
  ].map((skillId) => ({
    skillId,
    baseVersion: "v1",
    overlayRevision: null,
    overlayVersion: null,
    effective: {
      methodSystem: "",
      template: "",
      tools: [],
      requiredFacets: [],
      contextRequirements: [],
      outputSchema: { type: "object" },
      completionPolicy: null,
      completionPolicyAdapter: null,
    },
  })),
};
function input() {
  return {
    kind: "model.structured",
    operationKey: "script",
    capability: "script.draft",
    maxOutputTokens: 1000,
    skillId: "script.draft",
    skillSnapshot: structuredClone(snapshot),
    facets: {
      __scriptDraft: JSON.stringify({
        nodeInput: { positioningBrief: "", targetDurationSeconds: 1 },
        initialVoiceover: {
          voiceover,
          sha256: hash,
          charCount: voiceover.length,
          voiceoverGeneration: generation,
          storyboardAttemptCount: 1,
        },
      }),
    },
  };
}
 const {structuredGenerationInputSchema}=await import("@creatoros/contract/execution-worker");const ports:string[]=[];let oldText="";
 const run=()=>generateStructuredInWorker(structuredGenerationInputSchema.parse(input()),{apiFormat:"openai_chat",baseUrl:null,model:"configured-model",token:"unused"},new AbortController().signal,async(port,raw)=>{ports.push(port);if(port!=="saveScriptFallback")throw new Error("不得调用模型端口");const old=JSON.parse((raw as {text:string}).text);old.modelLabel="old-model";old.validation.errors[0].message="旧文案";if(tamper)old.object.shots[0].口播="伪造";oldText=JSON.stringify(old);return {callId:"old-fallback",text:oldText};});
 if(tamper)await expect(run()).rejects.toMatchObject({outcome:"unknown_result"});else expect(await run()).toEqual({callId:"old-fallback",text:oldText});expect(ports).toEqual(["saveScriptFallback"]);
});
it("planning.thesis宽松旧Skill不能把无效列变成空候选",async()=>{const f=await fixture(JSON.stringify({branches:[{column:"unknown",title:"表面非空"}]}),undefined,true,false,"planning.thesis");try{await expect(f.run()).rejects.toMatchObject({outcome:"failed"});expect(f.saved).toEqual([]);}finally{await f.close();}});
it("planning.thesis固定协议保留Skill覆盖且不额外规划调用",async()=>{const f=await fixture(JSON.stringify({core:{title:"真实论点",summary:"说明"},branches:[{column:"支持",title:"依据",summary:"材料"}]}),undefined,true,false,"planning.thesis");try{await f.run();expect(f.requests).toHaveLength(1);expect(JSON.stringify(f.requests[0])).toContain("冻结审核方法");expect(JSON.parse(f.saved[0]!).object.branches[0].column).toBe("支持");}finally{await f.close();}});
it.each([undefined,"[]",'[42]'])("planning.thesis缺失或坏grounding在模型预留前拒绝 %s",async rawGrounding=>{const call=vi.fn(async()=>{throw new Error("不得请求端口");});await expect(generateStructuredInWorker({...input,skillId:"planning.thesis",facets:rawGrounding ? {__planningThesisGrounding:rawGrounding} : {},skillSnapshot:{...input.skillSnapshot,skills:input.skillSnapshot.skills.map(s=>({...s,skillId:"planning.thesis"}))}},{apiFormat:"openai_chat",baseUrl:null,model:"unused",token:"unused"},new AbortController().signal,call)).rejects.toMatchObject({outcome:"failed",errorCode:"STRUCTURED_INPUT_INVALID"});expect(call).not.toHaveBeenCalled();});

it("daily真实HTTP与完成策略partial在保存前失败，不能转提交未知",{retry:0},async()=>{
 const {registerOfficialCompletionPolicyAdapter}=await import('../prompt/completion-policy');
 registerOfficialCompletionPolicyAdapter({id:'test.daily.partial',version:'1',supportsSchema:()=>true,toSegments:value=>(value as {topics:unknown[]}).topics.map(()=>({role:'topic'}))});
 const frozen={version:1,mode:'daily',basis:'positioning',projectId:null,context:{positioningBrief:'真实定位',knowledgeBrief:'',learningsBrief:''},qualityNow:input.skillSnapshot.resolvedAt,qualityInputs:{signals:[],positioning:null,knowledge:[]},qualityProfile:{comments:{count:0,coveredWorks:0,strongSignalRatio:0,noiseRatio:0},positioning:{filledFacets:0,totalFacets:9,rulesFilled:0,completeness:0},knowledge:{count:0,recentRatio:null},trend:{sourceCount:0,signalCount:0}},basisBrief:'',trendSources:[]};
 const snapshot={...input.skillSnapshot,skills:input.skillSnapshot.skills.map(skill=>({...skill,skillId:'topic.generate',effective:{...skill.effective,requiredFacets:[],completionPolicy:{schemaVersion:1 as const,minSegments:2,maxSegments:null,requiredSequence:[],repairAttempts:0},completionPolicyAdapter:{id:'test.daily.partial',version:'1'}}}))};
 const dailyInput={...input,skillId:'topic.generate',capability:'topic.generate',facets:{__dailyTopic:JSON.stringify({jobId:'j',jobRunId:'r',dayKey:'2026-09-05',dailyLimit:5,preferences:[],rankingNow:input.skillSnapshot.resolvedAt}),__topicGenerate:JSON.stringify(frozen)},skillSnapshot:snapshot};
 const f=await fixture(JSON.stringify({topics:[{title:'真实选题',angle:'角度',source:'demand',predictedScore:80,reason:'依据'}]}),undefined);
 const call=async(port:WorkerPort,data:unknown,signal?:AbortSignal)=>port==='reserveTopicRead'?{callId:'settled-search',status:'settled',request:{kind:'search',query:'冻结查询'},requestDigest:'sha256:'+'a'.repeat(64),receipt:{kind:'search',status:'ok',data:{results:[]}}}:f.call(port,data);
 try{await expect(generateStructuredInWorker(dailyInput,f.spec,new AbortController().signal,call)).rejects.toMatchObject({outcome:'failed',errorCode:'STRUCTURED_OUTPUT_INVALID'});expect(f.requests).toHaveLength(1);expect(f.saved).toEqual([]);}
 finally{await f.close();}
});

// T-1032：真实 Worker→Pi→本地供应商 HTTP；只证明约束送达，不能证明语义遵循。
it.each([false,true])("script.draft 新口播的事实范围送达供应商系统消息，native=%s",async native=>{
  const {getOfficialSkillBase}=await import('../index');
  const {SCRIPT_FACT_SCOPE_SYSTEM}=await import('../prompt/templates/script-draft');
  const voiceover="先明确每个平台要交付的作品。图文准备正文和图片。视频准备脚本和成片。";
  const f=await fixture((_request,index)=>JSON.stringify(index===0
    ?{centralClaim:"先定作品",audienceOldBelief:"先安排流程",voiceover}
    :{shots:[{role:"body",口播:voiceover,画面:"作品清单",字幕:"先定作品",时长:"0-10s"}]}),undefined,native);
  const snapshot=workerSkillSnapshotSchema.parse({...input.skillSnapshot,skills:["script.draft","script.voiceover.compose","script.storyboard.segment"].sort().map(skillId=>{
    const b=getOfficialSkillBase(skillId)!;
    return {skillId,baseVersion:b.baseVersion,overlayRevision:null,overlayVersion:null,effective:{methodSystem:b.methodSystem,template:b.template,tools:b.tools,requiredFacets:b.requiredFacets,contextRequirements:b.contextRequirements,outputSchema:b.outputSchema,completionPolicy:b.completionPolicy?{...b.completionPolicy,minSegments:1,maxSegments:null,requiredSequence:[],repairAttempts:0}:null,completionPolicyAdapter:b.completionPolicyAdapter}};
  })});
  const checkpoints:unknown[]=[];
  const call=async(port:WorkerPort,raw:unknown)=>{
    if(port==="saveScriptVoiceover"){checkpoints.push(raw);return {};}
    return f.call(port,raw);
  };
  try{
    const result=await generateStructuredInWorker({...input,skillId:"script.draft",operationKey:"new-script",maxOutputTokens:1000,facets:{__scriptDraft:JSON.stringify({nodeInput:{positioningBrief:"",topicTitle:"一人运营多个平台",sourceMaterialsBrief:"仅提供图文与视频作品形态，未提供效果指标。",targetDurationSeconds:10}})},skillSnapshot:snapshot},{...f.spec,structuredOutputs:native},new AbortController().signal,call);
    expect(f.requests).toHaveLength(2);
    expect(f.requests[0]!.messages).toEqual(expect.arrayContaining([expect.objectContaining({role:"system",content:expect.stringContaining(SCRIPT_FACT_SCOPE_SYSTEM)})]));
    expect(checkpoints).toHaveLength(1);
    expect(checkpoints[0]).toMatchObject({voiceover});
    expect(JSON.parse(result.text).object.shots.map((shot:{口播:string})=>shot.口播).join("")).toBe(voiceover);
    expect(f.saved).toEqual([result.text]);
  }finally{await f.close();}
});

// T-1033：只检查请求前合同类型，不判断资料内容语义。
it.each([
 {skillId:"planning.thesis",key:"__planningThesisGrounding",raw:"{"},
 {skillId:"copilot.assist",key:"__copilotReply",raw:"{"},
 {skillId:"copilot.assist",key:"__copilotReply",raw:"[]"},
 {skillId:"research.gather",key:"__researchGather",raw:"{"},
 {skillId:"research.gather",key:"__researchGather",raw:"[]"},
 {skillId:"material.match",key:"__materialMatchGrounding",raw:"{"},
 {skillId:"material.match",key:"__materialMatchGrounding",raw:'{"assetIds":[42]}'},
 {skillId:"calibration.diagnose",key:"__calibrationDiagnosis",raw:"{"},
 {skillId:"calibration.score",key:"__calibrationScore",raw:'{"rubricKeys":[42]}'},
])("前置冻结输入损坏明确失败且零端口/HTTP/保存：%j",async test=>{
 const f=await fixture("{}",undefined);const call=vi.fn(f.call);
 try{
  await expect(generateStructuredInWorker({...input,skillId:test.skillId,facets:{[test.key]:test.raw},skillSnapshot:{...input.skillSnapshot,skills:input.skillSnapshot.skills.map(s=>({...s,skillId:test.skillId}))}},f.spec,new AbortController().signal,call)).rejects.toMatchObject({outcome:"failed",errorCode:"STRUCTURED_INPUT_INVALID"});
  expect(call).not.toHaveBeenCalled();expect(f.requests).toEqual([]);expect(f.saved).toEqual([]);expect(f.rows.size).toBe(0);
 }finally{await f.close();}
});
it("前置普通代码异常不被坏输入分类吞掉",async()=>{
 const spy=vi.spyOn(businessSchemas,"resolveStructuredBusinessSchema").mockImplementation(()=>{throw new Error("ordinary-code-error");});
 const f=await fixture(JSON.stringify(report),undefined);const call=vi.fn(f.call);
 try{await expect(generateStructuredInWorker(input,f.spec,new AbortController().signal,call)).rejects.toMatchObject({outcome:"unknown_result",errorCode:"MODEL_RESULT_UNKNOWN"});expect(call).not.toHaveBeenCalled();expect(f.requests).toEqual([]);expect(f.saved).toEqual([]);}
 finally{spy.mockRestore();await f.close();}
});
it("已启动供应商断连仍未知且重投不重复联网",async()=>{
 const f=await fixture("",undefined,false,false,"script.review",true);
 try{
  await expect(f.run()).rejects.toMatchObject({outcome:"unknown_result"});
  expect(f.requests).toHaveLength(1);expect(f.saved).toEqual([]);expect([...f.rows.values()]).toEqual([expect.objectContaining({status:"unknown"})]);
  await expect(f.run()).rejects.toMatchObject({outcome:"unknown_result"});expect(f.requests).toHaveLength(1);
 }finally{await f.close();}
});
