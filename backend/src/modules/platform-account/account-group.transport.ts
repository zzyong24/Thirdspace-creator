import {ENDPOINTS,type Endpoint,type Transport} from "@creatoros/contract";
import type {GroupResourceAccessService} from "./group-resource-access.service";
import type {AccountGroupService} from "./account-group.service";
import type {GroupMigrationService} from "./group-migration.service";
import {AuthenticationError,UnsupportedOperationError} from "./platform-account.errors";
export const ACCOUNT_GROUP_OP_IDS=["groupResourceGrants.list","groupResourceGrants.previewRevoke","groupResourceGrants.revoke","assets.previewDelete","accountGroups.list","accountGroups.get","accountGroups.create","accountGroups.update","accountGroups.archive","accountGroups.restore","accountGroups.members.previewTransfer","accountGroups.members.transfer","accountGroups.migration.preview","accountGroups.migration.apply","accountGroups.migration.status","accountGroups.migration.undo"] as const;
export function createAccountGroupTransport(factory:()=>AccountGroupService,migrations?:()=>GroupMigrationService,resources?:()=>GroupResourceAccessService):Transport{
 return {async request(endpoint:Endpoint,input,ctx){
  if(!ctx)throw new AuthenticationError();const service=factory();const request=input??{};let data:unknown;
  switch(endpoint.id){
   case 'groupResourceGrants.list':{const rows=await resources!().list(ctx);return {data:rows,meta:{requestId:ctx.requestId,page:1,pageSize:Math.max(1,rows.length),total:rows.length}};}
   case 'groupResourceGrants.previewRevoke':data=await resources!().previewRevoke(ctx,ENDPOINTS.previewGroupResourceGrantRevoke.params.parse(request.params).grantId);break;
   case 'groupResourceGrants.revoke':data=await resources!().revoke(ctx,ENDPOINTS.revokeGroupResourceGrant.params.parse(request.params).grantId,ENDPOINTS.revokeGroupResourceGrant.body.parse(request.body));break;
   case 'assets.previewDelete':data=await resources!().previewDelete(ctx,ENDPOINTS.previewAssetDelete.params.parse(request.params).assetId);break;
   case "accountGroups.list":{const q=ENDPOINTS.listAccountGroups.query.parse(request.query??{});const result=await service.list(ctx,{includeArchived:q.includeArchived,limit:q.pageSize,offset:(q.page-1)*q.pageSize});return {data:result.rows,meta:{requestId:ctx.requestId,page:q.page,pageSize:q.pageSize,total:result.total}};}
   case "accountGroups.get":data=await service.get(ctx,ENDPOINTS.getAccountGroup.params.parse(request.params).groupId);break;
   case "accountGroups.create":data=await service.create(ctx,ENDPOINTS.createAccountGroup.body.parse(request.body));break;
   case "accountGroups.update":data=await service.update(ctx,ENDPOINTS.updateAccountGroup.params.parse(request.params).groupId,ENDPOINTS.updateAccountGroup.body.parse(request.body));break;
   case "accountGroups.archive":data=await service.archive(ctx,ENDPOINTS.archiveAccountGroup.params.parse(request.params).groupId,ENDPOINTS.archiveAccountGroup.body.parse(request.body).expectedVersion);break;
   case "accountGroups.restore":data=await service.restore(ctx,ENDPOINTS.restoreAccountGroup.params.parse(request.params).groupId,ENDPOINTS.restoreAccountGroup.body.parse(request.body).expectedVersion);break;
   case "accountGroups.members.previewTransfer":data=await service.previewTransfer(ctx,ENDPOINTS.previewAccountGroupTransfer.body.parse(request.body));break;
   case "accountGroups.members.transfer":data=await service.transfer(ctx,ENDPOINTS.transferAccountGroupMember.body.parse(request.body));break;
   case 'accountGroups.migration.preview':data=await migrations!().preview(ctx,ENDPOINTS.previewAccountGroupMigration.body.parse(request.body));break;
   case 'accountGroups.migration.apply':data=await migrations!().apply(ctx,ENDPOINTS.applyAccountGroupMigration.body.parse(request.body));break;
   case 'accountGroups.migration.status':data=await migrations!().status(ctx,ENDPOINTS.getAccountGroupMigration.params.parse(request.params).migrationId);break;
   case 'accountGroups.migration.undo':data=await migrations!().undo(ctx,ENDPOINTS.undoAccountGroupMigration.params.parse(request.params).migrationId);break;
   default:throw new UnsupportedOperationError(endpoint.id);
  }return {data,meta:{requestId:ctx.requestId}};
 }};
}
