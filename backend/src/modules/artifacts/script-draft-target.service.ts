import type {Db} from "@creatoros/backend";
import type {RequestContext} from "@creatoros/contract";
import {lockOwnedProjectForUpdate} from "../projects";
import {createArtifactsService} from "./artifacts.service";

/** 同项目的任务提交共用项目锁；复用现稿或按原规则创建空白初始版本，不覆盖已有正文。 */
export function createScriptDraftTargetService(deps:{now:()=>string;nextId:(prefix:string)=>string}){
 return {async ensure(tx:Db,ctx:RequestContext,projectId:string){
  await lockOwnedProjectForUpdate(tx,ctx,projectId);
  const service=createArtifactsService({db:tx,...deps});
  const existing=(await service.listProjectArtifacts(ctx,projectId)).find(row=>row.stage==="script" && row.artifactType==="output_script");
  if(existing)return existing.id;
  return (await service.createArtifact(ctx,{projectId,title:"分镜脚本",artifactType:"output_script",stage:"script"})).id;
 }};
}
