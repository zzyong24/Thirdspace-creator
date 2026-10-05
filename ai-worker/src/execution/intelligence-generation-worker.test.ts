import {it, expect, vi, afterEach} from "vitest";
import {createExecutionWorker} from "./worker-runtime";
import * as providerFactory from "../runtime/provider-factory";
import {generateIntelligenceInWorker} from "./intelligence-generation-worker";
import {structuredGenerationInputSchema,type WorkerMessage} from "@creatoros/contract/execution-worker";

const spec={apiFormat:"openai_chat",baseUrl:"https://never-network.invalid/v1",model:"fixture",token:"secret-do-not-log",displayModelKey:"channel-managed"};
const snapshot={snapshotVersion:1,userId:"u",accountId:"a",resolvedAt:"now",platformPolicyVersion:"1",platformPolicy:"候选",skills:[{skillId:"intelligence.topic-decompose",baseVersion:"1",overlayRevision:null,overlayVersion:null,effective:{methodSystem:"拆解正文",template:"{{transcript}}",tools:[],requiredFacets:["transcript"],contextRequirements:[],outputSchema:{type:"object",properties:{hook:{type:"string"}},required:["hook"],additionalProperties:false},completionPolicy:null,completionPolicyAdapter:null}}]};
function input(){return structuredGenerationInputSchema.parse({kind:"model.structured",operationKey:"intelligence:fixture",capability:"topic.generate",skillId:"intelligence.topic-decompose",skillSnapshot:snapshot,maxOutputTokens:8192,facets:{mode:"topic_preview",target:JSON.stringify({positioning:{oneLiner:"定位",keywords:[]},item:{title:"作品",platform:"douyin",canonicalUrl:"https://example.com"},transcript:{text:"完整的原文"}})}});}
async function run(context:unknown=input(),credential:unknown=spec,rejectPort?:string){
 const messages:WorkerMessage[]=[];
 const worker=createExecutionWorker({capabilities:["model.structured"],generateStructured:generateIntelligenceInWorker,generate:vi.fn(),send(message){messages.push(message);if(message.type==="call")queueMicrotask(()=>worker.receive({version:1,type:"reply",requestId:message.requestId,ok:message.port!==rejectPort,errorCode:"HOST_PORT_REJECTED",data:message.port==="readTaskContext"?context:message.port==="resolveModelCredential"?credential:message.port==="reserveGenerationCall"?{callId:"fixture-call",status:"unknown"}:{}}));}});
 try{worker.receive({version:1,type:"run",requestId:"r",execution:{executionTaskId:"e",attempt:1,fenceToken:"f"},deadlineAt:null});await vi.waitFor(()=>expect(messages.some(m=>m.type==="stopped")).toBe(true));return messages;}finally{worker.close();}
}
afterEach(()=>{vi.unstubAllGlobals();vi.restoreAllMocks();});
it("真实 Pi 构造与冻结 Skill 到达预留端口，未知回执不联网",async()=>{
 const fetch=vi.fn(()=>{throw Error("不得联网");});vi.stubGlobal("fetch",fetch);
 const messages=await run();
 expect(messages.filter(m=>m.type==="call").map(m=>m.port)).toContain("reserveGenerationCall");
 expect(messages.find(m=>m.type==="call"&&m.port==="commitResult")).toMatchObject({data:{errorCode:"MODEL_CALL_REQUIRES_RECONCILIATION"}});
 expect(fetch).not.toHaveBeenCalled();expect(JSON.stringify(messages)).not.toContain(spec.token);
});
it.each(["readTaskContext","resolveModelCredential"])("宿主 %s 拒绝保留安全阶段",async port=>{
 const messages=await run(input(),spec,port);
 expect(messages.find(m=>m.type==="call"&&m.port==="commitResult")).toMatchObject({data:{outcome:"failed",errorCode:port==="readTaskContext"?"WORKER_CONTEXT_UNAVAILABLE":"WORKER_CREDENTIAL_UNAVAILABLE"}});
 expect(messages.filter(m=>m.type==="call").map(m=>m.port)).not.toContain("reserveGenerationCall");
});
it("损坏上下文不暴露输入且未调用模型",async()=>{
 const messages=await run({secret:spec.token});
 expect(messages.find(m=>m.type==="call"&&m.port==="commitResult")).toMatchObject({data:{errorCode:"WORKER_CONTEXT_INVALID"}});
 expect(JSON.stringify(messages)).not.toContain(spec.token);
});
it("损坏凭据回执独立诊断",async()=>{
 const messages=await run(input(),{secret:spec.token});
 expect(messages.find(m=>m.type==="call"&&m.port==="commitResult")).toMatchObject({data:{errorCode:"WORKER_CREDENTIAL_INVALID"}});
 expect(JSON.stringify(messages)).not.toContain(spec.token);
});

it("模型本地初始化失败不能谎报为已调用后结果未知",async()=>{
 vi.spyOn(providerFactory,"modelFor").mockImplementation(()=>{throw Error(spec.token);});
 const messages=await run();
 expect(messages.find(m=>m.type==="call"&&m.port==="commitResult")).toMatchObject({data:{outcome:"failed",errorCode:"INTELLIGENCE_MODEL_SETUP_FAILED"}});
 expect(messages.filter(m=>m.type==="call").map(m=>m.port)).not.toContain("reserveGenerationCall");
 expect(JSON.stringify(messages)).not.toContain(spec.token);
});

it("[T-1017] 显式 strategy_backed 旧链协议仍能到达模型预留", async () => {
 const original = input();
 const target = JSON.parse(original.facets.target!);
 original.facets.target = JSON.stringify({ ...target, generationMode: "strategy_backed", positioningVersionId: "legacy" });
 const messages = await run(original);
 expect(messages.filter(m => m.type === "call").map(m => m.port)).toContain("reserveGenerationCall");
 expect(messages.find(m => m.type === "call" && m.port === "commitResult")).toMatchObject({ data: { errorCode: "MODEL_CALL_REQUIRES_RECONCILIATION" } });
});
