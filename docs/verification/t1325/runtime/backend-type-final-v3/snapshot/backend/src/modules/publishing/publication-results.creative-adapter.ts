import type {RequestContext} from "@creatoros/contract";
import type {CreativeResultAdapter} from "../creative-results/creative-results.service";
import type {PublicationResultsService} from "./publication-results.service";

const isKind=(value:string):value is "publish_title"|"description"|"publish_tags"=>
  value==="publish_title"||value==="description"||value==="publish_tags";

export function createPublicationCreativeResultAdapter(input:{service:PublicationResultsService;
  probeTextGeneration(ctx:RequestContext,cell:{platform:string|null;outputType:string}):Promise<{
    ready:boolean;reasonCode?:string;lastVerifiedAt?:string}>}):CreativeResultAdapter{
  return {
    owner:"publication",
    async probe(ctx,cell){
      if(!isKind(cell.kind))return {state:"known_unavailable",reasonCode:"ADAPTER_NOT_READY",lastVerifiedAt:null};
      const status=await input.probeTextGeneration(ctx,cell);
      return status.ready?{state:"supported",reasonCode:null,lastVerifiedAt:status.lastVerifiedAt??null}:
        {state:"known_unavailable",reasonCode:status.reasonCode??"ADAPTER_NOT_READY",lastVerifiedAt:status.lastVerifiedAt??null};
    },
    async enqueue(ctx,request){
      if(!isKind(request.kind)||!request.targetPlatform)throw new Error("发布交付项无效");
      const item=await input.service.generate(ctx,{outputId:request.outputId,platform:request.targetPlatform,
        kind:request.kind,clientRequestId:request.clientRequestId,
        sourceItemId:request.sourceItemId,ruleOverrides:request.ruleOverrides});
      return {candidateId:item.candidateId,taskId:item.taskId,baseVersionId:item.baseRevisionId,
        ruleSnapshotRef:((item.ruleSnapshotRef as {versionId?:string}|null)?.versionId)??null,
        sourceRefs:item.sourceRefs as unknown[],
        appliedRules:item.appliedRules as "applied"|"not_applied",status:item.status};
    },
    async read(ctx,candidateId){
      const item=await input.service.candidate(ctx,candidateId);
      return {status:item.status,value:item.value,errorCode:item.status==="failed"?"GENERATION_FAILED":null};
    },
    async adopt(ctx,request){
      if(!isKind(request.kind)||!request.expected||request.expected.owner!=="publication")throw new Error("发布候选目标无效");
      const expected=request.expected.mode==="existing" && typeof request.expected.publicationId==="string" &&
        typeof request.expected.revisionId==="string"?
        {mode:"existing" as const,publicationId:request.expected.publicationId,revisionId:request.expected.revisionId}:
        request.expected.mode==="create" && typeof request.expected.outputId==="string" &&
        typeof request.expected.platform==="string" && request.expected.expectedAbsent===true?
        {mode:"create" as const,outputId:request.expected.outputId,platform:request.expected.platform,expectedAbsent:true as const}:null;
      if(!expected)throw new Error("发布候选基准版本无效");
      if(typeof request.editedValue!=="string"&&!Array.isArray(request.editedValue))throw new Error("发布候选内容无效");
      const receipt=await input.service.adopt(ctx,{candidateId:request.candidateId,kind:request.kind,
        editedValue:request.editedValue as string|string[],expected,clientRequestId:request.clientRequestId});
      return receipt;
    },
  };
}

export function combinePublicationResultAdapters(text:CreativeResultAdapter,cover:CreativeResultAdapter):CreativeResultAdapter{
  return {
    owner:"publication",
    probe:(ctx,cell)=>cell.kind==="publish_cover"?cover.probe(ctx,cell):text.probe(ctx,cell),
    enqueue:(ctx,request)=>request.kind==="publish_cover"?cover.enqueue(ctx,request):text.enqueue(ctx,request),
    async read(ctx,candidateId){
      try{return await cover.read(ctx,candidateId);}
      catch(error){if((error as {code?:string}).code!=="MEDIA_CANDIDATE_NOT_FOUND")throw error;}
      return text.read(ctx,candidateId);
    },
    adopt:(ctx,request)=>request.kind==="publish_cover"?cover.adopt(ctx,request):text.adopt(ctx,request),
    async retryFrozen(ctx,request){
      try{if(cover.retryFrozen)return await cover.retryFrozen(ctx,request);}
      catch(error){if((error as {code?:string}).code!=="MEDIA_CANDIDATE_NOT_FOUND")throw error;}
      if(text.retryFrozen)return text.retryFrozen(ctx,request);
      throw new Error("发布候选不具备冻结上下文重试能力");
    },
  };
}
