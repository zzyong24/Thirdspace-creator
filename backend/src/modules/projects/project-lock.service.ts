import {workspaceFilter,and,eq,requireAccountId,type Db} from "@creatoros/backend";
import type {RequestContext} from "@creatoros/contract";
import {projects} from "./projects.db-schema";
import {OwnershipError} from "./projects.errors";

/** 调用方必须传入当前事务；项目不存在时也不能创建其关联实体。 */
export async function lockOwnedProjectForUpdate(tx:Db,ctx:RequestContext,projectId:string){
 const [project]=await tx.select({id:projects.id}).from(projects).where(and(eq(projects.id,projectId),eq(projects.userId,ctx.userId),workspaceFilter(projects,ctx))).for("update");
 if(!project)throw new OwnershipError("Project not found");
 return project;
}

/** 重建只能写当前账号的导入项目；与新建稿件共用项目行锁。 */
export async function lockImportedProjectForReconstruction(tx:Db,ctx:RequestContext,projectId:string){
 const accountId=requireAccountId(ctx.accountId,'projects.reconstruction');
 const [project]=await tx.select({id:projects.id,source:projects.source}).from(projects).where(and(eq(projects.id,projectId),eq(projects.userId,ctx.userId),eq(projects.accountId,accountId))).for('update');
 if(!project||project.source!=='imported')throw new OwnershipError('仅当前账号的导入项目可重建');
 return project;
}
