import {createConfirmedProjectScriptReader} from "./context/confirmed-project-script";
import { extractArtifactText } from "./context/current-artifact";
import { ErrorCode, projectScriptSourceRef,scriptMetadataSource, type ProjectScriptSourceRef,type ProjectScriptContext,type ScriptMetadataSource,type ProjectImageSource, type RequestContext } from "@creatoros/contract";
import type { ProjectsService } from "../modules/projects";
import type { PublishingService } from "../modules/publishing";
import type { AssetsService } from "../modules/assets";
import type { ArtifactsService } from "../modules/artifacts";

import type { SavedProjectScript } from "../modules/projects/project-script-source.port";
const types = ["output_script", "master_script", "content_outline"] as const;
const unavailable = (message: string): never => {throw Object.assign(new Error(message), {code: ErrorCode.OwnershipError});};

/** 应用装配只经原 projects/artifacts 属主端口读取，未创建新的主稿实体。 */
export function createProjectScriptSource(ports: {
  projects: Pick<ProjectsService, "getProject"> & Partial<Pick<ProjectsService,"getOutput"|"listOutputIdsByProject">>;
  publishing?:Pick<PublishingService,"listPublications"|"listRevisions"|"getPublication">;
  assets?:Pick<AssetsService,"listAssets"|"listFilesByIds"|"assertAssetFileOwned"|"getAssetFileDownloadUrl">;
  artifacts: Pick<ArtifactsService, "listProjectArtifacts" | "getArtifact" | "listVersions" | "getScriptSections">;
}) {
  async function ownedVersion(ctx: RequestContext, projectId: string, artifactId: string, versionId: string) {
    const artifact = await ports.artifacts.getArtifact(ctx, artifactId);
    if (artifact.projectId !== projectId || artifact.stage !== "script" || !types.includes(artifact.artifactType as typeof types[number]))
      unavailable("脚本来源不属于当前项目，或不是可用的脚本与大纲。");
    const version = (await ports.artifacts.listVersions(ctx, artifact.id)).find(row => row.id === versionId);
    if (!version) return unavailable("脚本来源的保存版本不存在，请重新读取脚本。");
    return {artifact, version};
  }
  const source = {
    async read(ctx: RequestContext, projectId: string): Promise<SavedProjectScript | null> {
      await ports.projects.getProject(ctx, projectId);
      const confirmed=await createConfirmedProjectScriptReader({projectsService:ports.projects,artifactsService:ports.artifacts})(ctx,projectId);
      if(confirmed!==null)return {ref:{kind:"project_script",id:confirmed.artifactId,versionId:confirmed.versionId},label:"已保存的主脚本",text:confirmed.fullText};
      // SEMANTIC_BOUNDARY_ALLOW: 只有没有确认稿才沿原列表读取大纲；正式空稿禁止回灌。
      const listed=(await ports.artifacts.listProjectArtifacts(ctx,projectId)).filter(row=>row.stage==="script" && row.artifactType==="content_outline");
      for(const candidate of listed){
        if(!candidate.currentVersionId)return unavailable("主脚本的保存版本暂不可读取，请重新保存脚本。");
        const {version}=await ownedVersion(ctx,projectId,candidate.id,candidate.currentVersionId);
        const text=extractArtifactText(version.contentText,version.contentData);
        if(text)return {ref:{kind:"project_script",id:candidate.id,versionId:version.id},label:"已保存的项目大纲",text};
      }
      return null;
    },
    async readVersion(ctx: RequestContext, input: ProjectScriptSourceRef, projectId: string): Promise<SavedProjectScript> {
      const ref = projectScriptSourceRef.parse(input);
      await ports.projects.getProject(ctx, projectId);
      const {artifact,version} = await ownedVersion(ctx, projectId, ref.id, ref.versionId);
      return {ref,label:artifact.artifactType === "content_outline" ? "已保存的项目大纲" : "已保存的主脚本",text:extractArtifactText(version.contentText,version.contentData)};
    },
    async readContext(ctx:RequestContext,projectId:string):Promise<ProjectScriptContext>{
      const project=await ports.projects.getProject(ctx,projectId);
      let result:ProjectScriptContext={state:"empty",scriptRef:null,scriptText:"",metadata:{title:project.title,summary:project.brief,tags:[]},metadataSource:{kind:"project",projectId,updatedAt:project.updatedAt}};
      let scriptFailed=false;
      try{const script=await source.read(ctx,projectId);if(script)result={...result,state:"ready",scriptRef:script.ref,scriptText:script.text};}
      catch{scriptFailed=true;result={...result,state:"unavailable",message:"主脚本暂不可读取，当前稿件已保留。"};}
      if(!ports.publishing||!ports.projects.getOutput||!ports.projects.listOutputIdsByProject)return result;
      try{
        const artifact=result.scriptRef?await ports.artifacts.getArtifact(ctx,result.scriptRef.id):null;
        let outputId:string|null=null;
        if(artifact?.contentOutputId){
          const output=await ports.projects.getOutput(ctx,artifact.contentOutputId);
          if(output.projectId!==projectId||output.contentType!=="video")throw Error("主稿发布物料挂点不符");
          outputId=output.id;
        }else{
          // SEMANTIC_BOUNDARY_ALLOW: 与原脚本页 readPublishPack 的列表顺序/首 video 身份一致；不按名称或内容选稿。
          for(const id of await ports.projects.listOutputIdsByProject(ctx,projectId)){
            const output=await ports.projects.getOutput(ctx,id);
            if(output.projectId===projectId&&output.contentType==="video"){outputId=id;break;}
          }
        }
        if(!outputId)return result;
        const publications=await ports.publishing.listPublications(ctx,outputId,{limit:10,offset:0});
        let metadataReadFailed=false;
        const packages=await Promise.all(publications.map(async publication=>{
          if(publication.contentOutputId!==outputId)throw Error("发布物料归属不符");
          try{
            const revisions=await ports.publishing!.listRevisions(ctx,publication.id,{limit:20,offset:0});
            const revision=revisions.find(row=>row.id===publication.currentRevisionId)??revisions[0]??null;
            return {publication,revision};
          }catch{metadataReadFailed=true;return {publication,revision:null};}
        }));
        // SEMANTIC_BOUNDARY_ALLOW: 复用脚本页既有“当前revision含简介或标签优先”物料身份规则，不评价文本质量。
        const selected=packages.find(row=>Boolean(row.revision?.description?.trim()||(Array.isArray(row.revision?.platformTags)?row.revision.platformTags.length:0)))??packages[0];
        if(!selected?.revision)return metadataReadFailed?{...result,state:"unavailable",message:"脚本发布物料暂不可读取，当前稿件与主脚本正文已保留。"}:result;
        const {publication,revision}=selected;
        if(revision.publicationId!==publication.id)throw Error("发布物料版本归属不符");
        return {...result,state:scriptFailed?"unavailable":result.state,
          metadata:{title:revision.title?.trim()??"",summary:revision.description?.replace(/\s+/gu," ").trim()??"",tags:Array.isArray(revision.platformTags)?revision.platformTags.filter((value):value is string=>typeof value==="string"):[]},
          metadataSource:{kind:"publication_revision",projectId,sourceOutputId:outputId,publicationId:publication.id,revisionId:revision.id},
          ...(metadataReadFailed?{message:"部分发布物料暂不可读取，已复用可读版本，当前稿件已保留。"}:{})};
      }catch{return {...result,state:"unavailable",message:"脚本发布物料暂不可读取，当前稿件与主脚本正文已保留。"};}
    },
    async assertMetadata(ctx:RequestContext,input:ScriptMetadataSource,projectId:string):Promise<void>{
      const ref=scriptMetadataSource.parse(input);
      const project=await ports.projects.getProject(ctx,projectId);
      if(ref.projectId!==projectId)return unavailable("元数据来源不属于当前项目。");
      if(ref.kind==="project"){
        if(ref.updatedAt!==project.updatedAt)throw Object.assign(Error("项目元数据已变化，请重新读取来源。"),{code:ErrorCode.ConflictError});
        return;
      }
      if(!ports.publishing||!ports.projects.getOutput)return unavailable("当前无法核验发布物料出处。");
      const output=await ports.projects.getOutput(ctx,ref.sourceOutputId);
      if(output.projectId!==projectId||output.contentType!=="video")return unavailable("元数据不是本项目主稿的视频发布物料。");
      const publication=await ports.publishing.getPublication(ctx,ref.publicationId);
      if(publication.contentOutputId!==output.id)return unavailable("发布物料不属于来源作品。");
      // 历史revision也是不可变事实；翻页核验，不能把新的current偷换成旧引用。
      for(let offset=0;;offset+=100){
        const rows=await ports.publishing.listRevisions(ctx,publication.id,{limit:100,offset});
        if(rows.some(row=>row.id===ref.revisionId&&row.publicationId===publication.id))return;
        if(rows.length<100)return unavailable("发布物料的来源版本已不存在。");
      }
    },
    async readImages(ctx:RequestContext,projectId:string):Promise<{state:"ready"|"empty"|"unavailable";images:ProjectImageSource[];message?:string}>{
      await ports.projects.getProject(ctx,projectId);
      if(!ports.assets)return {state:"unavailable",images:[],message:"图片目录暂不可读取，正文仍可生成。"};
      try{
        const rows=(await ports.assets.listAssets(ctx,{limit:500,cursor:null})).filter(row=>row.assetType==="image"&&row.status==="active"&&row.currentFileId);
        const files=await ports.assets.listFilesByIds(ctx,rows.map(row=>row.currentFileId!));
        const images:ProjectImageSource[]=[];let skipped=0;
        for(const row of rows){
          const file=files.find(file=>file.id===row.currentFileId&&file.assetId===row.id);
          if(!file){skipped++;continue;}
          try{
            await ports.assets.assertAssetFileOwned(ctx,row.id,file.id,true);
            // 属主公开服务检查冻结的 exact 文件可读性；只丢弃签名结果，不泄漏 URL。
            await ports.assets.getAssetFileDownloadUrl(ctx,row.id,file.id);
            const data=file.mediaMetadata&&typeof file.mediaMetadata==="object"?file.mediaMetadata as Record<string,unknown>:{};
            const description=[row.description,typeof data.aiDescription==="string"?data.aiDescription:""].filter(Boolean).join("\n").slice(0,4000);
            images.push({assetId:row.id,assetFileId:file.id,name:row.name,description});
          }catch{skipped++;}
        }
        return {state:images.length?"ready":"empty",images,...(skipped?{message:"部分图片暂不可读取，已跳过；正文仍可生成。"}:{})};
      }catch{return {state:"unavailable",images:[],message:"图片目录暂不可读取，正文仍可生成。"};}
    },
    async assertImage(ctx:RequestContext,assetId:string,assetFileId:string,projectId:string):Promise<void>{
      await ports.projects.getProject(ctx,projectId);
      if(!ports.assets)return unavailable("匹配图片暂不可核验。");
      await ports.assets.assertAssetFileOwned(ctx,assetId,assetFileId,true);
      // SEMANTIC_BOUNDARY_ALLOW: 核验候选明确选择的实际文件与字节，绝不重绑 asset.currentFileId。
      await ports.assets.getAssetFileDownloadUrl(ctx,assetId,assetFileId);
    },
    async assert(ctx: RequestContext, input: ProjectScriptSourceRef, projectId: string): Promise<void> {
      const ref = projectScriptSourceRef.parse(input);
      await ports.projects.getProject(ctx, projectId);
      await ownedVersion(ctx, projectId, ref.id, ref.versionId);
    },
  };
  return source;
}
