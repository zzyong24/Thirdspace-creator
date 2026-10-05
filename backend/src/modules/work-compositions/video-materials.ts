import {ErrorCode,type RequestContext,type WorkAssetFile,type WorkCommitReceipt,type WorkMemberRef,type WorkMaterialTarget} from '@creatoros/contract';
import {OwnershipError,type Db} from '@creatoros/backend';
import {createWorkMaterialsService} from './work-materials.service';
type Ports=Parameters<typeof createWorkMaterialsService>[0]['ports'];
/** Production returns the actual whole field and selected item file witness, never a client alias guess. */
export type VideoMaterialState={outputId:string;revision:number;plan:unknown;files:WorkAssetFile[];targetFiles:WorkAssetFile[]};
export type VideoMaterialOwner={
 readVideoMaterialTarget(ctx:RequestContext,input:{outputId:string;itemId:string},tx:Db):Promise<VideoMaterialState>;
 writeVideoMaterialTarget(ctx:RequestContext,input:{outputId:string;itemId:string;expectedRevision:number;operation:'attach'|'replace'|'detach';expectedFile?:WorkAssetFile;file:WorkAssetFile;clientRequestId:string},tx:Db):Promise<{state:VideoMaterialState;receipt:WorkCommitReceipt}>;
};
export function createVideoMaterialPorts(ownerFor:(tx:Db)=>VideoMaterialOwner):Pick<Ports,'readTarget'|'writeTarget'>{
 function target(member:WorkMemberRef,pick:WorkMaterialTarget){if(member.kind!=='video'||pick.kind!=='video_material'||member.outputId!==pick.outputId)throw new OwnershipError('视频素材触点不一致');return{outputId:pick.outputId,itemId:pick.itemId};}
 function state(pick:{outputId:string},actual:VideoMaterialState){if(actual.outputId!==pick.outputId)throw new OwnershipError('视频物料读取作品不一致');return{version:{kind:'production' as const,outputId:actual.outputId,revision:actual.revision},field:{kind:'video_field' as const,outputId:actual.outputId,field:'production' as const},value:actual.plan,files:actual.files,targetFiles:actual.targetFiles};}
 return{
  async readTarget(ctx,member,pick,tx){const identity=target(member,pick);return state(identity,await ownerFor(tx).readVideoMaterialTarget(ctx,identity,tx));},
  async writeTarget(ctx,input,tx){const identity=target(input.member,input.target);if(input.expectedVersion.kind!=='production'||input.expectedVersion.outputId!==identity.outputId)throw new OwnershipError('视频素材保存版本不一致');if(input.position!==undefined&&input.position!==null)throw Object.assign(Error('视频素材只能放入明确槽位'),{code:ErrorCode.ValidationError});
   const actual=await ownerFor(tx).writeVideoMaterialTarget(ctx,{...identity,expectedRevision:input.expectedVersion.revision,operation:input.operation,expectedFile:input.expectedFile??undefined,file:input.file,clientRequestId:input.clientRequestId},tx);
   return{state:state(identity,actual.state),receipt:actual.receipt};
  },
 };
}
