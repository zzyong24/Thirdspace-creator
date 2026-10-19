import {createHash,randomUUID} from "node:crypto";
import {and,eq,isNull,desc,sql} from "drizzle-orm";
import {OwnershipError,requireAccountId,type Db} from "@creatoros/backend";
import {ErrorCode,visualTemplateInputSchema,visualTemplateResource,ENDPOINTS as visualTemplateOperations,type RequestContext,type VisualTemplate,type VisualTemplateInput} from "@creatoros/contract";
import {visualTemplateFavorites,visualTemplateMutationReceipts} from "../../schema/visual-templates";
import {workspaceFilter,workspaceStamp,workspaceKey,assertWritableWorkspace} from "../../workspace-scope";
import {withWorkspaceWrite} from "../../workspace-write";
import {builtinVisualTemplates} from "./visual-template.catalog";

class TemplateConflict extends Error {readonly code=ErrorCode.ConflictError;constructor(message:string){super(message);this.name="ConflictError";}}
class TemplateValidation extends Error {readonly code=ErrorCode.ValidationError;constructor(message:string){super(message);this.name="ValidationError";}}
// SEMANTIC_BOUNDARY_ALLOW: 按字段规范化仅用于幂等摘要，不判断行业或创作风格。
function canonical(value:unknown):string {if(Array.isArray(value))return `[${value.map(canonical).join(",")}]`;if(value!==null&&typeof value==="object")return `{${Object.entries(value).filter(([,v])=>v!==undefined).sort(([a],[b])=>a.localeCompare(b)).map(([k,v])=>`${JSON.stringify(k)}:${canonical(v)}`).join(",")}}`;return JSON.stringify(value);}
export type VisualTemplateReference=VisualTemplateInput["references"][number];
export interface VisualTemplateServiceDeps {now?:()=>string;assertImageReference:(ctx:RequestContext,reference:VisualTemplateReference)=>Promise<{fileId:string;checksum:string}>;}
export function createVisualTemplateService(db:Db,deps:VisualTemplateServiceDeps){
 const now=deps.now??(()=>new Date().toISOString());
 function owner(ctx:RequestContext){return and(eq(visualTemplateFavorites.userId,ctx.userId),workspaceFilter(visualTemplateFavorites,ctx));}
 function project(row:typeof visualTemplateFavorites.$inferSelect):VisualTemplate{return visualTemplateResource.parse({...row.snapshot as VisualTemplateInput,id:row.id,scope:"saved",revision:row.revision,aspectRatios:[(row.snapshot as VisualTemplateInput).aspectRatio],previewPath:null,createdAt:row.createdAt,updatedAt:row.updatedAt});}
 async function mutate<T>(ctx:RequestContext,attemptId:string,payload:unknown,action:(tx:Db)=>Promise<T>):Promise<T>{
  const scope=workspaceStamp(workspaceKey(ctx)),digest=createHash("sha256").update(canonical(payload)).digest("hex");
  return withWorkspaceWrite(db,ctx,async tx=>{
   const [inserted]=await tx.insert(visualTemplateMutationReceipts).values({id:randomUUID(),userId:ctx.userId,...scope,attemptId,digest,createdAt:now()}).onConflictDoNothing().returning();
   if(!inserted){const [old]=await tx.select().from(visualTemplateMutationReceipts).where(and(eq(visualTemplateMutationReceipts.userId,ctx.userId),workspaceFilter(visualTemplateMutationReceipts,ctx),eq(visualTemplateMutationReceipts.attemptId,attemptId))).for("update");if(!old||old.digest!==digest||!old.response)throw new TemplateConflict("同一收藏请求不能改换内容");return old.response as T;}
   const result=await action(tx as unknown as Db);
   await tx.update(visualTemplateMutationReceipts).set({response:result}).where(eq(visualTemplateMutationReceipts.id,inserted.id));return result;
  });
 }
 return {
  async resolveRequirement(ctx:RequestContext,id:string,version:number):Promise<boolean>{
   const builtin=builtinVisualTemplates.find(template=>template.id===id);
   if(builtin){if(builtin.revision!==version)throw new TemplateConflict("内置模板版本不存在");return builtin.requiredIdentity||builtin.visualMode==="real_person";}
   const scope=workspaceStamp(workspaceKey(ctx));
   const [receipt]=await db.select({response:visualTemplateMutationReceipts.response}).from(visualTemplateMutationReceipts).where(and(eq(visualTemplateMutationReceipts.userId,ctx.userId),workspaceFilter(visualTemplateMutationReceipts,ctx),sql`${visualTemplateMutationReceipts.response}->>'id' = ${id}`,sql`${visualTemplateMutationReceipts.response}->>'revision' = ${String(version)}`)).limit(1);
   const parsed=visualTemplateResource.safeParse(receipt?.response);if(!parsed.success)throw new OwnershipError("收藏模板快照不存在或无权访问");
   return parsed.data.requiredIdentity||parsed.data.visualMode==="real_person";
  },
  async list(ctx:RequestContext,raw:unknown){
   const query=visualTemplateOperations.listVisualTemplates.query!.parse(raw);
   let values:VisualTemplate[]=[];
   if(query.scope!=="saved")values.push(...builtinVisualTemplates);
   if(query.scope!=="builtin")values.push(...(await db.select().from(visualTemplateFavorites).where(and(owner(ctx),isNull(visualTemplateFavorites.deletedAt))).orderBy(desc(visualTemplateFavorites.updatedAt),desc(visualTemplateFavorites.id))).map(project));
   values=values.filter(value=>(!query.libraryKind||value.libraryKind===query.libraryKind)&&(!query.industry||value.industries.includes(query.industry))&&(!query.visualMode||value.visualMode===query.visualMode));
   return {data:values.slice((query.page-1)*query.pageSize,query.page*query.pageSize),total:values.length,page:query.page,pageSize:query.pageSize};
  },
  async save(ctx:RequestContext,raw:unknown):Promise<VisualTemplate>{
   const input=visualTemplateOperations.saveVisualTemplate.body!.parse(raw),scope=workspaceStamp(workspaceKey(ctx));
   await assertWritableWorkspace(db,ctx);
   if(input.id&&builtinVisualTemplates.some(t=>t.id===input.id))throw new TemplateConflict("内置模板不能修改，请另存收藏");
   const payload={operation:"save",...input},digest=createHash("sha256").update(canonical(payload)).digest("hex");
   const [receipt]=await db.select().from(visualTemplateMutationReceipts).where(and(eq(visualTemplateMutationReceipts.userId,ctx.userId),workspaceFilter(visualTemplateMutationReceipts,ctx),eq(visualTemplateMutationReceipts.attemptId,input.attemptId)));
   if(receipt){if(receipt.digest!==digest||!receipt.response)throw new TemplateConflict("同一收藏请求不能改换内容");return visualTemplateResource.parse(receipt.response);}
   const snapshot=visualTemplateInputSchema.parse(input.template);
   if(snapshot.references.filter(ref=>ref.role==="identity").length>1)throw new TemplateValidation("身份参考必须唯一，请明确选择一张本人图片");
   // 跨领域只读端口在本领域事务外校验，避免单连接PGlite中等候自身事务释放。
   snapshot.references=await Promise.all(snapshot.references.map(async ref=>{const file=await deps.assertImageReference(ctx,ref);if(ref.fileId&&file.fileId!==ref.fileId||ref.checksum&&file.checksum!==ref.checksum)throw new TemplateConflict("参考素材文件版本已变化");return {...ref,...file};}));
   return mutate(ctx,input.attemptId,payload,async tx=>{
    const stamp=now();
    if(input.id){const [old]=await tx.select().from(visualTemplateFavorites).where(and(owner(ctx),eq(visualTemplateFavorites.id,input.id),isNull(visualTemplateFavorites.deletedAt))).for("update");if(!old)throw new OwnershipError("收藏不存在");if(old.revision!==input.expectedRevision)throw new TemplateConflict("收藏版本已变化，请重新载入");const [saved]=await tx.update(visualTemplateFavorites).set({snapshot,revision:old.revision+1,updatedAt:stamp}).where(eq(visualTemplateFavorites.id,old.id)).returning();return project(saved!);}
    const [saved]=await tx.insert(visualTemplateFavorites).values({id:randomUUID(),userId:ctx.userId,...scope,snapshot,revision:1,createdAt:stamp,updatedAt:stamp}).returning();return project(saved!);
   });
  },
  async remove(ctx:RequestContext,id:string,raw:unknown):Promise<{id:string;removed:true}>{
   const input=visualTemplateOperations.removeVisualTemplate.body!.parse(raw);
   if(builtinVisualTemplates.some(t=>t.id===id))throw new TemplateConflict("内置模板不能删除");
   return mutate(ctx,input.attemptId,{operation:"remove",id,...input},async tx=>{
    const [old]=await tx.select().from(visualTemplateFavorites).where(and(owner(ctx),eq(visualTemplateFavorites.id,id),isNull(visualTemplateFavorites.deletedAt))).for("update");if(!old)throw new OwnershipError("收藏不存在");if(old.revision!==input.expectedRevision)throw new TemplateConflict("收藏版本已变化，请重新载入");await tx.update(visualTemplateFavorites).set({deletedAt:now(),updatedAt:now(),revision:old.revision+1}).where(eq(visualTemplateFavorites.id,id));return {id,removed:true as const};
   });
  },
 };
}
export type VisualTemplateService=ReturnType<typeof createVisualTemplateService>;
