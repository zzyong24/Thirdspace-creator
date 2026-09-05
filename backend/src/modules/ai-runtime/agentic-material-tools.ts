import {z} from "zod";
import type {RequestContext} from "@creatoros/contract";
import {agenticProposal} from "@creatoros/contract";
import {agenticToolOutcomeSchema,type ExecutionRef} from "@creatoros/contract/execution-worker";
import type {AgenticBackendTool} from "../execution/execution-agentic-tool-ports.service";
import {MATERIAL_TOOL_DEFINITIONS} from "../execution/agentic/adapters/material-adapter";
import type {createAgenticProposalStagingService} from "../ai/agentic-proposal-staging.service";

/** 素材任务的旧引擎与Worker共用工具定义；领域读取和候选暂存仍经后端服务。 */
export function createAgenticMaterialTools(ports:{
 search(ctx:RequestContext,input:{query:string;limit:number;cursor?:string|null},signal:AbortSignal):Promise<{items:Array<{id:string;title:string;kind:string}>;nextCursor?:string|null}>;
 stage(ref:ExecutionRef,input:Parameters<ReturnType<typeof createAgenticProposalStagingService>["stageForExecution"]>[1],signal:AbortSignal):Promise<unknown>;
}){
 const tools:Record<string,AgenticBackendTool>={};
 for(const definition of MATERIAL_TOOL_DEFINITIONS){
  tools[definition.name]={version:definition.version,parameters:definition.parameters,effect:definition.effect,
   async execute(context,input,scope):Promise<z.infer<typeof agenticToolOutcomeSchema>>{
    scope.signal.throwIfAborted();
    if(definition.name==="material.search"){
     const params=MATERIAL_TOOL_DEFINITIONS[0].parameters.parse(input);
     const result=await ports.search(context,params,scope.signal);scope.signal.throwIfAborted();
     return {status:"ok",summary:`搜到 ${result.items.length} 个素材`,evidence:result.items.map(item=>({entityId:item.id,title:item.title})),data:{items:result.items,nextCursor:result.nextCursor ?? null},error:null,continuation:null,sideEffect:"none"};
    }
    const params=MATERIAL_TOOL_DEFINITIONS[1].parameters.parse(input);
    const proposal=agenticProposal.parse(await ports.stage(scope.execution,{kind:"asset.tags",...params,toolCallId:scope.toolCallId,evidenceRefs:params.assetIds},scope.signal));
    if(proposal.kind!=="asset.tags")throw new Error("MATERIAL_PROPOSAL_KIND_MISMATCH");
    return {status:"ok",summary:`已生成 ${proposal.targets.length} 个素材的标签建议，待用户采纳`,evidence:proposal.targets.map(target=>({entityId:target.assetId,version:target.expectedVersion})),data:{proposal},error:null,continuation:null,sideEffect:"proposal"};
   },
  };
 }
 const definitions=MATERIAL_TOOL_DEFINITIONS.map(({parameters,...definition})=>({...definition,parameters:z.record(z.string(),z.json()).parse(z.toJSONSchema(parameters,{target:"draft-7"}))}));
 return {tools,definitions};
}
