import {z} from "zod";
import {KnowledgeSourceError} from "../ai/agentic-proposal-staging.service";
import {agenticProposal} from "@creatoros/contract";
import {agenticToolOutcomeSchema,type ExecutionRef} from "@creatoros/contract/execution-worker";
import {RESEARCH_TOOL_DEFINITIONS} from "../execution/agentic/adapters/research-adapter";
import type {AgenticBackendTool} from "../execution/agentic-tool-binding";

const webRead=RESEARCH_TOOL_DEFINITIONS[1].parameters.extend({url:z.string().url().max(8192),evidenceRef:z.string().min(1).optional()}).superRefine((value,ctx)=>{
 if((value.offset>0 && !value.snapshotId) || Boolean(value.snapshotId)!==Boolean(value.evidenceRef))ctx.addIssue({code:"custom",path:["evidenceRef"],message:"续读需要同时提供snapshotId与evidenceRef"});
});
const knowledge=RESEARCH_TOOL_DEFINITIONS[2].parameters.extend({evidenceRefs:z.array(z.string().min(1)).min(1).max(100)});
/** 搜索/读取由Worker执行；这里只声明冻结能力与需要持久写入的后端提案端口。 */
export function createAgenticResearchTools(ports:{stage(ref:ExecutionRef,input:{kind:"knowledge.create";title:string;note:string;sourceNote:string;evidenceRefs:string[];toolCallId:string},signal:AbortSignal):Promise<unknown>}){
 const definitions=RESEARCH_TOOL_DEFINITIONS.map((definition,index)=>({...definition,version:"2",
  parameters:index===1?webRead:index===2?knowledge:definition.parameters,
  description:definition.description+(index===1?" 续读同时保留evidenceRef；使用已有快照时不得重新抓取。":index===2?" evidenceRefs必须填写实际web.read返回的证据ID，不要填写URL代替。":""),
 }));
 const tools:Record<string,AgenticBackendTool>=Object.fromEntries(definitions.map(definition=>[definition.name,{version:definition.version,parameters:definition.parameters,effect:definition.effect}]));
 tools["knowledge.write"]!.execute=async(_context,input,scope)=>{
  const params=knowledge.parse(input);scope.signal.throwIfAborted();
  let proposal;
  try{proposal=agenticProposal.parse(await ports.stage(scope.execution,{kind:"knowledge.create",...params,toolCallId:scope.toolCallId},scope.signal));}
  catch(error){
   if(!(error instanceof KnowledgeSourceError))throw error;
   return agenticToolOutcomeSchema.parse({status:"error",summary:"知识候选来源未通过核验，本次未保存候选",evidence:[],error:{code:"invalid_input",retryable:false,recovery:"请使用本任务web.read已返回的evidenceRef，并将sourceNote填写为该证据的sourceUrl，再发起新的知识候选调用。"},continuation:null,sideEffect:"none"});
  }
  return agenticToolOutcomeSchema.parse({status:"ok",summary:`已生成知识候选「${params.title}」，等待采纳`,evidence:params.evidenceRefs.map(entityId=>({entityId,sourceUrl:params.sourceNote})),data:{proposal},error:null,continuation:null,sideEffect:"proposal"});
 };
 return {tools,definitions:definitions.map(({parameters,...definition})=>({...definition,parameters:z.record(z.string(),z.json()).parse(z.toJSONSchema(parameters,{target:"draft-7"}))}))};
}
