import { createHash } from "node:crypto";
import { and, asc, eq, inArray, sql, assets, tags, entityTags, assetTagAdoptions, type Db } from "@creatoros/backend";
import type { RequestContext } from "@creatoros/contract";
import type { RepoDeps } from "./taxonomy.repository";
import { DuplicateTagError, InvalidEntityRefError, TagNotFoundError } from "./taxonomy.errors";

type Tx = Parameters<Parameters<Db["transaction"]>[0]>[0];
export interface AssetTagTarget { assetId: string; expectedVersion: string }
export interface AssetTagProposal { proposalId: string; targets: AssetTagTarget[]; tag: string }
export interface AssetTagAdoptionResult { proposalId: string; assetIds: string[]; tagId: string; addedCount: number }
// SEMANTIC_BOUNDARY_ALLOW: hashes compare immutable observations and requests, never choose tags.
const digest = (value: unknown) => createHash("sha256").update(JSON.stringify(value)).digest("hex");
function account(ctx: RequestContext) {
  if (!ctx.accountId) throw new InvalidEntityRefError("素材标签操作需要当前账号");
  return ctx.accountId;
}
export async function lockTagAssets(tx: Tx, ctx: RequestContext, ids: string[]) {
  const rows = await tx.select().from(assets).where(and(eq(assets.userId, ctx.userId), eq(assets.accountId, account(ctx)), inArray(assets.id, ids))).orderBy(asc(assets.id)).for("update");
  if (rows.length !== ids.length || rows.some(row => row.status !== "active")) throw new TagNotFoundError("素材不存在或不可用");
  return rows;
}
async function version(tx: Tx, ctx: RequestContext, row: typeof assets.$inferSelect) {
  const relations = await tx.select({id: entityTags.id, tagId: entityTags.tagId, createdAt: entityTags.createdAt, name:tags.name, color:tags.color, kind:tags.kind}).from(entityTags).innerJoin(tags,eq(tags.id,entityTags.tagId)).where(and(eq(entityTags.userId,ctx.userId),eq(entityTags.entityType,"asset"),eq(entityTags.entityId,row.id))).orderBy(asc(entityTags.id));
  return digest([row.id,row.updatedAt,row.currentFileId,row.status,relations]);
}
export function createAssetTagProposalService(db: Db, deps: RepoDeps) {
  async function adoptBatch(ctx: RequestContext, inputs: AssetTagProposal[], transaction?: Tx): Promise<AssetTagAdoptionResult[]> {
    const accountId = account(ctx);
    if (!inputs.length || inputs.length > 100 || new Set(inputs.map(p=>p.proposalId)).size !== inputs.length) throw new InvalidEntityRefError("标签建议批次无效或重复");
    const normalized = inputs.map(input=>{
      const tag=input.tag.trim();
      const targets=[...input.targets].sort((a,b)=>a.assetId<b.assetId?-1:a.assetId>b.assetId?1:0);
      if (!input.proposalId || !tag || tag.length>200 || !targets.length || targets.length>100 || new Set(targets.map(t=>t.assetId)).size!==targets.length || targets.some(t=>!t.assetId||!t.expectedVersion)) throw new InvalidEntityRefError("标签建议参数无效");
      return {proposalId:input.proposalId,tag,targets,sourceDigest:digest([targets,tag]),receiptId:digest([ctx.userId,accountId,input.proposalId])};
    }).sort((a,b)=>a.proposalId<b.proposalId?-1:a.proposalId>b.proposalId?1:0);
    const operation = async(tx:Tx):Promise<AssetTagAdoptionResult[]>=>{
      const results=new Map<string,AssetTagAdoptionResult>();
      const pending:typeof normalized=[];
      // Reserve every receipt before acquiring the union of asset locks.
      for(const proposal of normalized){
        const [reserved]=await tx.insert(assetTagAdoptions).values({id:proposal.receiptId,userId:ctx.userId,accountId,proposalId:proposal.proposalId,sourceDigest:proposal.sourceDigest,result:{},createdAt:deps.now()}).onConflictDoNothing().returning();
        if(reserved){pending.push(proposal);continue;}
        const [receipt]=await tx.select().from(assetTagAdoptions).where(and(eq(assetTagAdoptions.userId,ctx.userId),eq(assetTagAdoptions.accountId,accountId),eq(assetTagAdoptions.proposalId,proposal.proposalId)));
        if(!receipt || receipt.sourceDigest!==proposal.sourceDigest)throw new DuplicateTagError("建议标识已绑定不同内容");
        results.set(proposal.proposalId,receipt.result as AssetTagAdoptionResult);
      }
      if(pending.length){
        const ids=[...new Set(pending.flatMap(p=>p.targets.map(t=>t.assetId)))].sort();
        const rows=await lockTagAssets(tx,ctx,ids);
        const versions=new Map<string,string>();
        for(const row of rows)versions.set(row.id,await version(tx,ctx,row));
        // Every proposal is compared with the same pre-write observation.
        for(const proposal of pending)for(const target of proposal.targets)if(versions.get(target.assetId)!==target.expectedVersion)throw new DuplicateTagError("素材或标签已变化，请重新生成建议");
        const names=[...new Set(pending.map(p=>p.tag))].sort();
        for(const name of names)await tx.insert(tags).values({id:deps.nextId("tag"),userId:ctx.userId,name,kind:"asset-usage",usageCount:0,createdAt:deps.now(),updatedAt:deps.now()}).onConflictDoNothing();
        const ownedTags=await tx.select().from(tags).where(and(eq(tags.userId,ctx.userId),inArray(tags.name,names))).orderBy(asc(tags.id)).for("update");
        const byName=new Map(ownedTags.map(tag=>[tag.name,tag]));
        for(const proposal of pending){
          const ownedTag=byName.get(proposal.tag);if(!ownedTag)throw new TagNotFoundError();
          const added=await tx.insert(entityTags).values(proposal.targets.map(target=>({id:deps.nextId("entitytag"),userId:ctx.userId,tagId:ownedTag.id,entityType:"asset",entityId:target.assetId,createdAt:deps.now()}))).onConflictDoNothing().returning();
          if(added.length)await tx.update(tags).set({usageCount:sql`${tags.usageCount} + ${added.length}`,updatedAt:deps.now()}).where(eq(tags.id,ownedTag.id));
          const result:AssetTagAdoptionResult={proposalId:proposal.proposalId,assetIds:proposal.targets.map(t=>t.assetId),tagId:ownedTag.id,addedCount:added.length};
          await tx.update(assetTagAdoptions).set({result}).where(eq(assetTagAdoptions.id,proposal.receiptId));
          results.set(proposal.proposalId,result);
        }
      }
      return inputs.map(p=>results.get(p.proposalId)!);
    };
    return transaction?operation(transaction):db.transaction(operation);
  }
  return {
    async prepare(ctx: RequestContext, assetIds: string[]): Promise<AssetTagTarget[]> {
      const ids = [...new Set(assetIds)].sort();
      if (!ids.length || ids.length > 100 || ids.length !== assetIds.length) throw new InvalidEntityRefError("素材目标无效或重复");
      return db.transaction(async tx => {
        const rows = await lockTagAssets(tx,ctx,ids);
        return Promise.all(rows.map(async row => ({assetId:row.id,expectedVersion:await version(tx,ctx,row)})));
      });
    },
    async adopt(ctx: RequestContext, input: AssetTagProposal, transaction?: Tx): Promise<AssetTagAdoptionResult> {
      return (await adoptBatch(ctx,[input],transaction))[0]!;
    },
    adoptBatch,

  };
}

// User-level rename/delete may affect several accounts; lock actual owned assets before the tag.
export async function mutateTagWithAssetLocks<T>(db: Db,ctx: RequestContext,tagId: string,mutate:(tx:Tx)=>Promise<T>):Promise<T> {
  const retry = Symbol("tag-relations-changed");
  for (let attempt=0;attempt<3;attempt++) {
    try {
      return await db.transaction(async tx => {
        const refs = await tx.select({id:entityTags.entityId}).from(entityTags).where(and(eq(entityTags.userId,ctx.userId),eq(entityTags.tagId,tagId),eq(entityTags.entityType,"asset")));
        const ids = [...new Set(refs.map(row=>row.id))].sort();
        if(ids.length) await tx.select().from(assets).where(and(eq(assets.userId,ctx.userId),inArray(assets.id,ids))).orderBy(asc(assets.id)).for("update");
        await tx.select().from(tags).where(and(eq(tags.userId,ctx.userId),eq(tags.id,tagId))).for("update");
        const current = await tx.select({id:entityTags.entityId}).from(entityTags).where(and(eq(entityTags.userId,ctx.userId),eq(entityTags.tagId,tagId),eq(entityTags.entityType,"asset")));
        if(current.some(row=>!ids.includes(row.id))) throw retry;
        return mutate(tx);
      });
    } catch(error) {if(error!==retry)throw error;}
  }
  throw new DuplicateTagError("标签关系持续变化，请稍后重试");
}
