import { createHash } from "node:crypto";
import { and,eq,publications,publicationRevisions,type Db } from "@creatoros/backend";
import type { RequestContext } from "@creatoros/contract";
import { ConflictError,ValidationError,requireAccountId } from "./publishing.errors";
export interface AdoptPublicationDraftInput {
  outputId:string;
  adoptionKey:string;
  platform:string;
  title:string;
  description:string;
  platformTags:string[];
}
/** 领域内一次事务创建草稿与首版；唯一来源键保留跨进程及业务采纳回执丢失后的恢复能力。 */
export async function adoptPublicationDraft(db:Db,ctx:RequestContext,input:AdoptPublicationDraftInput,deps:{now:()=>string;nextId:(prefix:string)=>string}){
  const accountId=requireAccountId(ctx.accountId,"publishing.adoptDraft");
  if(!input.adoptionKey || input.adoptionKey.length>256)throw new ValidationError("草稿采纳来源键无效");
  const digest=createHash("sha256").update(JSON.stringify([input.outputId,input.platform,input.title,input.description,input.platformTags])).digest("hex");
  return db.transaction(async tx=>{
    const stamp=deps.now();
    const [created]=await tx.insert(publications).values({id:deps.nextId("pub"),userId:ctx.userId,accountId,contentOutputId:input.outputId,platform:input.platform,accountReference:"",draftAdoptionKey:input.adoptionKey,draftAdoptionDigest:digest,createdAt:stamp,updatedAt:stamp})
      .onConflictDoNothing({target:[publications.userId,publications.accountId,publications.draftAdoptionKey]}).returning();
    if(!created){
      const [existing]=await tx.select().from(publications).where(and(eq(publications.userId,ctx.userId),eq(publications.accountId,accountId),eq(publications.draftAdoptionKey,input.adoptionKey))).for("update");
      if(!existing || existing.draftAdoptionDigest!==digest || !existing.currentRevisionId)throw new ConflictError("同一采纳来源不能改换草稿内容");
      return existing;
    }
    const [revision]=await tx.insert(publicationRevisions).values({id:deps.nextId("pub-rev"),userId:ctx.userId,publicationId:created.id,revisionNumber:1,title:input.title,description:input.description,platformTags:input.platformTags,createdAt:stamp}).returning();
    const [result]=await tx.update(publications).set({currentRevisionId:revision!.id}).where(eq(publications.id,created.id)).returning();
    return result!;
  });
}
