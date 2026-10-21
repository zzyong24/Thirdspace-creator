import {createHash} from "node:crypto";
import type {RequestContext} from "@creatoros/contract";
import type {ArtifactsService} from "../../modules/artifacts";
import {ConflictError} from "../../modules/artifacts/artifacts.errors";
import type {ProjectsService} from "../../modules/projects";
import {readArtifactVersionTruth} from "./current-artifact";

export interface ConfirmedProjectScript {projectId:string;artifactId:string;versionId:string;fullText:string;sha256:string}
export interface ConfirmedProjectReviewScript {projectId:string;artifactId:string;versionId:string;text:string}
export interface ConfirmedProjectScriptPorts {
  projectsService:Pick<ProjectsService,"getProject">;
  artifactsService:Pick<ArtifactsService,"listProjectArtifacts"|"listVersions"|"getScriptSections">;
}
type ScriptArtifact=Awaited<ReturnType<ArtifactsService["listProjectArtifacts"]>>[number];
type ScriptVersion=Awaited<ReturnType<ArtifactsService["listVersions"]>>[number];
/** 同一精确快照完成各自只读投影后才重验 current；调用者可注入当前 tx scoped ports。 */
function createConfirmedSnapshotReader(ports:ConfirmedProjectScriptPorts) {
  return async function readSnapshot<T>(ctx:RequestContext,projectId:string,project:(target:ScriptArtifact,current:ScriptVersion)=>Promise<T>|T):Promise<T|null> {
    await ports.projectsService.getProject(ctx,projectId);
    const rows=await ports.artifactsService.listProjectArtifacts(ctx,projectId);
    // SEMANTIC_BOUNDARY_ALLOW: 只按原类型/列表身份与显式预留事实选择，不评价正文。
    const select=async(listed:typeof rows)=>{
      for(const target of ["output_script","master_script"].flatMap(type=>listed.filter(row=>row.artifactType===type && row.currentVersionId && row.currentVersionIsReserved!==true))){
        if(target.projectId!==projectId)throw new ConflictError("当前确认稿版本不可读取");
        const current=(await ports.artifactsService.listVersions(ctx,target.id)).find(row=>row.id===target.currentVersionId && row.artifactId===target.id);
        if(!current)throw new ConflictError("当前确认稿版本不存在");
        if((current.contentData as {purpose?:string}|null)?.purpose==='project_preparation_source')continue;
        return {target,current};
      }
      return null;
    };
    const selected=await select(rows);
    if(!selected){
      if(await select(await ports.artifactsService.listProjectArtifacts(ctx,projectId)))throw new ConflictError("当前确认稿已变化，请重新读取");
      return null;
    }
    const {target,current}=selected;
    const result=await project(target,current);
    // 包括异步结构表读取在内的完整投影完成后，再核精确 current；不混用两次版本。
    const latest=await select(await ports.artifactsService.listProjectArtifacts(ctx,projectId));
    if(latest?.target.id!==target.id || latest.current.id!==current.id)throw new ConflictError("当前确认稿已变化，请重新读取");
    return result;
  };
}
/** 当前稿面/平台/日报/校准保 canonical 全文和原五字段/hash协议。 */
export function createConfirmedProjectScriptReader(ports:ConfirmedProjectScriptPorts) {
  const readSnapshot=createConfirmedSnapshotReader(ports);
  return async function readConfirmedProjectScript(ctx:RequestContext,projectId:string):Promise<ConfirmedProjectScript|null> {
    return readSnapshot(ctx,projectId,async(target,current)=>{
      const truth=await readArtifactVersionTruth(ctx,target,current,ports.artifactsService);
      return {projectId,artifactId:target.id,versionId:current.id,fullText:truth.fullText,sha256:createHash("sha256").update(truth.fullText).digest("hex")};
    });
  };
}
/** 原 review/素材导出保 transcript-string（含显式空）优先、否则 contentText 的原字节。 */
export function createConfirmedProjectReviewScriptReader(ports:ConfirmedProjectScriptPorts) {
  const readSnapshot=createConfirmedSnapshotReader(ports);
  return async function readConfirmedProjectReviewScript(ctx:RequestContext,projectId:string):Promise<ConfirmedProjectReviewScript|null> {
    return readSnapshot(ctx,projectId,(target,current)=>{
      const data=current.contentData as Record<string,unknown>|null|undefined;
      const text=data&&typeof data.transcript==='string'?data.transcript:current.contentText;
      return {projectId,artifactId:target.id,versionId:current.id,text:text?.trim()?text:""};
    });
  };
}
