import {sql,eq,and} from 'drizzle-orm';
import type {AnyPgColumn,PgTable} from 'drizzle-orm/pg-core';
import type {RequestContext} from '@creatoros/contract';
import type {Db} from './db';
import {accountGroups} from './schema/account-groups';
import {assertWritableWorkspace,workspaceFilter,workspaceKey} from './workspace-scope';
import {OwnershipError} from './errors';
export type WorkspaceWriteTx=Parameters<Parameters<Db['transaction']>[0]>[0];
export interface WorkspaceWriteParent {
 table:PgTable;id:AnyPgColumn;userId:AnyPgColumn;groupId:AnyPgColumn;accountId:AnyPgColumn;
 lock?:'share'|'update';
 /** 按实际父根→实际子项顺序；请求ids属于最后一张表。 */
 via?:Array<{table:PgTable;id:AnyPgColumn;parentId:AnyPgColumn;userId?:AnyPgColumn;scope?:{groupId:AnyPgColumn;accountId:AnyPgColumn}}>;
}
/** SEMANTIC_BOUNDARY_ALLOW: 只锁用户实际选择的真实父链并校验owner/workspace，不判断内容、不把read grant当owner write。 */
export async function withWorkspaceWrite<T>(db:Db,ctx:RequestContext,write:(tx:WorkspaceWriteTx)=>Promise<T>):Promise<T>{
 const key=workspaceKey(ctx);
 return db.transaction(async tx=>{
  await assertWritableWorkspace(tx as unknown as Db,ctx);
  const groupId=key.kind==='group'?key.id:`grp_legacy_${key.id}`;
  // 先组后父；与显式迁移FOR UPDATE保持同一锁顺序。无初始group的旧真实行仍按legacy原scope校验。
  const group=await tx.select({id:accountGroups.id,status:accountGroups.status}).from(accountGroups).where(and(eq(accountGroups.id,groupId),eq(accountGroups.userId,ctx.userId))).for('share');
  if((key.kind==='group'&&!group.length)||(group.length&&group[0]!.status!=='active'))throw new OwnershipError('账号组不可写，请重新选择');
  await assertWritableWorkspace(tx as unknown as Db,ctx);
  return write(tx);
 });
}
export async function withWorkspaceParentWrite<T>(db:Db,ctx:RequestContext,parent:WorkspaceWriteParent,ids:readonly string[],write:(tx:WorkspaceWriteTx)=>Promise<T>):Promise<T>{
 const requested=[...new Set(ids)].sort();
 if(!requested.length)throw new OwnershipError('请选择真实父资料');
 return withWorkspaceWrite(db,ctx,async tx=>{
  let leaf=parent.id;const joins=[];const guards=[sql`${parent.userId}=${ctx.userId}`,workspaceFilter(parent,ctx)];
  for(const step of parent.via??[]){joins.push(sql`INNER JOIN ${step.table} ON ${step.parentId}=${leaf}`);leaf=step.id;if(step.userId)guards.push(sql`${step.userId}=${ctx.userId}`);if(step.scope)guards.push(workspaceFilter(step.scope,ctx));}
  const found=await tx.execute<{requested_id:string}>(sql`SELECT ${leaf} AS requested_id FROM ${parent.table} ${sql.join(joins,sql` `)} WHERE ${leaf} IN (${sql.join(requested.map(id=>sql`${id}`),sql`,`)}) AND ${sql.join(guards,sql` AND `)} ORDER BY ${parent.id},${leaf} ${parent.lock==='update'?sql`FOR UPDATE`:sql`FOR SHARE`}`);
  if(new Set(found.rows.map(row=>row.requested_id)).size!==requested.length)throw new OwnershipError('父资料已归组或不可写，请重新选择工作区');
  return write(tx);
 });
}
