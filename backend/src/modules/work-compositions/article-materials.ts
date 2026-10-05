import {ErrorCode,type RequestContext,type WorkMemberRef,type WorkMaterialTarget} from "@creatoros/contract";
import {OwnershipError,type Db} from "@creatoros/backend";
import type {ArticlesService} from "../articles";
import {createWorkMaterialsService} from "./work-materials.service";
type Ports=Parameters<typeof createWorkMaterialsService>[0]["ports"];
export function createArticleMaterialPorts(ownerFor:(tx:Db)=>Pick<ArticlesService,"getArticle"|"createVersion"|"saveReceipt">):Pick<Ports,"readTarget"|"writeTarget">{
 async function readTarget(ctx:RequestContext,member:WorkMemberRef,target:WorkMaterialTarget,tx:Db){
  if(member.kind!=="article"||(target.kind!=="article_cover"&&target.kind!=="article_image")||member.outputId!==target.outputId)throw new OwnershipError("文章配图触点不一致");const current=await ownerFor(tx).getArticle(ctx,member.outputId);
  if(target.kind==="article_image"&&!current.current.sections.some(section=>section.sectionId===target.sectionId))throw new OwnershipError("文章段落不存在");
  const value=target.kind==="article_cover"?current.current.coverImageUse??null:current.current.imageUses.find(image=>image.sectionId===target.sectionId)??null;
  const field=target.kind==="article_cover"?{kind:"article_field" as const,outputId:member.outputId,field:"coverImageUse" as const}:{kind:"article_section" as const,outputId:member.outputId,sectionId:target.sectionId,field:"imageUse" as const};
  return{version:{kind:"artifact" as const,artifactId:current.artifactId,versionId:current.currentVersionId},files:value?[{assetId:value.assetId,assetFileId:value.assetFileId}]:[],field,value};
 }
 return{readTarget,async writeTarget(ctx,input,tx){
  if(input.member.kind!=="article"||(input.target.kind!=="article_cover"&&input.target.kind!=="article_image")||input.expectedVersion.kind!=="artifact")throw new OwnershipError("文章配图触点不一致");const owner=ownerFor(tx),current=await owner.getArticle(ctx,input.member.outputId);
  if(current.artifactId!==input.expectedVersion.artifactId||current.currentVersionId!==input.expectedVersion.versionId)throw Object.assign(Error("文章已更新"),{code:ErrorCode.ConflictError});
  const before=await readTarget(ctx,input.member,input.target,tx);if(input.operation==="attach"&&before.files.length)throw Object.assign(Error("该位置已有配图，请明确选择替换"),{code:ErrorCode.ConflictError});
  const use=input.operation==="detach"?null:{...input.file,sourceKind:"existing" as const,reviewState:"selected" as const};
  const target=input.target,document=target.kind==="article_cover"?{...current.current,coverImageUse:use}:{...current.current,imageUses:[...current.current.imageUses.filter(image=>image.sectionId!==target.sectionId),...(use?[{...use,sectionId:target.sectionId}]:[])]};
  const saveInput={expectedCurrentVersionId:current.currentVersionId,clientRequestId:input.clientRequestId,document};await owner.createVersion(ctx,input.member.outputId,saveInput);
  return{state:await readTarget(ctx,input.member,input.target,tx),receipt:await owner.saveReceipt(ctx,input.member.outputId,saveInput)};
 }};
}
