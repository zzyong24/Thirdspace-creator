import {ErrorCode,type RequestContext,type WorkMemberRef,type WorkMaterialTarget,type WorkOwnerVersion,type WorkAssetFile,type WorkFieldTarget} from "@creatoros/contract";
import {OwnershipError,type Db} from "@creatoros/backend";
import type {MomentsService} from "../moments";
import type {WorkMaterialsService} from "./work-materials.service";
import {createWorkMaterialsService} from "./work-materials.service";
type Ports=Parameters<typeof createWorkMaterialsService>[0]["ports"];
/** 原朋友圈保存owner提供真实写后读与持久回执；不直接改Artifact。 */
export function createMomentsMaterialPorts(ownerFor:(tx:Db)=>MomentsService):Pick<Ports,"readTarget"|"writeTarget">{
 async function readTarget(ctx:RequestContext,member:WorkMemberRef,target:WorkMaterialTarget,tx:Db){if(member.kind!=="moments"||target.kind!=="moments_images"||member.momentsId!==target.momentsId)throw new OwnershipError("朋友圈配图触点不一致");const current=await ownerFor(tx).get(ctx,member.momentsId);return{version:{kind:"artifact" as const,artifactId:current.artifactId,versionId:current.currentVersionId},files:current.current.imageUses.map(({assetId,assetFileId})=>({assetId,assetFileId})),field:{kind:"moments_field" as const,momentsId:member.momentsId,field:"imageUses" as const},value:current.current.imageUses};}
 return{readTarget,async writeTarget(ctx,input,tx){
  if(input.member.kind!=="moments"||input.target.kind!=="moments_images"||input.expectedVersion.kind!=="artifact")throw new OwnershipError("朋友圈配图触点不一致");const owner=ownerFor(tx),current=await owner.get(ctx,input.member.momentsId);if(current.artifactId!==input.expectedVersion.artifactId||current.currentVersionId!==input.expectedVersion.versionId)throw Object.assign(Error("朋友圈已更新"),{code:ErrorCode.ConflictError});
  const files:WorkAssetFile[]=current.current.imageUses.map(({assetId,assetFileId})=>({assetId,assetFileId}));
  if(input.operation==="attach"){const position=input.position??files.length;if(position>files.length)throw Object.assign(Error("配图插入位置越界"),{code:ErrorCode.ValidationError});files.splice(position,0,input.file);}else{const index=files.findIndex(file=>file.assetId===input.expectedFile?.assetId&&file.assetFileId===input.expectedFile?.assetFileId);if(index<0)throw Object.assign(Error("原配图已变化"),{code:ErrorCode.ConflictError});files.splice(index,1,...(input.operation==="replace"?[input.file]:[]));}
  await owner.save(ctx,input.member.momentsId,{expectedCurrentVersionId:current.currentVersionId,clientRequestId:input.clientRequestId,document:{...current.current,imageUses:files.map((file,order)=>({...file,order}))}});
  return{state:await readTarget(ctx,input.member,input.target,tx),receipt:await owner.saveReceipt(ctx,input.member.momentsId,input.clientRequestId)};
 }};
}
