import type {Db} from "@creatoros/backend";
import type {RequestContext} from "@creatoros/contract";
import type {ProjectsService} from "@creatoros/backend/modules/projects";
import type {AssetsService} from "@creatoros/backend/modules/assets";
import type {MaterialLinksService} from "@creatoros/backend/modules/material-links";
import type {MomentsService} from "@creatoros/backend/modules/moments";
import type {WorkCompositionsService} from "@creatoros/backend/modules/work-compositions";
import {createConversionSourceService,type ConversionSourcePorts} from "../creative-results/conversion-source.service";
import {workSourceOutputContent,workSourceConstraints,type WorkSourcePorts} from "./work-source.service";

/** 所有 builder 必须构造绑定 tx 的实际公共 owner；不得捕获 root db。
 * 雷达 pureSnapshot 是明确待新增的 owner 端口，不能传 getItem 假称只读。
 */
export interface WorkSourceOwnerBuilders {
 readProjectScriptVersion?:(tx:Db)=>WorkSourcePorts["readProjectScriptVersion"];
 projects(tx:Db):Pick<ProjectsService,"getProject">;
 assets(tx:Db):Pick<AssetsService,"getAsset"|"assertAssetFileOwned"|"readDocumentFileSource">;
 materialLinks(tx:Db):Pick<MaterialLinksService,"list">;
 moments(tx:Db):Pick<MomentsService,"get"|"readVersion">;
 compositions(tx:Db):Pick<WorkCompositionsService,"get"|"basisVersion">;
 conversion(tx:Db):ConversionSourcePorts;
 pureIntelligenceSnapshot(tx:Db):{
  readImmutableSnapshot(ctx:RequestContext,itemId:string,snapshotId:string):Promise<{itemId:string;versionId:string;text:string}>;
 };
}
export function createWorkSourcePortsFactory(build:WorkSourceOwnerBuilders):(tx:Db)=>WorkSourcePorts {
 return tx=>{
  const projects=build.projects(tx),assets=build.assets(tx),links=build.materialLinks(tx),moments=build.moments(tx),compositions=build.compositions(tx),conversion=createConversionSourceService(build.conversion(tx));
  const projectLink=async(ctx:RequestContext,projectId:string,assetId:string)=>{
   // SEMANTIC_BOUNDARY_ALLOW: 只核验真实用料关系，不判断素材与主题匹配。
   for(let page=1;;page++){
    const batch=await links.list(ctx,{projectId,page,pageSize:100});
    if(batch.rows.some(link=>link.projectId===projectId&&link.entityType==="asset"&&link.entityId===assetId))return;
    if(page*100>=batch.total)throw Object.assign(new Error("素材未属于该作品项目的真实用料关系"),{code:"SOURCE_ANCHOR_CONFLICT"});
   }
  };
  const normalize=(value:Awaited<ReturnType<typeof conversion.restore>>)=>({...value,content:workSourceOutputContent.parse(value.content),constraints:workSourceConstraints.parse(value.constraints)});
  return {projects,assets,moments,compositions,assertAssetLinkedToProject:projectLink,
   readProjectScriptVersion:build.readProjectScriptVersion?.(tx),
   readIntelligenceSnapshot:(ctx,itemId,snapshotId)=>build.pureIntelligenceSnapshot(tx).readImmutableSnapshot(ctx,itemId,snapshotId),
   ownerProject:async(ctx,kind,id)=>kind==="moments"?(await moments.get(ctx,id)).projectId:(await compositions.get(ctx,id)).projectId,
   conversion:{selectSavedSource:async(ctx,pick)=>normalize(await conversion.selectSavedSource(ctx,pick)),freeze:async(ctx,request)=>normalize(await conversion.freeze(ctx,request)),restore:async(ctx,request,anchor)=>normalize(await conversion.restore(ctx,request,anchor))},
  };
 };
}
