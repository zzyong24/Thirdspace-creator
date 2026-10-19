import {ErrorCode,type RequestContext,type WorkMemberRef,type WorkMaterialTarget} from "@creatoros/contract";
import {OwnershipError,type Db} from "@creatoros/backend";
import type {GraphicPostsService} from "../graphic-posts";
import {createWorkMaterialsService} from "./work-materials.service";
type Ports=Parameters<typeof createWorkMaterialsService>[0]["ports"];
/** 图卡按真实 cardId 绑定；单槽位指纹不包含全局排序。 */
export function createGraphicMaterialPorts(ownerFor:(tx:Db)=>Pick<GraphicPostsService,"getGraphicPost"|"createVersion"|"saveReceipt">):Pick<Ports,"readTarget"|"writeTarget">{
 async function readTarget(ctx:RequestContext,member:WorkMemberRef,target:WorkMaterialTarget,tx:Db){
  if(member.kind!=="image"||(target.kind!=="image_cover"&&target.kind!=="image_card")||member.outputId!==target.outputId)throw new OwnershipError("图文配图触点不一致");
  const current=await ownerFor(tx).getGraphicPost(ctx,member.outputId);
  if(target.kind==="image_card"&&!(current.current.cardBriefs??[]).some(card=>card.cardId===target.cardId))throw new OwnershipError("图卡不存在");
  const use=current.current.imageUses.find(image=>target.kind==="image_cover"?image.role==="cover":image.role==="card"&&image.cardId===target.cardId);
  const value=use?{role:use.role,...(use.cardId?{cardId:use.cardId}:{}),assetId:use.assetId,assetFileId:use.assetFileId}:null;
  const field=target.kind==="image_cover"?{kind:"image_field" as const,outputId:member.outputId,field:"coverImageUse" as const}:{kind:"image_card" as const,outputId:member.outputId,cardId:target.cardId,field:"imageUse" as const};
  return{version:{kind:"artifact" as const,artifactId:current.artifactId,versionId:current.currentVersionId},files:use?[{assetId:use.assetId,assetFileId:use.assetFileId}]:[],field,value};
 }
 return{readTarget,async writeTarget(ctx,input,tx){
  if(input.member.kind!=="image"||(input.target.kind!=="image_cover"&&input.target.kind!=="image_card")||input.expectedVersion.kind!=="artifact")throw new OwnershipError("图文配图触点不一致");
  const owner=ownerFor(tx),current=await owner.getGraphicPost(ctx,input.member.outputId);
  if(current.artifactId!==input.expectedVersion.artifactId||current.currentVersionId!==input.expectedVersion.versionId)throw Object.assign(Error("图文已更新"),{code:ErrorCode.ConflictError});
  const before=await readTarget(ctx,input.member,input.target,tx);if(input.operation==="attach"&&before.files.length)throw Object.assign(Error("该位置已有配图，请明确选择替换"),{code:ErrorCode.ConflictError});
  const target=input.target,images=current.current.imageUses.slice(),index=images.findIndex(image=>target.kind==="image_cover"?image.role==="cover":image.role==="card"&&image.cardId===target.cardId);
  const use=input.operation==="detach"?null:{...input.file,role:target.kind==="image_cover"?"cover" as const:"card" as const,...(target.kind==="image_card"?{cardId:target.cardId}:{}),order:index<0?images.length:index};
  if(index>=0)images.splice(index,1,...(use?[use]:[]));else if(use)images.push(use);
  const saveInput={expectedCurrentVersionId:current.currentVersionId,clientRequestId:input.clientRequestId,document:{...current.current,imageUses:images.map((image,order)=>({...image,order}))}};
  await owner.createVersion(ctx,input.member.outputId,saveInput);
  return{state:await readTarget(ctx,input.member,input.target,tx),receipt:await owner.saveReceipt(ctx,input.member.outputId,saveInput)};
 }};
}
