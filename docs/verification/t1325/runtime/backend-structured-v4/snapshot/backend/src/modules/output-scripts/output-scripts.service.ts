import {isDeepStrictEqual} from "node:util";
import {createHash} from "node:crypto";
import {outputConversionContext,outputConversionSourceAnchor,type OutputConversionContext,type OutputConversionSourceAnchor,type RequestContext} from "@creatoros/contract";
import type {FrozenConversionSource} from "../creative-results/conversion-source.service";
import type {ProjectsService} from "../projects";
import type {ArtifactsService} from "../artifacts/artifacts.service";

type Status="queued"|"running"|"succeeded"|"failed"|"cancelled";
type Task={id:string;taskType:string;executionTaskId?:string|null;status:string;projectId:string|null;inputData:Record<string,unknown>;
  results:Array<{resultType:string;artifactId:string|null;resultData:Record<string,unknown>}>};
function fail(code:string,message:string):never{const e=new Error(message) as Error&{code:string};e.code=code;throw e;}
function digest(value:unknown){return createHash("sha256").update(JSON.stringify(value)).digest("hex");}
function digestText(value:string){return createHash("sha256").update(value).digest("hex");}

export interface OutputScriptPorts{
  resumeGeneration?: (ctx:RequestContext,input:{taskId:string;clientRequestId:string})=>Promise<{id:string}>;
  resolveConversionSource?: (ctx:RequestContext,input:OutputConversionContext)=>Promise<FrozenConversionSource>;
  findGenerationByAttempt?: (ctx:RequestContext,attemptId:string)=>Promise<{id:string;inputData:Record<string,unknown>}|null>;
  assertOutputVersionSource?: (ctx:RequestContext,ref:OutputConversionSourceAnchor,projectId:string)=>Promise<void>;
  projects:Pick<ProjectsService,"getOutput"|"getProject">;
  artifacts:Pick<ArtifactsService,"listProjectArtifacts"|"getArtifact"|"listVersions"|"createVersion"|"getVersionByAdoptionReceipt">;
  submitScriptDraft(ctx:RequestContext,input:{projectId:string;outputId:string;attemptId:string;topic:string;extraBrief?:string;
    instruction?:string;conversion?:OutputConversionContext;conversionConstraints?:FrozenConversionSource["constraints"];sourceSnapshots?:Array<{sourceType:"project_text";sourceId:string;label:string;order:0;
      charCount:number;sha256:string;body:string;complete:true}>}):Promise<{id:string}>;
  readTask(ctx:RequestContext,taskId:string):Promise<Task>;
  /** Must return an owned, complete video transcript, never an article excerpt or title fallback. */
  resolveVideoSource?: (ctx:RequestContext,sourceItemId:string)=>Promise<{id:string;versionId:string;label:string;transcript:string}|null>;
  readTaskRuntimeData?: (ctx:RequestContext,taskId:string)=>Promise<Record<string,unknown>>;
  retryScriptDraft?: (ctx:RequestContext,input:{attemptId:string;retryOfTaskId:string;
    inputData:Record<string,unknown>})=>Promise<{id:string}>;
}

/** Output-scoped script candidates reuse the real script.draft worker, with owner-side CAS adoption. */
export function createOutputScriptsService(deps:OutputScriptPorts){
  async function read(ctx:RequestContext,taskId:string){
    const task=await deps.readTask(ctx,taskId);
    if(task.taskType!=="script.draft" || typeof task.inputData.outputId!=="string")fail("OUTPUT_NOT_OWNED","作品脚本候选不存在");
    const outputId=task.inputData.outputId;
    const output=await deps.projects.getOutput(ctx,outputId);
    if(output.contentType!=="video" || output.projectId!==task.projectId || task.inputData.projectId!==output.projectId)
      fail("OUTPUT_NOT_OWNED","作品脚本候选归属不一致");
    const artifactId=task.inputData.artifactId;
    const baseVersionId=task.inputData.baseVersionId;
    if(typeof artifactId!=="string" || typeof baseVersionId!=="string")fail("CANDIDATE_NOT_READY","作品脚本候选锚点无效");
    const artifact=await deps.artifacts.getArtifact(ctx,artifactId);
    if(artifact.projectId!==output.projectId || artifact.contentOutputId!==outputId || artifact.artifactType!=="output_script")
      fail("OUTPUT_NOT_OWNED","作品脚本稿锚点不一致");
    if(!(await deps.artifacts.listVersions(ctx,artifactId)).some(version=>version.id===baseVersionId))
      fail("CANDIDATE_NOT_READY","作品脚本候选基准版本不存在");
    const result=task.results.find(row=>row.resultType==="artifact_version" && row.artifactId===artifactId);
    const status:Status=task.status==="awaiting_confirmation" && result?"succeeded":
      (["queued","running","failed","cancelled"].includes(task.status)?task.status as Status:"failed");
    const value=status==="succeeded" && typeof result?.resultData.body==="string"?result.resultData.body:null;
    const sourceSnapshots=Array.isArray(task.inputData.sourceSnapshots)?task.inputData.sourceSnapshots:[];
    const conversion=task.inputData.conversion;
    const conversionRef=conversion && typeof conversion==="object" && !Array.isArray(conversion)
      ? outputConversionSourceAnchor.parse((conversion as {sourceAnchor?:unknown}).sourceAnchor):null;
    if(conversionRef){
      if(!deps.assertOutputVersionSource)fail("SOURCE_UNAVAILABLE","当前无法核验转换作品来源");
      await deps.assertOutputVersionSource(ctx,conversionRef,output.projectId);
    }
    const sourceRefs=conversionRef?[conversionRef]:sourceSnapshots.map(source=>{
      const row=source as Record<string,unknown>;
      return {kind:"intelligence_video_transcript",id:String(row.sourceId??""),sha256:String(row.sha256??"")};
    });
    return {candidateId:taskId,outputId,artifactId,baseVersionId,status:value===null && status==="succeeded"?"failed" as const:status,
      value,sourceRefs,ruleSnapshotRef:null,appliedRules:"not_applied" as const,result};
  }
  return {
    read,
    /** 通过作品 owner 读保存稿；历史版本不可变，不借项目首稿或任务候选。 */
    async getSavedScript(ctx:RequestContext,outputId:string,versionId?:string){
      const output=await deps.projects.getOutput(ctx,outputId);
      if(output.contentType!=="video")fail("UNSUPPORTED_OUTPUT_TYPE","当前作品不是视频");
      const matches=(await deps.artifacts.listProjectArtifacts(ctx,output.projectId)).filter(artifact=>
        artifact.contentOutputId===outputId && artifact.artifactType==="output_script");
      if(matches.length===0)return null;
      if(matches.length!==1)fail("SOURCE_ANCHOR_CONFLICT","该视频作品存在多个脚本稿锚点，请先明确来源");
      const artifact=await deps.artifacts.getArtifact(ctx,matches[0]!.id);
      if(artifact.projectId!==output.projectId || artifact.contentOutputId!==outputId || artifact.artifactType!=="output_script")
        fail("OUTPUT_NOT_OWNED","视频作品脚本归属不一致");
      const requestedVersionId=versionId??artifact.currentVersionId;
      const version=(await deps.artifacts.listVersions(ctx,artifact.id)).find(row=>row.id===requestedVersionId);
      if(!version || version.artifactId!==artifact.id)fail("SOURCE_VERSION_UNAVAILABLE","视频作品的保存版本不存在");
      return {outputId:output.id,projectId:output.projectId,artifactId:artifact.id,currentVersionId:artifact.currentVersionId,
        versionId:version.id,contentText:version.contentText??"",contentData:structuredClone(version.contentData)};
    },
    async generate(ctx:RequestContext,input:{outputId:string;clientRequestId:string;sourceItemId?:string;ruleOverrides?:Record<string,unknown>;conversion?:OutputConversionContext}){
      if(Object.keys(input.ruleOverrides??{}).length)fail("CAPABILITY_UNAVAILABLE","视频脚本暂不支持本次规则输入");
      const output=await deps.projects.getOutput(ctx,input.outputId);
      if(output.contentType!=="video")fail("UNSUPPORTED_OUTPUT_TYPE","当前作品不是视频");
      if(input.conversion){
        const conversion=outputConversionContext.parse(input.conversion);
        if(conversion.request.targetType!=="video" || input.sourceItemId || Object.keys(input.ruleOverrides??{}).length)
          fail("UNSUPPORTED_CONVERSION","转换请求不能混入其他来源或未支持规则");
        if(!deps.findGenerationByAttempt || !deps.resolveConversionSource)fail("SOURCE_UNAVAILABLE","转换生成端口尚不可用");
        const check=(task:{id:string;inputData:Record<string,unknown>})=>{
          if(task.inputData.outputId!==output.id || !isDeepStrictEqual(task.inputData.conversion,conversion))
            fail("IDEMPOTENCY_CONFLICT","同请求已对应另一转换意图");
          return read(ctx,task.id);
        };
        const prior=await deps.findGenerationByAttempt(ctx,input.clientRequestId);
        if(prior)return {taskId:prior.id,...await check(prior)};
        const targetPlatform=output.targetPlatform??null;
        if((targetPlatform!==null && !["douyin","kuaishou","xiaohongshu"].includes(targetPlatform)) ||
           (conversion.request.targetPlatform!==undefined && conversion.request.targetPlatform!==targetPlatform))
          fail("TARGET_PLATFORM_MISMATCH","转换目标平台与视频作品不一致");
        const frozen=await deps.resolveConversionSource(ctx,conversion);
        if(frozen.projectId!==output.projectId || !isDeepStrictEqual(frozen.sourceAnchor,conversion.sourceAnchor))
          fail("SOURCE_UNAVAILABLE","转换来源不属于当前作品项目");
        const body=JSON.stringify(frozen.content);
        if(body.length>200000)fail("SOURCE_UNAVAILABLE","转换来源过长，请缩减选区");
        const instruction="请仅依据以下冻结来源创作视频脚本，不得推断未提供事实；不得将脚本宣称为已生成视频。事实及引用约束："+JSON.stringify(frozen.constraints);
        let task:{id:string};
        try{task=await deps.submitScriptDraft(ctx,{projectId:output.projectId,outputId:output.id,attemptId:input.clientRequestId,
          topic:output.title??"视频脚本",instruction,conversion:structuredClone(conversion),conversionConstraints:structuredClone(frozen.constraints),
          sourceSnapshots:[{sourceType:"project_text",sourceId:`${frozen.sourceAnchor.artifactId}:${frozen.sourceAnchor.versionId}:${frozen.sourceAnchor.selectionDigest}`,
            label:"已保存作品的选定内容",order:0,charCount:body.length,sha256:digestText(body),body,complete:true}]});}
        catch(error){const winner=await deps.findGenerationByAttempt(ctx,input.clientRequestId);if(winner)return {taskId:winner.id,...await check(winner)};throw error;}
        const saved=await deps.readTask(ctx,task.id);return {taskId:task.id,...await check(saved)};
      }
      const project=await deps.projects.getProject(ctx,output.projectId);
      let sourceSnapshots:Parameters<OutputScriptPorts["submitScriptDraft"]>[1]["sourceSnapshots"];
      if(input.sourceItemId){
        if(!deps.resolveVideoSource)fail("SOURCE_UNAVAILABLE","当前无法读取视频逐字稿");
        const source=await deps.resolveVideoSource(ctx,input.sourceItemId);
        if(!source || source.id!==input.sourceItemId || !source.transcript.trim())
          fail("SOURCE_UNAVAILABLE","所选视频逐字稿尚不可用");
        const body=source.transcript;
        if(body.length>200_000)fail("SOURCE_UNAVAILABLE","视频逐字稿过长，请先缩减来源");
        sourceSnapshots=[{sourceType:"project_text",sourceId:`${source.id}@${source.versionId}`,label:source.label,
          order:0,charCount:body.length,sha256:digestText(body),body,complete:true}];
      }
      const task=await deps.submitScriptDraft(ctx,{projectId:project.id,outputId:output.id,attemptId:input.clientRequestId,
        topic:output.title?.trim()||project.title,...(project.brief?.trim()?{extraBrief:project.brief.trim()}:{}),
        ...(sourceSnapshots?{sourceSnapshots,
          instruction:"请根据这份完整视频逐字稿创作当前作品的视频脚本；不得推断未提供的内容。"}:{})});
      const candidate=await read(ctx,task.id);
      if(candidate.outputId!==input.outputId)fail("IDEMPOTENCY_CONFLICT","生成请求已用于其他作品");
      return {taskId:task.id,...candidate};
    },
    async adopt(ctx:RequestContext,input:{candidateId:string;expectedCurrentVersionId:string;editedValue:string;clientRequestId:string}){
      const candidate=await read(ctx,input.candidateId);
      if(candidate.status!=="succeeded" || !candidate.result)fail("CANDIDATE_NOT_READY","视频脚本候选尚不可采纳");
      if(input.expectedCurrentVersionId!==candidate.baseVersionId)fail("VERSION_CONFLICT","视频脚本候选基准版本已变化");
      const adoptionKey=`output-script:${input.clientRequestId}`;
      const sourceDigest=`sha256:${digest({candidateId:input.candidateId,expectedCurrentVersionId:input.expectedCurrentVersionId,editedValue:input.editedValue})}`;
      const receipt=await deps.artifacts.getVersionByAdoptionReceipt(ctx,candidate.artifactId,adoptionKey,sourceDigest,input.candidateId);
      if(receipt)return {versionId:receipt.id};
      const artifact=await deps.artifacts.getArtifact(ctx,candidate.artifactId);
      if(artifact.currentVersionId!==input.expectedCurrentVersionId)fail("VERSION_CONFLICT","视频脚本已被其他版本更新");
      const unchanged=input.editedValue===candidate.value;
      const raw=unchanged?candidate.result.resultData.contentData:null;
      const baseData=raw && typeof raw==="object" && !Array.isArray(raw)?raw as Record<string,unknown>:undefined;
      const refs=candidate.sourceRefs.filter(ref=>ref.kind==="output_version");
      const contentData=refs.length?{...baseData,sourceRefs:refs}:baseData;
      const version=await deps.artifacts.createVersion(ctx,candidate.artifactId,{expectedCurrentVersionId:input.expectedCurrentVersionId,
        contentText:input.editedValue,...(contentData?{contentData}:{}),changeSummary:"采纳作品视频脚本候选",
        createdByType:"ai",aiTaskId:input.candidateId,adoptionKey,adoptionSourceDigest:sourceDigest});
      return {versionId:version.id};
    },
    async retryFrozen(ctx:RequestContext,candidateId:string,clientRequestId:string){
      const prior=await read(ctx,candidateId),original=await deps.readTask(ctx,candidateId);
      if(original.executionTaskId){
        if(!deps.resumeGeneration)fail("CAPABILITY_UNAVAILABLE","原脚本持久执行恢复端口尚未接通");
        const resumed=await deps.resumeGeneration(ctx,{taskId:candidateId,clientRequestId});
        if(resumed.id!==candidateId)fail("SOURCE_UNAVAILABLE","原脚本恢复不能复制任务");
        const next=await read(ctx,candidateId);
        if(next.outputId!==prior.outputId||next.artifactId!==prior.artifactId||next.baseVersionId!==prior.baseVersionId||!isDeepStrictEqual(next.sourceRefs,prior.sourceRefs))fail("SOURCE_UNAVAILABLE","原脚本恢复来源或基准变化");
        return {taskId:candidateId,...next};
      }
      if(prior.status!=="failed" && prior.status!=="cancelled")fail("CANDIDATE_NOT_READY","只有失败或取消的视频脚本任务可以重试");
      if(!deps.readTaskRuntimeData || !deps.retryScriptDraft)fail("CAPABILITY_UNAVAILABLE","RETRY_CONTEXT_NOT_FROZEN");
      const runtime=await deps.readTaskRuntimeData(ctx,candidateId);
      const checkpoint=runtime.scriptDraftCheckpoint;
      if(!checkpoint || typeof checkpoint!=="object" || Array.isArray(checkpoint) ||
        !["voiceover_failed","voiceover_complete"].includes(String((checkpoint as {stage?:unknown}).stage)))
        fail("SOURCE_UNAVAILABLE","原视频脚本任务没有可验证的完整恢复断点");
      const artifact=await deps.artifacts.getArtifact(ctx,prior.artifactId);
      if(artifact.currentVersionId!==prior.baseVersionId)fail("VERSION_CONFLICT","原视频脚本基准稿已变化");
      const oldTask=await deps.readTask(ctx,candidateId);
      const task=await deps.retryScriptDraft(ctx,{attemptId:clientRequestId,retryOfTaskId:candidateId,
        inputData:structuredClone(oldTask.inputData)});
      const fresh=await read(ctx,task.id);
      if(fresh.outputId!==prior.outputId || fresh.baseVersionId!==prior.baseVersionId ||
        digest(fresh.sourceRefs)!==digest(prior.sourceRefs))fail("SOURCE_UNAVAILABLE","重试任务未保留原上下文");
      return {taskId:task.id,candidateId:task.id,status:fresh.status,baseVersionId:fresh.baseVersionId,
        sourceRefs:fresh.sourceRefs,ruleSnapshotRef:null,appliedRules:fresh.appliedRules};
    },
  };
}
export type OutputScriptsService=ReturnType<typeof createOutputScriptsService>;
