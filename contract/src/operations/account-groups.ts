import {z} from "zod";
import {defineEndpoint} from "../endpoints";
import {id,paginationQuery} from "../primitives";
import {accountGroupResource,groupMemberResource,groupTransferPreview,groupMigrationSelection,groupMigrationPreview,groupMigrationResource} from "../resources/account-groups";
const params=z.object({groupId:id});const version=z.number().int().positive();const key=z.string().min(1).max(160);
export const accountGroupOperations={
 listAccountGroups:defineEndpoint({id:"accountGroups.list",method:"GET",path:"/account-groups",query:paginationQuery.extend({includeArchived:z.boolean().optional()}),response:accountGroupResource,isList:true,fr:["FR-GROUP-LIST"]}),
 getAccountGroup:defineEndpoint({id:"accountGroups.get",method:"GET",path:"/account-groups/:groupId",params,response:accountGroupResource,fr:["FR-GROUP-GET"]}),
 createAccountGroup:defineEndpoint({id:"accountGroups.create",method:"POST",path:"/account-groups",body:z.object({name:z.string().trim().min(1).max(120),idempotencyKey:key}),response:accountGroupResource,fr:["FR-GROUP-CREATE"]}),
 updateAccountGroup:defineEndpoint({id:"accountGroups.update",method:"PATCH",path:"/account-groups/:groupId",params,body:z.object({name:z.string().trim().min(1).max(120),expectedVersion:version}),response:accountGroupResource,fr:["FR-GROUP-UPDATE"]}),
 archiveAccountGroup:defineEndpoint({id:"accountGroups.archive",method:"POST",path:"/account-groups/:groupId/archive",params,body:z.object({expectedVersion:version}),response:accountGroupResource,fr:["FR-GROUP-ARCHIVE"]}),
 restoreAccountGroup:defineEndpoint({id:"accountGroups.restore",method:"POST",path:"/account-groups/:groupId/restore",params,body:z.object({expectedVersion:version}),response:accountGroupResource,fr:["FR-GROUP-RESTORE"]}),
 previewAccountGroupTransfer:defineEndpoint({id:"accountGroups.members.previewTransfer",method:"POST",path:"/account-groups/transfer-preview",body:z.object({accountId:id,toGroupId:id}),response:groupTransferPreview,fr:["FR-GROUP-TRANSFER"]}),
 transferAccountGroupMember:defineEndpoint({id:"accountGroups.members.transfer",method:"POST",path:"/account-groups/transfer",body:groupTransferPreview.extend({idempotencyKey:key}),response:groupMemberResource,fr:["FR-GROUP-TRANSFER"]}),
 previewAccountGroupMigration:defineEndpoint({id:'accountGroups.migration.preview',method:'POST',path:'/account-groups/migration-preview',body:groupMigrationSelection,response:groupMigrationPreview,fr:['FR-GROUP-MIGRATE']}),
 applyAccountGroupMigration:defineEndpoint({id:'accountGroups.migration.apply',method:'POST',path:'/account-groups/migrations',body:groupMigrationSelection.extend({digest:z.string(),idempotencyKey:key}),response:groupMigrationResource,fr:['FR-GROUP-MIGRATE']}),
 getAccountGroupMigration:defineEndpoint({id:'accountGroups.migration.status',method:'GET',path:'/account-groups/migrations/:migrationId',params:z.object({migrationId:id}),response:groupMigrationResource,fr:['FR-GROUP-MIGRATE']}),
 undoAccountGroupMigration:defineEndpoint({id:'accountGroups.migration.undo',method:'POST',path:'/account-groups/migrations/:migrationId/undo',params:z.object({migrationId:id}),response:groupMigrationResource,fr:['FR-GROUP-MIGRATE']}),
} as const;
