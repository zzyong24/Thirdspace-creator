import type {Db} from "@creatoros/backend";
import type {RequestContext} from "@creatoros/contract";
import type {ProjectsService} from "@creatoros/backend/modules/projects";
import type {AssetsService} from "@creatoros/backend/modules/assets";
import type {MaterialLinksService} from "@creatoros/backend/modules/material-links";
import type {MomentsService} from "@creatoros/backend/modules/moments";
import type {WorkCompositionsService} from "@creatoros/backend/modules/work-compositions";
import {createConversionSourceService,type ConversionSourcePorts} from "../creative-results/conversion-source.service";
import {workSourceOutputContent,workSourceConstraints,sourceCanonical,type WorkSourcePorts} from "./work-source.service";

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
  const projects=build.projects(tx),assets=build.assets(tx),links=build.materialLinks(tx),moments=build.moments(tx),compositions=build.compositions(tx),conversionOwners=build.conversion(tx),conversion=createConversionSourceService(conversionOwners);
  const projectLink=async(ctx:RequestContext,projectId:string,assetId:string)=>{
   // SEMANTIC_BOUNDARY_ALLOW: 只核验真实用料关系，不判断素材与主题匹配。
   for(let page=1;;page++){
    const batch=await links.list(ctx,{projectId,page,pageSize:100});
    if(batch.rows.some(link=>link.projectId===projectId&&link.entityType==="asset"&&link.entityId===assetId))return;
    if(page*100>=batch.total)throw Object.assign(new Error("素材未属于该作品项目的真实用料关系"),{code:"SOURCE_ANCHOR_CONFLICT"});
   }
  };
  const normalize=async(ctx:RequestContext,value:Awaited<ReturnType<typeof conversion.restore>>)=>{
   const anchor=value.sourceAnchor;let content=workSourceOutputContent.parse(value.content);
   if(anchor.sourceType==="article"){
    // SEMANTIC_BOUNDARY_ALLOW: 仅从同事务原版本按真实sectionId补回历史格式，不猜正文或标题层级。
    const owner=await conversionOwners.articles.getArticle(ctx,anchor.sourceOutputId),version=await conversionOwners.articles.getVersion(ctx,anchor.sourceOutputId,anchor.versionId);
    if(owner.outputId!==anchor.sourceOutputId||owner.projectId!==value.projectId||owner.artifactId!==anchor.artifactId||version.versionId!==anchor.versionId)throw Object.assign(new Error("文章原版本身份不符"),{code:"SOURCE_ANCHOR_CONFLICT"});
    content={...content,sections:content.sections.map(section=>{
     const originals=version.document.sections.filter(item=>item.sectionId===section.sectionId),original=originals[0];
     if(originals.length!==1||!original||original.heading!==section.heading||original.body!==section.body||sourceCanonical(original.sourceRefs)!==sourceCanonical(section.sourceRefs))throw Object.assign(new Error("所选文章段落与原历史不符"),{code:"SOURCE_ANCHOR_CONFLICT"});
     return {...section,headingLevel:original.headingLevel};
    })};
   }
   return {...value,content:workSourceOutputContent.parse(content),constraints:workSourceConstraints.parse(value.constraints)};
  };
  return {projects,assets,moments,compositions,assertAssetLinkedToProject:projectLink,
   readProjectScriptVersion:build.readProjectScriptVersion?.(tx),
   readIntelligenceSnapshot:(ctx,itemId,snapshotId)=>build.pureIntelligenceSnapshot(tx).readImmutableSnapshot(ctx,itemId,snapshotId),
   ownerProject:async(ctx,kind,id)=>kind==="moments"?(await moments.get(ctx,id)).projectId:(await compositions.get(ctx,id)).projectId,
   conversion:{selectSavedSource:async(ctx,pick)=>normalize(ctx,await conversion.selectSavedSource(ctx,pick)),freeze:async(ctx,request)=>normalize(ctx,await conversion.freeze(ctx,request)),restore:async(ctx,request,anchor)=>normalize(ctx,await conversion.restore(ctx,request,anchor))},
  };
 };
}
