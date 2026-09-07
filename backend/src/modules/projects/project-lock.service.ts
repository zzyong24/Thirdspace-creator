import {and,eq,requireAccountId,type Db} from "@creatoros/backend";
import type {RequestContext} from "@creatoros/contract";
import {projects} from "./projects.db-schema";
import {OwnershipError} from "./projects.errors";

/** 调用方必须传入当前事务；项目不存在时也不能创建其关联实体。 */
export async function lockOwnedProjectForUpdate(tx:Db,ctx:RequestContext,projectId:string){
 const accountId=requireAccountId(ctx.accountId,"projects.lockOwnedProject");
 const [project]=await tx.select({id:projects.id}).from(projects).where(and(eq(projects.id,projectId),eq(projects.userId,ctx.userId),eq(projects.accountId,accountId))).for("update");
 if(!project)throw new OwnershipError("Project not found");
 return project;
}
