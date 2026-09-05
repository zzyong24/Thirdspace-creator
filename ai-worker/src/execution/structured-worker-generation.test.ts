import {createHash} from "node:crypto";
import { createServer } from "node:http";
import { expect, it, vi } from "vitest";
import * as structuredNode from "../nodes/structured-node";
import type { WorkerPort } from "@creatoros/contract/execution-worker";
import { generateStructuredInWorker } from "./structured-worker-generation";

const input={kind:"model.structured" as const,operationKey:"review",capability:"default",maxOutputTokens:500,skillId:"script.review",facets:{script:"原文片段"},skillSnapshot:{
  snapshotVersion:1 as const,userId:"fixture-user",accountId:"fixture-account",resolvedAt:"2026-09-05T00:00:00.000Z",platformPolicyVersion:"1",platformPolicy:"冻结平台规则",
  skills:[{skillId:"script.review",baseVersion:"old",overlayRevision:null,overlayVersion:null,effective:{methodSystem:"冻结审核方法",template:"审核 {{script}}",tools:[],requiredFacets:["script"],contextRequirements:[],outputSchema:{type:"object",additionalProperties:true},completionPolicy:null,completionPolicyAdapter:null}}],
}};
const report={verdict:"risk",summary:"有风险",findings:[{quote:"原文片段",severity:"warn",reason:"测试理由",ruleRef:"公约33"}]};
async function fixture(content:string,reasoning:string|undefined,native=false,protocolFallback=false,skillId="script.review"){
  const requests:Array<Record<string,any>>=[];
  const server=createServer(async(req,res)=>{
    const chunks:Buffer[]=[];for await(const chunk of req)chunks.push(Buffer.from(chunk));requests.push(JSON.parse(Buffer.concat(chunks).toString()));
    res.writeHead(protocolFallback && requests.length===1?400:200,{"content-type":"application/json"});
    if(protocolFallback && requests.length===1){res.end(JSON.stringify({error:{message:"response_format unsupported",type:"invalid_request_error"}}));return;}
    res.end(JSON.stringify({id:"fixture",object:"chat.completion",created:1,model:"review-fixture-model",choices:[{index:0,message:{role:"assistant",content,...(reasoning===undefined?{}:{reasoning_content:reasoning})},finish_reason:"stop"}],usage:{prompt_tokens:2,completion_tokens:3,total_tokens:5}}));
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
  return {run,requests,saved,rows,close:async()=>{server.closeAllConnections();await new Promise<void>(done=>server.close(()=>done()));}};
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
  try{const result=await f.run();expect(JSON.parse(result.text).object).toEqual(test.object);expect(f.saved).toEqual([result.text]);}
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
it.each([undefined,"[]",'[42]'])("planning.thesis缺失或坏grounding在模型预留前拒绝 %s",async rawGrounding=>{const call=vi.fn(async()=>{throw new Error("不得请求端口");});await expect(generateStructuredInWorker({...input,skillId:"planning.thesis",facets:rawGrounding ? {__planningThesisGrounding:rawGrounding} : {},skillSnapshot:{...input.skillSnapshot,skills:input.skillSnapshot.skills.map(s=>({...s,skillId:"planning.thesis"}))}},{apiFormat:"openai_chat",baseUrl:null,model:"unused",token:"unused"},new AbortController().signal,call)).rejects.toMatchObject({outcome:"failed"});expect(call).not.toHaveBeenCalled();});
