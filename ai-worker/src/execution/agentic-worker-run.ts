import { z } from "zod";
import type {Context,StreamFunction} from "@earendil-works/pi-ai";
import {agenticWorkerInputSchema,workerModelSpecSchema,agenticToolReservationSchema,agenticToolOutcomeSchema,type WorkerPort} from "@creatoros/contract/execution-worker";
import {createPiAgenticEngine,createLoopController,type AgenticTool} from "../runtime/agentic";
import {wrapDurablePiStream} from "./durable-pi-stream";
import {runDurableAgenticTool} from "./durable-agentic-tool";
import {GenerationFailure} from "./generation-error";
import type {ResearchToolExecutor} from "./research-worker-tools";

type Call=(port:WorkerPort,data:unknown,signal?:AbortSignal)=>Promise<unknown>;
const checkpointSchema=z.object({revision:z.number().int().nonnegative(),ledgerSequence:z.number().int().nonnegative(),
  messages:z.array(z.object({role:z.enum(["assistant","tool"]),callId:z.string()})),
  uncheckpointedReceipts:z.array(z.object({kind:z.enum(["model","tool"]),callId:z.string(),sequence:z.number().int().positive()})),
  recovery:z.enum(["ready","pending","requires_replay","requires_reconciliation"]),
  acknowledgedBlockedCallIds:z.array(z.string().min(1)).default([]),
  budget:z.object({maxCalls:z.number().int().positive(),maxTokens:z.number().int().positive()})});
/** Rebuild the Pi transcript by replaying durable calls from the initial frozen context. */
export async function runAgenticInWorker(
  rawInput:z.infer<typeof agenticWorkerInputSchema>,rawModel:z.infer<typeof workerModelSpecSchema>,
  parentSignal:AbortSignal,call:Call,onText?:(text:string)=>void,researchTools?:ResearchToolExecutor,
){
  const input=agenticWorkerInputSchema.parse(rawInput);const model=workerModelSpecSchema.parse(rawModel);
  const stop=new AbortController();const signal=AbortSignal.any([parentSignal,stop.signal]);
  signal.throwIfAborted();
  if(!model.authStyle)throw new GenerationFailure("waiting_user","AGENT_AUTH_STYLE_REQUIRED");
  const initial=checkpointSchema.parse(await call("readCheckpoint",{},signal));
  const acknowledgedBlockedCallIds=new Set(initial.acknowledgedBlockedCallIds);
  if(initial.recovery==="requires_reconciliation")throw new GenerationFailure("unknown_result","AGENT_CHECKPOINT_REQUIRES_RECONCILIATION");
  const modelForTool=new Map<string,string>();const toolCallIds=new Set<string>();let lastModelCallId:string|undefined;
  let failure:GenerationFailure|undefined;
  let checkpointTail:Promise<void>=Promise.resolve();
  const checkpoint=()=>{
    checkpointTail=checkpointTail.then(async()=>{
      signal.throwIfAborted();
      const current=checkpointSchema.parse(await call("readCheckpoint",{},signal));
      const messages=[...current.messages];const seen=new Set(messages.map(message=>message.callId));
      for(const receipt of [...current.uncheckpointedReceipts].sort((a,b)=>a.sequence-b.sequence))if(!seen.has(receipt.callId)){
        messages.push({role:receipt.kind==="model"?"assistant":"tool",callId:receipt.callId});seen.add(receipt.callId);
      }
      if(messages.length!==current.messages.length){
        const saved=z.object({revision:z.number().int().positive()}).parse(await call("saveCheckpoint",{expectedRevision:current.revision,expectedLedgerSequence:current.ledgerSequence,messages},signal));
        if(saved.revision!==current.revision+1)throw new GenerationFailure("unknown_result","AGENT_CHECKPOINT_RECEIPT_UNKNOWN");
      }
    }).catch(error=>{
      throw error instanceof GenerationFailure ? error : new GenerationFailure("unknown_result","AGENT_CHECKPOINT_RECEIPT_UNKNOWN");
    });
    return checkpointTail;
  };
  const tools:AgenticTool[]=input.tools.map(tool=>({name:tool.name,label:tool.label,description:tool.description,
    // SDK本地验证不能吞掉非法调用；严格schema在durable stream交给provider，宿主验证与记账。
    effect:tool.effect==="none"?"none":"writeback",parameters:z.json(),jsonParameters:{},
    async execute(_params,options){
      try{
        const toolCallId=options.toolCallId;const modelCallId=toolCallId?modelForTool.get(toolCallId):undefined;
        if(!toolCallId || !modelCallId)throw new GenerationFailure("unknown_result","TOOL_MODEL_RECEIPT_MISSING");
        let reservedCallId:string|undefined;
        const output=await runDurableAgenticTool({modelCallId,toolCallId},{signal,call:async(port,data,portSignal)=>{
          const result=await call(port,data,portSignal);
          if(port==="reserveAgenticTool"){
            const reservation=agenticToolReservationSchema.parse(result);
            if(reservation.toolName!==tool.name)throw new GenerationFailure("unknown_result","TOOL_RECEIPT_MISMATCH");
            reservedCallId=reservation.callId;
          }
          return result;
        },execute:async(toolName,toolInput,executionSignal)=>{
          if(!reservedCallId || toolName!==tool.name)throw new GenerationFailure("unknown_result","TOOL_RECEIPT_MISMATCH");
          if(input.dryRun && tool.effect!=="none")return agenticToolOutcomeSchema.parse({
            status:"ok",summary:`预演：${toolName}，未执行写入`,evidence:[],
            data:{plan:{toolName,input:toolInput}},error:null,continuation:null,sideEffect:"none",
          });
          if(researchTools && ["web.search","web.read","browser.observe","browser.act"].includes(toolName))return researchTools.execute(toolName,toolInput,{callId:reservedCallId,signal:executionSignal});
          return agenticToolOutcomeSchema.parse(await call("executeAgenticTool",{callId:reservedCallId},executionSignal));
        }});
        if(!reservedCallId)throw new GenerationFailure("unknown_result","TOOL_RECEIPT_MISSING");
        toolCallIds.add(reservedCallId);await checkpoint();
        if(!acknowledgedBlockedCallIds.has(reservedCallId)){
          if(output.error?.code==="needs_login" || output.error?.code==="captcha")throw new GenerationFailure("waiting_user",output.error.code==="captcha"?"RESEARCH_CAPTCHA_REQUIRED":"RESEARCH_LOGIN_REQUIRED");
          if(output.status==="blocked" && output.data && typeof output.data==="object" && !Array.isArray(output.data) && output.data.recoveryState==="browser_runtime_unavailable")throw new GenerationFailure("waiting_user","RESEARCH_BROWSER_UNAVAILABLE");
        }
        return {summary:output.summary,data:output,hasEvidence:output.evidence.length>0 || output.sideEffect==="proposal"};
      }catch(error){failure=error instanceof GenerationFailure?error:new GenerationFailure("unknown_result","AGENT_TOOL_RESULT_UNKNOWN");stop.abort();throw failure;}
    },
  }));
  const engine=createPiAgenticEngine({fallback:{name:"unavailable",run:async()=>{throw new GenerationFailure("failed","PI_RUNTIME_UNAVAILABLE");}},
    wrapStream:stream=>wrapDurablePiStream(stream as StreamFunction,{call,signal,maxOutputTokens:input.maxOutputTokens,frozenSystemPrompt:input.systemPrompt,
      frozenTools:input.tools.map(tool=>({name:tool.name,description:tool.description,parameters:tool.parameters})) as Context["tools"],
      onFailure:error=>{failure=error;stop.abort();},
      onSettled:async(callId,receipt)=>{
        lastModelCallId=callId;
        for(const part of receipt.content){
          if(part && typeof part==="object" && !Array.isArray(part) && part.type==="tool-call"){
            const parsed=z.object({toolCallId:z.string(),toolName:z.string()}).parse(part);
            if(!input.tools.some(tool=>tool.name===parsed.toolName))throw new GenerationFailure("unknown_result","TOOL_NOT_IN_FROZEN_SCOPE");
            const prior=modelForTool.get(parsed.toolCallId);if(prior && prior!==callId)throw new GenerationFailure("unknown_result","TOOL_CALL_ID_REUSED");
            modelForTool.set(parsed.toolCallId,callId);
          }
        }
        await checkpoint();
      },
    }),
  });
  const result=await engine.run({goal:input.goal,systemPrompt:input.systemPrompt,tools,
    llm:async()=>{throw new GenerationFailure("failed","UNMANAGED_MODEL_CALL");},
    llmConfig:{...model,authStyle:model.authStyle},
    controller:createLoopController({maxSteps:initial.budget.maxCalls,maxTokens:initial.budget.maxTokens}),
    signal,decideDryRun:()=>input.dryRun,onStep:async text=>{onText?.(text);},
  });
  await checkpointTail;
  if(failure)throw failure;
  parentSignal.throwIfAborted();
  if(result.actualEngine!=="pi" || !lastModelCallId)throw new GenerationFailure("unknown_result","AGENT_MODEL_RECEIPT_MISSING");
  if(result.stopReason==="llm_error")throw new GenerationFailure("unknown_result","AGENT_MODEL_RESULT_UNKNOWN");
  return {summary:result.summary,stopReason:result.stopReason,lastModelCallId,toolCallIds:[...toolCallIds],actualEngine:"pi" as const};
}
