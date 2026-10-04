import {createHash} from "node:crypto";
import {and,eq,desc,publications,publicationRevisions,type Db} from "@creatoros/backend";
import type {RequestContext} from "@creatoros/contract";
import {ConflictError,ValidationError,OwnershipError,requireAccountId} from "./publishing.errors";
export interface AdoptPublicationDraftInput {
 outputId:string;adoptionKey:string;platform:string;title:string;description:string;platformTags:string[];
 coverAssetId?:string|null;category?:string;series?:string;platformSettings?:Record<string,unknown>;
}
export interface AdoptVisualRevisionInput extends AdoptPublicationDraftInput {publicationId:string;expectedCurrentRevisionId:string;}
// SEMANTIC_BOUNDARY_ALLOW: 规范化仅用于完整版本内容的幂等摘要，不推断文案或风格。
export function canonicalPublicationJson(value:unknown):string {if(Array.isArray(value))return `[${value.map(canonicalPublicationJson).join(",")}]`;if(value!==null&&typeof value==="object")return `{${Object.entries(value).filter(([,v])=>v!==undefined).sort(([a],[b])=>a.localeCompare(b)).map(([k,v])=>`${JSON.stringify(k)}:${canonicalPublicationJson(v)}`).join(",")}}`;return JSON.stringify(value);}
export function publicationRevisionContent(input:AdoptPublicationDraftInput){return {title:input.title,description:input.description,platformTags:input.platformTags,coverAssetId:input.coverAssetId??null,category:input.category??"",series:input.series??"",platformSettings:input.platformSettings??{}};}
function completeDigest(input:AdoptPublicationDraftInput){return createHash("sha256").update(canonicalPublicationJson({outputId:input.outputId,platform:input.platform,...publicationRevisionContent(input)})).digest("hex");}
function assertKey(input:AdoptPublicationDraftInput){if(!input.adoptionKey||input.adoptionKey.length>256)throw new ValidationError("草稿采纳来源键无效");}
type Dependencies={now:()=>string;nextId:(prefix:string)=>string};
/** 领域内原子创建草稿首版；保留旧调用的摘要及重放语义。 */
export async function adoptPublicationDraft(db:Db,ctx:RequestContext,input:AdoptPublicationDraftInput,deps:Dependencies){
 const accountId=requireAccountId(ctx.accountId,"publishing.adoptDraft");assertKey(input);
 const legacy=input.coverAssetId===undefined&&input.category===undefined&&input.series===undefined&&input.platformSettings===undefined;
 const digest=legacy?createHash("sha256").update(JSON.stringify([input.outputId,input.platform,input.title,input.description,input.platformTags])).digest("hex"):completeDigest(input);
 return db.transaction(async tx=>{
  const stamp=deps.now();
  const [created]=await tx.insert(publications).values({id:deps.nextId("pub"),userId:ctx.userId,accountId,contentOutputId:input.outputId,platform:input.platform,accountReference:"",draftAdoptionKey:input.adoptionKey,draftAdoptionDigest:digest,createdAt:stamp,updatedAt:stamp}).onConflictDoNothing({target:[publications.userId,publications.accountId,publications.draftAdoptionKey]}).returning();
  if(!created){const [existing]=await tx.select().from(publications).where(and(eq(publications.userId,ctx.userId),eq(publications.accountId,accountId),eq(publications.draftAdoptionKey,input.adoptionKey))).for("update");if(!existing||existing.draftAdoptionDigest!==digest||!existing.currentRevisionId)throw new ConflictError("同一采纳来源不能改换草稿内容");return existing;}
  const [revision]=await tx.insert(publicationRevisions).values({id:deps.nextId("pub-rev"),userId:ctx.userId,publicationId:created.id,revisionNumber:1,...publicationRevisionContent(input),visualAdoptionKey:legacy?null:input.adoptionKey,visualAdoptionDigest:legacy?null:digest,createdAt:stamp}).returning();
  const [result]=await tx.update(publications).set({currentRevisionId:revision!.id}).where(eq(publications.id,created.id)).returning();return result!;
 });
}
/** 不调用无CAS的旧setCurrentRevision；同事务锁根、校验指针、插入不可变版并推进指针。 */
export async function adoptPublicationVisualRevision(db:Db,ctx:RequestContext,input:AdoptVisualRevisionInput,deps:Dependencies){
 const accountId=requireAccountId(ctx.accountId,"publishing.adoptVisualRevision");assertKey(input);const digest=completeDigest(input);
 return db.transaction(async tx=>{
  const owned=and(eq(publications.id,input.publicationId),eq(publications.userId,ctx.userId),eq(publications.accountId,accountId));
  const [publication]=await tx.select().from(publications).where(owned).for("update");
  if(!publication||publication.contentOutputId!==input.outputId||publication.platform!==input.platform)throw new OwnershipError("发布草稿不属于当前稿件与平台");
  const [previous]=await tx.select().from(publicationRevisions).where(and(eq(publicationRevisions.publicationId,publication.id),eq(publicationRevisions.userId,ctx.userId),eq(publicationRevisions.visualAdoptionKey,input.adoptionKey)));
  if(previous){if(previous.visualAdoptionDigest!==digest)throw new ConflictError("同一采纳来源不能改换版本内容");return {publication,revision:previous};}
  if(publication.status!=="draft")throw new ConflictError("只能更新当前发布草稿");
  if(publication.currentRevisionId!==input.expectedCurrentRevisionId)throw new ConflictError("发布草稿版本已变化，请重新选择当前版本");
  const [latest]=await tx.select({number:publicationRevisions.revisionNumber}).from(publicationRevisions).where(eq(publicationRevisions.publicationId,publication.id)).orderBy(desc(publicationRevisions.revisionNumber)).limit(1);
  const stamp=deps.now(),[revision]=await tx.insert(publicationRevisions).values({id:deps.nextId("pub-rev"),userId:ctx.userId,publicationId:publication.id,revisionNumber:(latest?.number??0)+1,...publicationRevisionContent(input),visualAdoptionKey:input.adoptionKey,visualAdoptionDigest:digest,createdAt:stamp}).returning();
  const [updated]=await tx.update(publications).set({currentRevisionId:revision!.id,updatedAt:stamp}).where(and(owned,eq(publications.currentRevisionId,input.expectedCurrentRevisionId))).returning();
  if(!updated)throw new ConflictError("发布草稿版本已变化");return {publication:updated,revision:revision!};
 });
}
