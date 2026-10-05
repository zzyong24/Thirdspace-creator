import {createHash} from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import { GenerationFailure } from "./generation-error";
import { createExecutionWorker } from "./worker-runtime";
import type { WorkerMessage } from "@creatoros/contract/execution-worker";
const execution = {executionTaskId: "exec-1", attempt: 1, fenceToken: "lease-1"};
it("图卡 Skill 进入持久图片 Worker 分支，不落普通结构化文本提交",async()=>{
 const messages:WorkerMessage[]=[],runCover=vi.fn(async()=>({callId:"image-call",text:"{}"}));
 const skillSnapshot={snapshotVersion:1,userId:"u",accountId:"a",resolvedAt:"now",platformPolicyVersion:"1",platformPolicy:"候选",
  skills:[{skillId:"graphic.card-brief",baseVersion:"1",overlayRevision:null,overlayVersion:null,effective:{methodSystem:"",template:"",tools:[],requiredFacets:[],contextRequirements:[],outputSchema:{type:"object"},completionPolicy:null,completionPolicyAdapter:null}}]};
 const input={kind:"model.structured",operationKey:"graphic.card-brief",capability:"copy.generate",maxOutputTokens:100,
  skillId:"graphic.card-brief",skillSnapshot,facets:{graphicCardContext:"{}"}};
 const worker=createExecutionWorker({generate:vi.fn(),generateStructured:vi.fn(),runCover:runCover as never,
  send(message){messages.push(message);if(message.type==="call")queueMicrotask(()=>worker.receive({version:1,type:"reply",requestId:message.requestId,ok:true,
   data:message.port==="readTaskContext"?input:message.port==="resolveModelCredential"?{apiFormat:"openai_chat",baseUrl:null,model:"text-model",token:"secret"}:{resultId:"result-1"}}));}});
 try{worker.receive({version:1,type:"run",requestId:"card-run",execution,deadlineAt:Date.now()+10000});
  await vi.waitFor(()=>expect(messages.some(message=>message.type==="stopped")).toBe(true));
  expect(messages.find(message=>message.type==="stopped")).toMatchObject({reason:"completed"});
  expect(runCover).toHaveBeenCalledOnce();
  expect(messages.find(message=>message.type==="call"&&message.port==="commitResult")).toMatchObject({data:{outcome:"succeeded",callId:"image-call"}});
 }finally{worker.close();}
});
it.each([false,true])("网页能力声明依赖已装配对话运行器：%s",hasRunner=>{
 const messages:WorkerMessage[]=[];
 const worker=createExecutionWorker({generate:vi.fn(),supportsChatWebRead:true,...(hasRunner?{runChat:vi.fn()}:{}),send:message=>{messages.push(message);}});
 try{worker.ready();const ready=messages.find(message=>message.type==="ready");expect(ready?.type==="ready" && ready.capabilities.includes("chat.web-read")).toBe(hasRunner);}finally{worker.close();}
});
it("未声明网页能力时在读取模型凭据前拒绝网页任务",async()=>{
 const messages:WorkerMessage[]=[],runChat=vi.fn(async()=>{throw Error("不能进入对话执行器");});
 const input={kind:"chat.run",operationKey:"web",capability:"copilot.assist",userId:"u",accountId:"a",conversationId:"c",sourceMessageId:"m",system:"事实",messages:[{role:"user",content:"读网页"}],maxSteps:4,maxOutputTokens:100,tools:[{name:"web.read",version:"1",description:"网页",parameters:{},effect:"committed",execution:"worker.web-read"}]};
 const worker=createExecutionWorker({generate:vi.fn(),runChat,send(message){messages.push(message);if(message.type==="call")queueMicrotask(()=>worker.receive({version:1,type:"reply",requestId:message.requestId,ok:true,data:message.port==="readTaskContext"?input:{}}));}});
 try{
  worker.ready();worker.receive({version:1,type:"run",requestId:"web-run",execution,deadlineAt:Date.now()+10000});
  await vi.waitFor(()=>expect(messages.some(m=>m.type==="stopped")).toBe(true));
  expect(runChat).not.toHaveBeenCalled();expect(messages.filter(m=>m.type==="call").map(m=>m.port)).not.toContain("resolveModelCredential");
  expect(messages.find(m=>m.type==="call" && m.port==="commitResult")).toMatchObject({data:{outcome:"waiting_user",errorCode:"CHAT_WEB_READ_WORKER_UNAVAILABLE"}});
 }finally{worker.close();}
});

function fixture(generate = vi.fn(async (): Promise<{text:string;usage:unknown}> => ({text: "正文", usage: {inputTokens: 1, outputTokens: 2}})), rejectPort?: string, heartbeatMs?: number, reservationStatus = "reserved", recovery?: "requires_reconciliation") {
  const messages: WorkerMessage[] = [];
  let settled = false;
  let unknownUsage = false;
  let revision = 0;
  let savedMessages: Array<{role:"assistant";callId:string}> = [];
  const worker = createExecutionWorker({send(message) {
    messages.push(message);
    if(message.type === "call" && message.port === "settleCall") {
      const data=message.data as {status:string;usage?:Record<string,unknown>};
      settled=data.status==="settled";unknownUsage=settled && Object.keys(data.usage ?? {}).length===0;
    }
    if(message.type === "call" && message.port === "saveCheckpoint" && rejectPort!=="saveCheckpoint") {
      const input=message.data as {expectedRevision:number;expectedLedgerSequence:number;messages:typeof savedMessages};
      expect(input.expectedRevision).toBe(revision);expect(input.expectedLedgerSequence).toBe(1);
      savedMessages=input.messages;revision++;
    }
    if (message.type === "call") queueMicrotask(() => worker.receive({version: 1, type: "reply", requestId: message.requestId, ok: message.port !== rejectPort, data:
      message.port === "readCheckpoint" ? {revision,ledgerSequence:settled?1:0,messages:savedMessages,uncheckpointedReceipts:settled && !savedMessages.length?[{callId:"call-1",kind:"model",sequence:1,resultText:"正文"}]:[],recovery:recovery ?? (unknownUsage ? "requires_reconciliation" : settled && !savedMessages.length?"requires_replay":"ready")} :
      message.port === "saveCheckpoint" ? {revision} :
      message.port === "readTaskContext" ? {kind: "model.generate", prompt: "写正文", capability: "script", maxOutputTokens: 100, operationKey: "op-1"} :
      message.port === "resolveModelCredential" ? {apiFormat: "openai_chat", baseUrl: null, model: "test", token: "private"} : message.port === "reserveCall" ? {callId:"call-1",status:reservationStatus} : message.port === "startCall" ? {callId:"call-1",status:"started"} : {}}));
  }, generate, heartbeatMs});
  return {worker, messages, generate};
}
const run = {version: 1, type: "run", requestId: "run-1", execution, deadlineAt: Date.now() + 60000};
describe("独立 Worker 端口生命周期", () => {
  it("先取得上下文与预算许可，再生成、结算并提交", async () => {
    const {worker, messages, generate} = fixture();
    worker.receive(run);
    await vi.waitFor(() => expect(messages.some(x => x.type === "stopped")).toBe(true));
    expect(generate).toHaveBeenCalledTimes(1);
    expect(messages.filter(x => x.type === "call").map(x => x.port)).toEqual(["readTaskContext", "readCheckpoint", "reserveCall", "resolveModelCredential", "startCall", "settleCall", "readCheckpoint", "saveCheckpoint", "commitResult"]);
    expect(JSON.stringify(messages)).not.toContain("private");
    worker.close();
  });
  it("重复投递同一租约不产生第二次模型调用", async () => {
    const {worker, messages, generate} = fixture();
    worker.receive(run); worker.receive(run);
    await vi.waitFor(() => expect(messages.some(x => x.type === "stopped")).toBe(true));
    worker.receive(run);
    await new Promise(resolve => setTimeout(resolve, 10));
    expect(generate).toHaveBeenCalledTimes(1);
    worker.close();
  });
  it("过期任务不申请凭据或预算", async () => {
    const {worker, messages, generate} = fixture();
    worker.receive({...run, deadlineAt: Date.now()-1});
    await vi.waitFor(() => expect(messages.some(x => x.type === "stopped")).toBe(true));
    expect(messages.filter(x => x.type === "call")).toHaveLength(0);
    expect(generate).not.toHaveBeenCalled();
    worker.close();
  });
  it("预算拒绝不执行模型", async () => {
    const {worker, messages, generate} = fixture(undefined, "reserveCall");
    worker.receive(run);
    await vi.waitFor(() => expect(messages.some(x => x.type === "stopped")).toBe(true));
    expect(generate).not.toHaveBeenCalled();
    worker.close();
  });
  it("成功提交回执异常不再提交失败覆盖结果", async () => {
    const {worker, messages} = fixture(undefined, "commitResult");
    worker.receive(run);
    await vi.waitFor(() => expect(messages.some(x => x.type === "stopped")).toBe(true));
    expect(messages.filter(x => x.type === "call" && x.port === "commitResult")).toHaveLength(1);
    expect(messages.find(x => x.type === "stopped")).toMatchObject({reason: "unknown_result"});
    worker.close();
  });
  it("长调用续租失败会中断执行，结束后不再心跳", async () => {
    const messages: WorkerMessage[] = [];
    let observedSignal: AbortSignal | undefined;
    const worker = createExecutionWorker({heartbeatMs: 5,
      send(message) {
        messages.push(message);
        if (message.type === "call") queueMicrotask(() => worker.receive({version: 1, type: "reply", requestId: message.requestId,
          ok: message.port !== "heartbeat", data: message.port === "readCheckpoint" ? {revision:0,ledgerSequence:0,messages:[],uncheckpointedReceipts:[],recovery:"ready"} : message.port === "readTaskContext"
            ? {kind: "model.generate", prompt: "正文", capability: "script", maxOutputTokens: 100, operationKey: "op"}
            : message.port === "resolveModelCredential" ? {apiFormat: "openai_chat", baseUrl: null, model: "test", token: "test"} : message.port === "reserveCall" ? {callId:"call-1",status:"reserved"} : message.port === "startCall" ? {callId:"call-1",status:"started"} : {}}));
      },
      async generate(_input, _model, signal) {
        observedSignal = signal;
        return new Promise((_resolve, reject) => signal.addEventListener("abort", () => reject(new Error("aborted")), {once: true}));
      },
    });
    worker.receive(run);
    await vi.waitFor(() => expect(messages.some(x => x.type === "stopped")).toBe(true));
    expect(observedSignal?.aborted).toBe(true);
    expect(messages.filter(x => x.type === "call" && x.port === "commitResult")).toHaveLength(0);
    const count = messages.length;
    await new Promise(resolve => setTimeout(resolve, 20));
    expect(messages).toHaveLength(count);
    worker.close();
  });
  it("启动许可拒绝时供应商调用保持为零", async () => {
    const {worker,messages,generate}=fixture(undefined,"startCall");
    worker.receive(run);
    await vi.waitFor(()=>expect(messages.some(x=>x.type==="stopped")).toBe(true));
    expect(generate).not.toHaveBeenCalled();
    expect(messages.find(x=>x.type==="stopped")).toMatchObject({reason:"unknown_result"});
    worker.close();
  });
  it.each(["started","settled","unknown","rejected"])("恢复遇到%s调用不重放供应商", async status => {
    const {worker,messages,generate}=fixture(undefined,undefined,undefined,status);
    worker.receive(run);
    await vi.waitFor(()=>expect(messages.some(x=>x.type==="stopped")).toBe(true));
    expect(generate).not.toHaveBeenCalled();
    expect(messages.filter(x=>x.type==="call" && (x.port==="startCall" || x.port==="settleCall"))).toHaveLength(0);
    expect(messages.find(x=>x.type==="stopped")).toMatchObject({reason:"unknown_result"});
    worker.close();
  });

  it("检查点保存失败禁止提交候选或覆盖已结算结果",async()=>{
    const {worker,messages,generate}=fixture(undefined,"saveCheckpoint");
    worker.receive(run);
    await vi.waitFor(()=>expect(messages.some(x=>x.type==="stopped")).toBe(true));
    expect(generate).toHaveBeenCalledTimes(1);
    expect(messages.filter(x=>x.type==="call" && x.port==="commitResult")).toHaveLength(0);
    expect(messages.filter(x=>x.type==="call" && x.port==="settleCall")).toHaveLength(1);
    expect(messages.find(x=>x.type==="stopped")).toMatchObject({reason:"unknown_result"});
    worker.close();
  });
  it("检查点要求对账时不开始新的供应商调用",async()=>{
    const {worker,messages,generate}=fixture(undefined,undefined,undefined,"reserved","requires_reconciliation");
    worker.receive(run);
    await vi.waitFor(()=>expect(messages.some(x=>x.type==="stopped")).toBe(true));
    expect(generate).not.toHaveBeenCalled();
    expect(messages.filter(x=>x.type==="call" && ["reserveCall","startCall","saveCheckpoint"].includes(x.port))).toHaveLength(0);
    expect(messages.find(x=>x.type==="stopped")).toMatchObject({reason:"unknown_result"});
    worker.close();
  });

  it("有效正文缺少usage仍保存回执并提交，未知预算不触发新调用",async()=>{
    const generate=vi.fn(async()=>({text:"正文",usage:{}}));
    const {worker,messages}=fixture(generate);
    worker.receive(run);
    await vi.waitFor(()=>expect(messages.some(x=>x.type==="stopped")).toBe(true));
    expect(generate).toHaveBeenCalledTimes(1);
    expect(messages.filter(x=>x.type==="call" && x.port==="saveCheckpoint")).toHaveLength(1);
    expect(messages.find(x=>x.type==="call" && x.port==="commitResult")).toMatchObject({data:{outcome:"succeeded",text:"正文"}});
    expect(messages.find(x=>x.type==="stopped")).toMatchObject({reason:"completed"});
    worker.close();
  });

});


describe("可注入 Agent Worker 生命周期",()=>{
  const agentInput={kind:"agentic.run",operationKey:"agent",taskType:"agentic.research",goal:"研究",systemPrompt:"冻结",capability:"research",maxOutputTokens:100,dryRun:false,tools:[{name:"web.read",version:"1",label:"读取",description:"读取",parameters:{type:"object"},effect:"none"}]};
  const result={actualEngine:"pi" as const,summary:"真实候选",stopReason:"completed" as const,lastModelCallId:"m1",toolCallIds:["t1"]};
  function agentFixture(mode:"success"|"missing"|"failure"|"commitLost"|"commitFailed"|"cancel"="success"){
    const messages:WorkerMessage[]=[];const generate=vi.fn();
    const runAgentic=vi.fn(async(_input,_model,signal,_call,onText)=>{
      onText?.("研究进度");
      if(mode==="failure")throw new GenerationFailure("retry_wait","RATE_LIMIT",120000);
      if(mode==="cancel")await new Promise<void>(resolve=>signal.addEventListener("abort",()=>resolve(),{once:true}));
      return result;
    });
    const worker=createExecutionWorker({generate,runAgentic:mode==="missing"?undefined:runAgentic,send(message){
      messages.push(message);
      if(message.type==="call")queueMicrotask(()=>worker.receive({version:1,type:"reply",requestId:message.requestId,ok:!(mode==="commitLost" && message.port==="commitAgenticResult"),data:message.port==="readTaskContext"?agentInput:message.port==="resolveModelCredential"?{apiFormat:"openai_chat",baseUrl:null,model:"test",token:"private",authStyle:"bearer"}:message.port==="commitAgenticResult"?{resultId:"result-1",aiTaskId:"task-1",...(mode==="commitFailed"?{outcome:"failed",errorCode:"AGENT_NO_PROPOSALS"}:{})}:{}}));
    }});
    return {worker,messages,generate,runAgentic};
  }
  it("仅装配真实运行器时声明能力，结果走专用候选端口",async()=>{
    const f=agentFixture();f.worker.ready();f.worker.receive(run);
    await vi.waitFor(()=>expect(f.messages.some(m=>m.type==="stopped")).toBe(true));
    expect(f.messages.find(m=>m.type==="ready")).toMatchObject({capabilities:["model.generate","agentic.run"]});
    expect(f.messages.filter(m=>m.type==="call").map(m=>m.port)).toEqual(["readTaskContext","resolveModelCredential","commitAgenticResult"]);
    expect(f.messages.find(m=>m.type==="call" && m.port==="commitAgenticResult")).toMatchObject({data:result});
    expect(f.generate).not.toHaveBeenCalled();expect(f.runAgentic).toHaveBeenCalledOnce();
    f.worker.receive(run);expect(f.runAgentic).toHaveBeenCalledOnce();f.worker.close();
  });
  it("未装配时不声明能力且等待配置，不请求模型",async()=>{
    const f=agentFixture("missing");f.worker.ready();f.worker.receive(run);
    await vi.waitFor(()=>expect(f.messages.some(m=>m.type==="stopped")).toBe(true));
    expect(f.messages.find(m=>m.type==="ready")).toMatchObject({capabilities:["model.generate"]});
    expect(f.messages.find(m=>m.type==="stopped")).toMatchObject({reason:"waiting_user"});expect(f.runAgentic).not.toHaveBeenCalled();f.worker.close();
  });
  it("运行器确定拒绝保留退避分类",async()=>{
    const f=agentFixture("failure");f.worker.receive(run);
    await vi.waitFor(()=>expect(f.messages.some(m=>m.type==="stopped")).toBe(true));
    expect(f.messages.find(m=>m.type==="call" && m.port==="commitResult")).toMatchObject({data:{outcome:"retry_wait",errorCode:"RATE_LIMIT",retryAfterMs:120000}});f.worker.close();
  });
  it("候选提交回执丢失不二次覆盖，报告unknown",async()=>{
    const f=agentFixture("commitLost");f.worker.receive(run);
    await vi.waitFor(()=>expect(f.messages.some(m=>m.type==="stopped")).toBe(true));
    expect(f.messages.filter(m=>m.type==="call" && m.port==="commitAgenticResult")).toHaveLength(1);
    expect(f.messages.some(m=>m.type==="call" && m.port==="commitResult")).toBe(false);
    expect(f.messages.find(m=>m.type==="stopped")).toMatchObject({reason:"unknown_result"});f.worker.close();
  });
  it("取消传入运行器，晚返回也不提交候选",async()=>{
    const f=agentFixture("cancel");f.worker.receive(run);
    await vi.waitFor(()=>expect(f.runAgentic).toHaveBeenCalledOnce());
    f.worker.receive({version:1,type:"cancel",requestId:"cancel",execution,reason:"cancel"});
    await vi.waitFor(()=>expect(f.messages.some(m=>m.type==="stopped")).toBe(true));
    expect(f.messages.some(m=>m.type==="call" && m.port==="commitAgenticResult")).toBe(false);
    expect(f.messages.find(m=>m.type==="stopped")).toMatchObject({reason:"cancelled"});f.worker.close();
  });
  it("明确无候选失败回执收敛failed，不当未知也不二次提交",async()=>{
    const f=agentFixture("commitFailed");f.worker.receive(run);
    await vi.waitFor(()=>expect(f.messages.some(m=>m.type==="stopped")).toBe(true));
    expect(f.messages.find(m=>m.type==="stopped")).toMatchObject({reason:"failed"});
    expect(f.messages.filter(m=>m.type==="call" && m.port==="commitAgenticResult")).toHaveLength(1);
    expect(f.messages.some(m=>m.type==="call" && m.port==="commitResult")).toBe(false);
    f.worker.receive(run);expect(f.runAgentic).toHaveBeenCalledOnce();f.worker.close();
  });

});

describe("旧版本分镜回执兼容",()=>{
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
it.each([false,true])("旧回执metadata变化可重放，原文篡改=%s则拒绝",async tamper=>{
 const messages:WorkerMessage[]=[];let oldText="";
 const worker=createExecutionWorker({generate:async()=>{throw new Error("不得生成");},generateStructured:async()=>{throw new Error("不得生成");},send(message){messages.push(message);if(message.type==="call"){let data:unknown={};if(message.port==="readTaskContext")data=input();if(message.port==="saveScriptFallback"){const old=JSON.parse((message.data as {text:string}).text);old.modelLabel="旧模型";old.object.pipelineMetadata.storyboardRecovery.reason="voiceover_mismatch";old.validation.errors[0].message="旧提示";if(tamper)old.object.shots[0].口播="伪造";oldText=JSON.stringify(old);data={callId:"old-fallback",text:oldText};}queueMicrotask(()=>worker.receive({version:1,type:"reply",requestId:message.requestId,ok:true,data}));}}});
 worker.receive({version:1,type:"run",requestId:"run-old",execution:{executionTaskId:"e-old",attempt:1,fenceToken:"f"},deadlineAt:Date.now()+60000});
 try{await vi.waitFor(()=>expect(messages.some(m=>m.type==="stopped")).toBe(true));expect(messages.some(m=>m.type==="call" && m.port==="resolveModelCredential")).toBe(false);const commits=messages.filter(m=>m.type==="call" && m.port==="commitResult");if(tamper){expect(messages.find(m=>m.type==="stopped")).toMatchObject({reason:"unknown_result"});expect(commits.some(m=>(m as {data:{outcome:string}}).data.outcome==="succeeded")).toBe(false);}else{expect(commits).toHaveLength(1);expect(commits[0]).toMatchObject({data:{outcome:"succeeded",callId:"old-fallback",text:oldText}});}}finally{worker.close();}
});
});

describe('每日选题Worker专用完成端口',()=>{
 const skillSnapshot={snapshotVersion:1,userId:'u',accountId:'a',resolvedAt:'now',platformPolicyVersion:'1',platformPolicy:'候选',skills:[{skillId:'topic.generate',baseVersion:'1',overlayRevision:null,overlayVersion:null,effective:{methodSystem:'',template:'',tools:[],requiredFacets:[],contextRequirements:[],outputSchema:{type:'object'},completionPolicy:null,completionPolicyAdapter:null}}]};
 function dailyFixture(skipReason?:'quota'|'model_unconfigured',rejectCommit=false){
 const messages:WorkerMessage[]=[];const generateStructured=vi.fn(async()=>({callId:'daily-call',text:'结果'}));
 const worker=createExecutionWorker({generate:async()=>{throw Error('不得普通生成')},generateStructured,send(message){messages.push(message);if(message.type==='call')queueMicrotask(()=>worker.receive({version:1,type:'reply',requestId:message.requestId,ok:!(rejectCommit&&['completeDailyTopicSkip','commitDailyTopicResult'].includes(message.port)),data:message.port==='readTaskContext'?{kind:'model.structured',operationKey:'daily',skillId:'topic.generate',capability:'topic.generate',maxOutputTokens:100,skillSnapshot,facets:{...(skipReason?{}:{__topicGenerate:JSON.stringify({mode:'daily'})}),__dailyTopic:JSON.stringify({jobId:'j',jobRunId:'jr',dayKey:'2026-09-05',dailyLimit:3,preferences:[],rankingNow:'2026-09-05T00:00:00.000Z',...(skipReason?{skipReason,...(skipReason==='quota'?{observedCount:3}:{})}:{})})}}:message.port==='resolveModelCredential'?{apiFormat:'openai_chat',baseUrl:null,model:'m',token:'secret'}:{resultId:'result',aiTaskId:'ai'}}));}});
 return {worker,messages,generateStructured};
 }
 it.each(['quota','model_unconfigured'] as const)('跳过%s在获取凭据前完成，零模型',async(skip)=>{const f=dailyFixture(skip);f.worker.receive(run);await vi.waitFor(()=>expect(f.messages.some(m=>m.type==='stopped')).toBe(true));expect(f.messages.filter(m=>m.type==='call').map(m=>m.port)).toEqual(['readTaskContext','completeDailyTopicSkip']);expect(f.generateStructured).not.toHaveBeenCalled();expect(f.messages.at(-1)).toMatchObject({type:'stopped',reason:'completed'});f.worker.close();});
 it('正常daily只向专用结果端口提交',async()=>{const f=dailyFixture();f.worker.receive(run);await vi.waitFor(()=>expect(f.messages.some(m=>m.type==='stopped')).toBe(true));expect(f.generateStructured).toHaveBeenCalledTimes(1);expect(f.messages.filter(m=>m.type==='call').map(m=>m.port)).toEqual(['readTaskContext','resolveModelCredential','commitDailyTopicResult']);f.worker.close();});
 it.each(['quota',undefined] as const)('每日完成回执丢失不二次覆盖终态 skip=%s',async(skip)=>{const f=dailyFixture(skip,true);f.worker.receive(run);await vi.waitFor(()=>expect(f.messages.some(m=>m.type==='stopped')).toBe(true));expect(f.messages.at(-1)).toMatchObject({type:'stopped',reason:'unknown_result'});expect(f.messages.filter(m=>m.type==='call').map(m=>m.port)).toEqual(skip?['readTaskContext','completeDailyTopicSkip']:['readTaskContext','resolveModelCredential','commitDailyTopicResult']);f.worker.close();});
});

it.each(["executeAgenticTool", "readChatWebReadSession"] as const)("宿主端口%s超过30秒但仍在任务预算内可以完成",async port=>{
 vi.useFakeTimers();
 const messages:WorkerMessage[]=[];
 const worker=createExecutionWorker({generate:vi.fn(),runAgentic:async(_input,_model,signal,call)=>{
  await call(port,{callId:"long-tool"},signal);
  return {actualEngine:"pi",summary:"完成",stopReason:"completed",lastModelCallId:"m",toolCallIds:["long-tool"]};
 },send(message){
  messages.push(message);if(message.type!=="call")return;
  const data=message.port==="readTaskContext"?{kind:"agentic.run",operationKey:"long",taskType:"agentic.research",goal:"研究",systemPrompt:"冻结",capability:"research",maxOutputTokens:100,dryRun:false,tools:[{name:"web.read",version:"1",label:"读取",description:"读取",parameters:{type:"object"},effect:"none"}]}:message.port==="resolveModelCredential"?{apiFormat:"openai_chat",baseUrl:null,model:"test",token:"test"}:message.port==="commitAgenticResult"?{resultId:"r",aiTaskId:"a"}:{};
  setTimeout(()=>worker.receive({version:1,type:"reply",requestId:message.requestId,ok:true,data}),message.port===port?31000:0);
 }});
 try{
  worker.receive({...run,deadlineAt:Date.now()+60000});
  await vi.advanceTimersByTimeAsync(30500);
  expect(messages.some(m=>m.type==="stopped")).toBe(false);
  await vi.advanceTimersByTimeAsync(1000);
  expect(messages.find(m=>m.type==="stopped")).toMatchObject({reason:"completed"});
  expect(messages.filter(m=>m.type==="call" && m.port===port)).toHaveLength(1);
  expect(messages.some(m=>m.type==="call" && m.port==="heartbeat")).toBe(true);
 }finally{worker.close();vi.useRealTimers();}
});
