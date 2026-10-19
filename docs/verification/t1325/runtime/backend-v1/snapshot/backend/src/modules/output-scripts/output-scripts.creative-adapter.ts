import type {RequestContext} from "@creatoros/contract";
import type {CreativeResultAdapter} from "../creative-results/creative-results.service";
import type {OutputScriptsService} from "./output-scripts.service";

export function createOutputScriptCreativeResultAdapter(input:{service:OutputScriptsService;
  probeScriptGeneration(ctx:RequestContext):Promise<{ready:boolean;reasonCode?:string;lastVerifiedAt?:string}>}):CreativeResultAdapter{
  return {
    owner:"output_script",
    async probe(ctx,cell){
      if(cell.kind!=="script")return {state:"known_unavailable",reasonCode:"ADAPTER_NOT_READY",lastVerifiedAt:null};
      const status=await input.probeScriptGeneration(ctx);
      return status.ready?{state:"supported",reasonCode:null,lastVerifiedAt:status.lastVerifiedAt??null}:
        {state:"known_unavailable",reasonCode:status.reasonCode??"ADAPTER_NOT_READY",lastVerifiedAt:status.lastVerifiedAt??null};
    },
    async enqueue(ctx,request){
      if(request.kind!=="script")throw new Error("视频脚本交付项无效");
      const candidate=await input.service.generate(ctx,{outputId:request.outputId,clientRequestId:request.clientRequestId,
        sourceItemId:request.sourceItemId,ruleOverrides:request.ruleOverrides,conversion:request.conversion});
      return {candidateId:candidate.candidateId,taskId:candidate.taskId,baseVersionId:candidate.baseVersionId,
        sourceRefs:candidate.sourceRefs,ruleSnapshotRef:null,appliedRules:candidate.appliedRules,status:candidate.status};
    },
    async read(ctx,candidateId){
      const candidate=await input.service.read(ctx,candidateId);
      return {status:candidate.status,value:candidate.value,errorCode:candidate.status==="failed"?"GENERATION_FAILED":null};
    },
    async adopt(ctx,request){
      if(request.expected.owner!=="output_script" || typeof request.expected.versionId!=="string" ||
        typeof request.editedValue!=="string")throw new Error("视频脚本候选目标无效");
      const result=await input.service.adopt(ctx,{candidateId:request.candidateId,
        expectedCurrentVersionId:request.expected.versionId,editedValue:request.editedValue,
        clientRequestId:request.clientRequestId});
      return {versionId:result.versionId};
    },
    async retryFrozen(ctx,request){
      return input.service.retryFrozen(ctx,request.candidateId,request.clientRequestId);
    },
  };
}
