import {scheduledJobs} from '../../schema/scheduling';
import {executionTasks} from '../../schema/intelligence';
import {lockWorkspaceMembership,activeAccountTaskCount} from "./membership-lock.service";
import {createHash} from "node:crypto";
import {and,eq,isNull,asc,inArray,sql} from "drizzle-orm";
import type {Db} from "../../db";
import type {RequestContext} from "@creatoros/contract";
import type {AccountGroupResource,GroupMemberResource,GroupTransferPreview} from "@creatoros/contract";
import {accountGroups,accountGroupMemberships,accountGroupCommands} from "../../schema/account-groups";
import {platformAccounts} from "../../schema/platform-account";
import {OwnershipError,ConflictError,ValidationError} from "./platform-account.errors";

type Tx=Parameters<Parameters<Db["transaction"]>[0]>[0];
type Store=Db|Tx;
type Deps={db:Db;now:()=>string;nextId:(prefix:string)=>string};
const hash=(value:unknown)=>createHash("sha256").update(JSON.stringify(value)).digest("hex");
export function createAccountGroupService({db,now,nextId}:Deps){
 async function root(store:Store,ctx:RequestContext,id:string,lock=false){
  const query=store.select().from(accountGroups).where(and(eq(accountGroups.id,id),eq(accountGroups.userId,ctx.userId)));
  const [g]=await(lock?query.for("update"):query);if(!g)throw new OwnershipError("账号组不存在");return g;
 }
 async function members(store:Store,ctx:RequestContext,groupId:string):Promise<GroupMemberResource[]>{
  const rows=await store.select({membership:accountGroupMemberships,account:platformAccounts}).from(accountGroupMemberships).innerJoin(platformAccounts,and(eq(platformAccounts.id,accountGroupMemberships.accountId),eq(platformAccounts.userId,accountGroupMemberships.userId))).where(and(eq(accountGroupMemberships.userId,ctx.userId),eq(accountGroupMemberships.groupId,groupId),isNull(accountGroupMemberships.leftAt))).orderBy(asc(accountGroupMemberships.joinedAt),asc(accountGroupMemberships.id));
  return rows.map(({membership:m,account:a})=>({...m,platform:a.platform as GroupMemberResource["platform"],accountHandle:a.accountHandle,status:a.status as GroupMemberResource["status"]}));
 }
 async function get(ctx:RequestContext,id:string):Promise<AccountGroupResource>{const g=await root(db,ctx,id);return {...g,status:g.status as AccountGroupResource["status"],members:await members(db,ctx,id)};}
 async function ensureLegacyGroups(ctx:RequestContext){
  await db.transaction(async tx=>{
   const rows=await tx.select().from(platformAccounts).where(eq(platformAccounts.userId,ctx.userId)).orderBy(asc(platformAccounts.id)).for("update");
   for(const a of rows){
    const [existing]=await tx.select().from(accountGroupMemberships).where(and(eq(accountGroupMemberships.userId,ctx.userId),eq(accountGroupMemberships.accountId,a.id),isNull(accountGroupMemberships.leftAt)));
    if(existing)continue;
    const groupId=`grp_legacy_${a.id}`;
    await tx.insert(accountGroups).values({id:groupId,userId:ctx.userId,name:a.accountHandle,status:"active",version:1,createdAt:a.createdAt,updatedAt:a.updatedAt}).onConflictDoNothing();
    await tx.insert(accountGroupMemberships).values({id:`gm_legacy_${a.id}`,userId:ctx.userId,groupId,accountId:a.id,version:1,joinedAt:a.createdAt,leftAt:null}).onConflictDoNothing();
   }
  });
 }
 async function memo(store:Store,ctx:RequestContext,key:string,kind:string,input:unknown){
  const [row]=await store.select().from(accountGroupCommands).where(and(eq(accountGroupCommands.userId,ctx.userId),eq(accountGroupCommands.key,key)));
  if(row&&(row.kind!==kind||row.inputHash!==hash(input)))throw new ConflictError("这次提交内容已改变，请重新提交");return row?.result;
 }
 async function save(store:Store,ctx:RequestContext,key:string,kind:string,input:unknown,result:unknown){await store.insert(accountGroupCommands).values({userId:ctx.userId,key,kind,inputHash:hash(input),result,createdAt:now()});}
 async function forAccount(ctx:RequestContext,accountId:string,store:Store=db,lock=false){
  const q=store.select({membership:accountGroupMemberships,account:platformAccounts}).from(platformAccounts).innerJoin(accountGroupMemberships,and(eq(accountGroupMemberships.accountId,platformAccounts.id),eq(accountGroupMemberships.userId,platformAccounts.userId),isNull(accountGroupMemberships.leftAt))).where(and(eq(platformAccounts.id,accountId),eq(platformAccounts.userId,ctx.userId)));
  const [row]=await(lock?q.for("update"):q);if(!row)throw new OwnershipError("账号不存在或没有归属组");
  const {membership:m,account:a}=row;return {...m,platform:a.platform as GroupMemberResource["platform"],accountHandle:a.accountHandle,status:a.status as GroupMemberResource["status"]};
 }
 async function preview(ctx:RequestContext,input:{accountId:string;toGroupId:string},store:Store=db):Promise<GroupTransferPreview>{
  const m=await forAccount(ctx,input.accountId,store);const target=await root(store,ctx,input.toGroupId);
  if(target.status!=="active"||m.status!=="active")throw new ValidationError("请先恢复账号或账号组，再调整归属");
  const activeTaskCount=await activeAccountTaskCount(store as Tx,ctx.userId,input.accountId);
  const count=async(query:ReturnType<typeof sql>)=>{const result=await store.execute<{n:number}>(query);return Number(result.rows[0]?.n??0);};
  const impact={
   historyPublicationCount:await count(sql`SELECT count(*)::int AS n FROM publications WHERE user_id=${ctx.userId} AND account_id=${input.accountId} AND group_id=${m.groupId} AND status='published'`),
   pendingPublicationTargetCount:await count(sql`SELECT count(*)::int AS n FROM content_calendar_entries WHERE user_id=${ctx.userId} AND account_id=${input.accountId} AND status='planned'`),
   sharedProjectCount:await count(sql`SELECT count(*)::int AS n FROM projects WHERE user_id=${ctx.userId} AND group_id=${m.groupId}`),
   positioningCount:await count(sql`SELECT count(*)::int AS n FROM positioning_statements WHERE user_id=${ctx.userId} AND group_id=${m.groupId}`),
   assetReferenceCount:await count(sql`SELECT count(*)::int AS n FROM material_links m JOIN projects p ON p.id=m.project_id AND p.user_id=m.user_id WHERE m.user_id=${ctx.userId} AND p.group_id=${m.groupId} AND m.entity_type='asset'`),
  };
  const result={impact,accountId:input.accountId,fromGroupId:m.groupId,toGroupId:target.id,expectedMembershipVersion:m.version,activeTaskCount,historyPolicy:"keep_original_group" as const};
  return {...result,digest:hash({...result,targetVersion:target.version})};
 }
 async function update(ctx:RequestContext,id:string,patch:{name?:string;expectedVersion:number;status?:"active"|"archived"}){
  await db.transaction(async tx=>{const g=await root(tx,ctx,id,true);if(g.version!==patch.expectedVersion)throw new ConflictError("账号组已更新，请刷新后再试");
   const name=patch.name?.trim()??g.name;if(!name||name.length>120)throw new ValidationError("账号组名称需为1到120个字");
   await tx.update(accountGroups).set({name,status:patch.status??g.status,version:g.version+1,updatedAt:now()}).where(eq(accountGroups.id,g.id));
  });return get(ctx,id);
 }
 return {
  get,forAccount,ensureLegacyGroups,
  async registerAccount(ctx:RequestContext,accountId:string,store:Store=db){
   const [account]=await store.select().from(platformAccounts).where(and(eq(platformAccounts.id,accountId),eq(platformAccounts.userId,ctx.userId))).for("update");
   if(!account)throw new OwnershipError("账号不存在");
   let groupId=ctx.groupId;
   if(groupId){const g=await root(store,ctx,groupId,true);if(g.status!=="active")throw new ValidationError("请先恢复账号组");}
   else{groupId=`grp_legacy_${account.id}`;await store.insert(accountGroups).values({id:groupId,userId:ctx.userId,name:account.accountHandle,status:"active",version:1,createdAt:account.createdAt,updatedAt:account.updatedAt}).onConflictDoNothing();}
   await store.insert(accountGroupMemberships).values({id:nextId("gm"),userId:ctx.userId,groupId,accountId:account.id,version:1,joinedAt:now(),leftAt:null});
  },
  async list(ctx:RequestContext,query:{includeArchived?:boolean;limit?:number;offset?:number}={}){
   await ensureLegacyGroups(ctx);
   const rows=await db.select().from(accountGroups).where(and(eq(accountGroups.userId,ctx.userId),query.includeArchived?undefined:eq(accountGroups.status,"active"))).orderBy(asc(accountGroups.createdAt),asc(accountGroups.id));
   const selected=rows.slice(query.offset??0,(query.offset??0)+(query.limit??100));return {rows:await Promise.all(selected.map(g=>get(ctx,g.id))),total:rows.length};
  },
  async create(ctx:RequestContext,input:{name:string;idempotencyKey:string}){
   const name=input.name.trim();if(!name||name.length>120||!input.idempotencyKey)throw new ValidationError("请填写账号组名称");
   const cached=await memo(db,ctx,input.idempotencyKey,"create",{name});if(cached)return get(ctx,(cached as {id:string}).id);
   const id=await db.transaction(async tx=>{
    await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtextextended(${ctx.userId+":"+input.idempotencyKey},1022))`);
    const existing=await memo(tx,ctx,input.idempotencyKey,"create",{name});if(existing)return (existing as {id:string}).id;
    const id=nextId("grp");await tx.insert(accountGroups).values({id,userId:ctx.userId,name,status:"active",version:1,createdAt:now(),updatedAt:now()});await save(tx,ctx,input.idempotencyKey,"create",{name},{id});return id;});return get(ctx,id);
  },
  update,
  archive:(ctx:RequestContext,id:string,expectedVersion:number)=>update(ctx,id,{expectedVersion,status:"archived"}),
  restore:(ctx:RequestContext,id:string,expectedVersion:number)=>update(ctx,id,{expectedVersion,status:"active"}),
  async hasVerifiedBinding(ctx:RequestContext,accountId:string){await forAccount(ctx,accountId);const rows=await db.select({id:executionTasks.id}).from(executionTasks).where(and(eq(executionTasks.userId,ctx.userId),eq(executionTasks.kind,"account_binding"),eq(executionTasks.status,"succeeded"),sql`${executionTasks.checkpoint}->>'accountId'=${accountId}`)).limit(1);return rows.length>0;},
  previewTransfer:(ctx:RequestContext,input:{accountId:string;toGroupId:string})=>preview(ctx,input),
  async transfer(ctx:RequestContext,input:GroupTransferPreview&{idempotencyKey:string}):Promise<GroupMemberResource>{
   const {idempotencyKey,...command}=input;const cached=await memo(db,ctx,idempotencyKey,"transfer",command);if(cached)return cached as GroupMemberResource;
   return db.transaction(async tx=>{
    await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtextextended(${ctx.userId+":"+idempotencyKey},1022))`);
    const replay=await memo(tx,ctx,idempotencyKey,"transfer",command);if(replay)return replay as GroupMemberResource;
    // 锁定真实账号与有效membership；平台任务创建/认领使用同一服务端锁协议。
    const initial=await forAccount(ctx,input.accountId,tx,true);
    await tx.select().from(accountGroups).where(and(eq(accountGroups.userId,ctx.userId),inArray(accountGroups.id,[initial.groupId,input.toGroupId].sort()))).orderBy(asc(accountGroups.id)).for("update");
    await lockWorkspaceMembership(tx,{...ctx,groupId:initial.groupId,accountId:input.accountId,membershipVersion:input.expectedMembershipVersion});
    const member=await forAccount(ctx,input.accountId,tx);
    const targetGroup=await root(tx,ctx,input.toGroupId,true);
    const fresh=await preview(ctx,{accountId:input.accountId,toGroupId:input.toGroupId},tx);
    if(fresh.digest!==input.digest||member.version!==input.expectedMembershipVersion||member.groupId!==input.fromGroupId)throw new ConflictError("归属或影响范围已改变，请重新预览");
    if(fresh.activeTaskCount)throw new ConflictError("该账号还有进行中的任务，完成后再转组");
    if(member.groupId===input.toGroupId){await save(tx,ctx,idempotencyKey,"transfer",command,member);return member;}
    await tx.update(accountGroupMemberships).set({leftAt:now()}).where(eq(accountGroupMemberships.id,member.id));
    const moved={...member,id:nextId("gm"),groupId:input.toGroupId,version:member.version+1,joinedAt:now(),leftAt:null};
    await tx.insert(accountGroupMemberships).values({id:moved.id,userId:ctx.userId,groupId:moved.groupId,accountId:moved.accountId,version:moved.version,joinedAt:moved.joinedAt,leftAt:null});
    // 未来系统采集跟随真实账号；历史run/task和冻结事实不回写。共享选题/雷达留原组。
    await tx.update(scheduledJobs).set({groupId:moved.groupId,groupVersion:targetGroup.version,membershipVersion:moved.version,updatedAt:now()}).where(and(eq(scheduledJobs.userId,ctx.userId),eq(scheduledJobs.accountId,input.accountId),eq(scheduledJobs.groupId,member.groupId),inArray(scheduledJobs.sourceKind,["self.metrics","self.traffic","comments","self.detail"])));
    await tx.update(scheduledJobs).set({accountId:null,membershipVersion:null,updatedAt:now()}).where(and(eq(scheduledJobs.userId,ctx.userId),eq(scheduledJobs.accountId,input.accountId),eq(scheduledJobs.groupId,member.groupId),inArray(scheduledJobs.sourceKind,["topic.daily","intelligence.sync"])));
    await save(tx,ctx,idempotencyKey,"transfer",command,moved);return moved;
   });
  },
 };
}
export type AccountGroupService=ReturnType<typeof createAccountGroupService>;
