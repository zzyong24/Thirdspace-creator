import type {Db} from "@creatoros/backend";
import type {RequestContext} from "@creatoros/contract";
import {lockOwnedProjectForUpdate,createProjectRepository} from "../projects";
import {createArtifactsService} from "./artifacts.service";

/** 同项目的任务提交共用项目锁；复用现稿或按原规则创建空白初始版本，不覆盖已有正文。 */
export function createScriptDraftTargetService(deps:{now:()=>string;nextId:(prefix:string)=>string}){
 return {async ensure(tx:Db,ctx:RequestContext,projectId:string,outputId?:string){
  await lockOwnedProjectForUpdate(tx,ctx,projectId);
  const projects=createProjectRepository(tx);
  if(outputId){
   const output=await projects.getOutput(ctx,outputId);
   if(output.projectId!==projectId || output.contentType!=="video")throw new Error("视频作品与项目不匹配");
  }
  const service=createArtifactsService({db:tx,now:deps.now,nextId:deps.nextId,
   assertProjectOwned:(context,id)=>lockOwnedProjectForUpdate(tx,context,id),
   resolveOutputProjectId:async(c,id)=>(await projects.getOutput(c,id)).projectId});
  const candidates=(await service.listProjectArtifacts(ctx,projectId)).filter(row=>row.stage==="script" && row.artifactType==="output_script" &&
   (outputId ? row.contentOutputId===outputId : !row.contentOutputId));
  for(const existing of candidates){
   const current=(await service.listVersions(ctx,existing.id)).find(version=>version.id===existing.currentVersionId);
   if((current?.contentData as {purpose?:string}|null)?.purpose==='project_preparation_source')continue;
   return existing.id;
  }
  return (await service.createReservedScriptDraftTarget(ctx,{projectId,contentOutputId:outputId??null})).id;
 }};
}
