import {workMemberCreateInput,type WorkMemberRef,type WorkOwnerVersion,type RequestContext} from "@creatoros/contract";
import {OwnershipError,type Db} from "@creatoros/backend";
import type {ProjectsService} from "../projects";
import type {ArticlesService} from "../articles";
import type {GraphicPostsService} from "../graphic-posts";
import type {MomentsService} from "../moments";
import type {OutputScriptsService} from "../output-scripts";
import type {ProductionService} from "../production";
type Owners={projects:Pick<ProjectsService,"getProject"|"getOutput"|"createOutput"|"getOutputByCreationRequest">;articles:Pick<ArticlesService,"createOutput"|"getArticle"|"findOutputByCreationRequest">;graphicPosts:Pick<GraphicPostsService,"createOutput"|"getGraphicPost"|"findOutputByCreationRequest">;moments:Pick<MomentsService,"create"|"get"|"findByCreationRequest">;outputScripts:Pick<OutputScriptsService,"getSavedScript">;production:Pick<ProductionService,"getEditor">};
/** 明确四种成员协议分发至原 owner；不判断应该创建哪类表达。 */
export function createWorkMemberPorts(ownersFor:(tx?:Db)=>Owners){
 return{
  async assertProjectOwned(ctx:RequestContext,id:string,tx:Db,forUpdate=false){await ownersFor(tx).projects.getProject(ctx,id,forUpdate);},
  async readMember(ctx:RequestContext,projectId:string,member:WorkMemberRef,tx?:Db):Promise<WorkOwnerVersion>{
   const owners=ownersFor(tx);
   if(member.kind==="moments"){const item=await owners.moments.get(ctx,member.momentsId);if(item.projectId!==projectId)throw new OwnershipError("朋友圈不属于当前项目");return{kind:"artifact",artifactId:item.artifactId,versionId:item.currentVersionId};}
   const output=await owners.projects.getOutput(ctx,member.outputId);if(output.projectId!==projectId||output.contentType!==member.kind)throw new OwnershipError("作品不属于当前项目或表达类型不一致");
   if(member.kind==="article"){const item=await owners.articles.getArticle(ctx,member.outputId);if(item.projectId!==projectId)throw new OwnershipError("文章归属不一致");return{kind:"artifact",artifactId:item.artifactId,versionId:item.currentVersionId};}
   if(member.kind==="image"){const item=await owners.graphicPosts.getGraphicPost(ctx,member.outputId);if(item.projectId!==projectId)throw new OwnershipError("图文归属不一致");return{kind:"artifact",artifactId:item.artifactId,versionId:item.currentVersionId};}
   const script=await owners.outputScripts.getSavedScript(ctx,member.outputId);if(script)return{kind:"artifact",artifactId:script.artifactId,versionId:script.versionId};
   const editor=await owners.production.getEditor(ctx,member.outputId);if(editor.projectId!==projectId)throw new OwnershipError("制作工程归属不一致");return editor.state==="empty"?{kind:"not_saved",outputId:member.outputId}:{kind:"production",outputId:member.outputId,revision:editor.revision};
  },
  async createMember(ctx:RequestContext,projectId:string,raw:unknown,requestId:string):Promise<WorkMemberRef>{
   const input=workMemberCreateInput.parse(raw),owners=ownersFor();
   if(input.kind==="moments"){const item=await owners.moments.create(ctx,{projectId,clientRequestId:requestId,document:input.document});return{kind:"moments",momentsId:item.momentsId};}
   if(input.kind==="article"){const item=await owners.articles.createOutput(ctx,projectId,{title:input.title,targetPlatform:input.targetPlatform??undefined,contentRole:input.contentRole??undefined,clientRequestId:requestId});return{kind:"article",outputId:item.id};}
   if(input.kind==="image"){const item=await owners.graphicPosts.createOutput(ctx,projectId,{title:input.title,targetPlatform:input.targetPlatform??undefined,clientRequestId:requestId});return{kind:"image",outputId:item.id};}
   const item=await owners.projects.createOutput(ctx,projectId,{title:input.title,contentType:"video",targetPlatform:input.targetPlatform??undefined,contentRole:input.contentRole??undefined,clientRequestId:requestId});return{kind:"video",outputId:item.id};
  },
  async findCreatedMember(ctx:RequestContext,projectId:string,raw:unknown,requestId:string,tx?:Db):Promise<WorkMemberRef|null>{
   const input=workMemberCreateInput.parse(raw),owners=ownersFor(tx);
   if(input.kind==="moments"){const item=await owners.moments.findByCreationRequest(ctx,requestId,projectId);return item?{kind:"moments",momentsId:item.momentsId}:null;}
   const item=input.kind==="article"?await owners.articles.findOutputByCreationRequest(ctx,requestId):input.kind==="image"?await owners.graphicPosts.findOutputByCreationRequest(ctx,requestId):await owners.projects.getOutputByCreationRequest(ctx,requestId);
   if(!item)return null;if(item.projectId!==projectId||item.contentType!==input.kind)throw new OwnershipError("原创建回执归属不一致");return{kind:input.kind,outputId:item.id};
  },
 };
}
