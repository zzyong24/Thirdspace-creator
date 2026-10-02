import {createHash,randomUUID} from "node:crypto";
import {and,desc,eq,isNull} from "drizzle-orm";
import {canvasMaterialSelectionResource,committedGeneratedAssetProof,canvasDocumentSchema,canvasProposalOperationSchema,creativeCanvasResource,emptyCanvasDocument,type CanvasDocument,type CanvasNode,type RequestContext,ErrorCode} from "@creatoros/contract";
import {canvasAgentProposals,canvasGenerationLinks,creativeCanvases,requireAccountId,OwnershipError,type Db} from "@creatoros/backend";
import {z} from "zod";
import {supportsAssetGenerationMode,capabilityForAssetMode,referenceImageAllowed,assetGenerationParameterError} from "../ai-runtime/asset-generation-modes";

type CanvasRow=typeof creativeCanvases.$inferSelect;
type LinkRow=typeof canvasGenerationLinks.$inferSelect;
type GenerationNode=Extract<CanvasNode,{type:"image_generation"|"video_generation"}>;
type ProposalOperation=z.infer<typeof canvasProposalOperationSchema>;
type Reference={fileId:string;checksum:string;mimeType:string;bytes:Uint8Array};
export type CanvasTaskInput={projectId?:string|null;kind:"image"|"video";mode:"text_to_image"|"image_to_image"|"text_to_video"|"image_to_video";prompt:string;aspectRatio?:string;durationSec?:number;resolution?:"768P"|"2K";referenceAssetId?:string;referenceFileId?:string;referenceChecksum?:string;canvasOwner:{accountId:string;canvasId:string;nodeId:string;inputDigest:string}};
const frozenTaskInputSchema=z.object({projectId:z.string().min(1).nullable().optional(),kind:z.enum(["image","video"]),mode:z.enum(["text_to_image","image_to_image","text_to_video","image_to_video"]),prompt:z.string().min(1).max(10000),aspectRatio:z.string().max(32).optional(),durationSec:z.number().int().positive().optional(),resolution:z.enum(["768P","2K"]).optional(),referenceAssetId:z.string().min(1).optional(),referenceFileId:z.string().min(1).optional(),referenceChecksum:z.string().regex(/^[a-f0-9]{64}$/).optional(),canvasOwner:z.object({accountId:z.string().min(1),canvasId:z.string().min(1),nodeId:z.string().min(1),inputDigest:z.string().regex(/^[a-f0-9]{64}$/)}).strict()}).strict();
function frozenInput(row:LinkRow):CanvasTaskInput{
 const value=frozenTaskInputSchema.parse(row.inputJson);
 const digest=createHash("sha256").update(JSON.stringify([row.inputRevision,row.nodeId,{...value,canvasOwner:{...value.canvasOwner,inputDigest:""}}])).digest("hex");
 if(value.canvasOwner.accountId!==row.accountId||value.canvasOwner.canvasId!==row.canvasId||value.canvasOwner.nodeId!==row.nodeId||value.canvasOwner.inputDigest!==row.inputDigest||digest!==row.inputDigest||row.referenceFileId!==(value.referenceFileId??null)||row.referenceChecksum!==(value.referenceChecksum??null))throw new CanvasConflictError("生成输入与原提交不符");
 return value;
}
class CanvasConflictError extends Error {readonly code=ErrorCode.ConflictError;constructor(message:string){super(message);this.name="ConflictError";}}
function account(ctx:RequestContext){return requireAccountId(ctx.accountId,"creativeCanvas");}
function owned(ctx:RequestContext,id:string){return and(eq(creativeCanvases.id,id),eq(creativeCanvases.userId,ctx.userId),eq(creativeCanvases.accountId,account(ctx)),isNull(creativeCanvases.archivedAt));}
function project(row:CanvasRow){const {documentJson,...visible}=row;return {...visible,document:canvasDocumentSchema.parse(documentJson)};}
function link(row:LinkRow){const {userId:_userId,accountId:_accountId,inputJson,...visible}=row;return {...visible,mediaKind:frozenInput(row).kind};}
function proposal(row:typeof canvasAgentProposals.$inferSelect){const {userId:_userId,accountId:_accountId,operationsJson,appliedCanvasJson:_appliedCanvasJson,...visible}=row;return {...visible,operations:z.array(canvasProposalOperationSchema).parse(operationsJson)};}

export function createCreativeCanvasService(db:Db,deps:{
 now?:()=>string;
 assertProject:(ctx:RequestContext,id:string,tx?:Db,forUpdate?:boolean)=>Promise<void>;
 assertMediaAsset:(ctx:RequestContext,id:string,type:"image"|"video",fileId?:string,tx?:Db)=>Promise<{fileId:string;checksum:string}>;
 assertReferenceAsset:(ctx:RequestContext,id:string,tx?:Db)=>Promise<void>;
 getMediaFileDownloadUrl:(ctx:RequestContext,assetId:string,fileId:string)=>Promise<{url:string;fileName:string}>;
 getReference:(ctx:RequestContext,id:string,fileId?:string,tx?:Db)=>Promise<Reference|null>;
 readTask:(ctx:RequestContext,taskId:string,tx?:Db)=>Promise<{id:string;userId:string;attemptId:string;projectId:string|null;taskType:string;inputData:unknown}|null>;
 readTaskResults:(ctx:RequestContext,taskId:string,tx?:Db)=>Promise<Array<{id?:string;resultType:string;assetId?:string|null}>>;
 getCommittedAssetResult?:(ctx:RequestContext,input:{taskId:string;resultId:string},tx:Db)=>Promise<{status:"verified";proof:z.infer<typeof committedGeneratedAssetProof>}|{status:"unverifiable";reason:string}>;
 submitTask:(ctx:RequestContext,input:{attemptId:string;inputData:CanvasTaskInput})=>Promise<{id:string}>;
 resolveCapability?:(ctx:RequestContext,capability:"image.generate"|"image.edit"|"video.generate")=>Promise<{provider:string;model:string}>;
}){
 const now=deps.now??(()=>new Date().toISOString());
 async function requireCanvas(ctx:RequestContext,id:string){const [row]=await db.select().from(creativeCanvases).where(owned(ctx,id));if(!row)throw new OwnershipError("画布不存在");return row;}
 async function visibleCanvas(ctx:RequestContext,row:CanvasRow){
  const value=project(row);
  if(!row.projectId)return value;
  try{await deps.assertProject(ctx,row.projectId);return value;}
  catch(error){if(error instanceof OwnershipError)return {...value,projectId:null};throw error;}
 }
 async function validateDocument(ctx:RequestContext,raw:unknown,tx?:Db):Promise<CanvasDocument>{
  const doc=canvasDocumentSchema.parse(raw),ids=new Set<string>(),edgeIds=new Set<string>();
  for(const node of doc.nodes){
   if(ids.has(node.id))throw new CanvasConflictError("画布节点 ID 重复");ids.add(node.id);
   if(node.type==="image"||node.type==="video"){
    const file=await deps.assertMediaAsset(ctx,node.assetId,node.type,node.fileId,tx);
    if(node.checksum&&node.checksum!==file.checksum)throw new CanvasConflictError("画布素材文件校验已变化");
    node.fileId=file.fileId;node.checksum=file.checksum;
   }
   if((node.type==="image_generation"||node.type==="video_generation")&&node.referenceAssetId)await deps.assertReferenceAsset(ctx,node.referenceAssetId,tx);
  }
  for(const edge of doc.edges){if(edgeIds.has(edge.id)||!ids.has(edge.source)||!ids.has(edge.target))throw new CanvasConflictError("画布连接包含重复或失效节点");edgeIds.add(edge.id);}
  return doc;
 }
 return {
  async assertFrozenGenerationInput(ctx:RequestContext,input:{attemptId:string;inputData:unknown;taskId?:string},transaction:Db=db){
   const [row]=await transaction.select().from(canvasGenerationLinks).where(and(eq(canvasGenerationLinks.attemptId,input.attemptId),eq(canvasGenerationLinks.userId,ctx.userId),eq(canvasGenerationLinks.accountId,account(ctx))));
   if(!row)throw new OwnershipError("画布生成预约不存在");
   const frozen=frozenInput(row);
   if(JSON.stringify(frozenTaskInputSchema.parse(input.inputData))!==JSON.stringify(frozen)||input.taskId&&row.taskId&&row.taskId!==input.taskId)throw new CanvasConflictError("生成输入或原任务与原提交不符");
  },
  async capabilities(ctx:RequestContext){account(ctx);const modes=["text_to_image","image_to_image","text_to_video","image_to_video"] as const;
   return {modes:await Promise.all(modes.map(async mode=>{
    const capability=capabilityForAssetMode(mode);
    if(!deps.resolveCapability)return {mode,available:false,model:null,reason:"生成模型尚未配置"};
    try{const spec=await deps.resolveCapability(ctx,capability);
     const supported=supportsAssetGenerationMode(spec,mode);
     return {mode,available:supported,model:spec.model,reason:supported?null:"当前模型渠道不支持该模式"};
    }catch{return {mode,available:false,model:null,reason:"当前账号尚未配置可用模型"};}
   }))};
  },
  async list(ctx:RequestContext){const rows=await db.select().from(creativeCanvases).where(and(eq(creativeCanvases.userId,ctx.userId),eq(creativeCanvases.accountId,account(ctx)),isNull(creativeCanvases.archivedAt))).orderBy(desc(creativeCanvases.updatedAt));return Promise.all(rows.map(row=>visibleCanvas(ctx,row)));},
  async get(ctx:RequestContext,id:string){return visibleCanvas(ctx,await requireCanvas(ctx,id));},
  async create(ctx:RequestContext,input:{title:string;projectId?:string|null}){
   const accountId=account(ctx);return db.transaction(async transaction=>{const tx=transaction as unknown as Db;if(input.projectId)await deps.assertProject(ctx,input.projectId,tx,true);
   const stamp=now(),id=randomUUID();
   const [row]=await tx.insert(creativeCanvases).values({id,userId:ctx.userId,accountId,title:input.title.trim(),projectId:input.projectId??null,documentJson:emptyCanvasDocument,revision:1,createdAt:stamp,updatedAt:stamp}).returning();
   return project(row!);});
  },
  async save(ctx:RequestContext,id:string,input:{expectedRevision:number;document:unknown;title?:string;projectId?:string|null}){
   return db.transaction(async transaction=>{
    const tx=transaction as unknown as Db;
    // 原项目根锁先于画布锁；每个依赖都显式使用同事务owner。
    const [before]=await tx.select().from(creativeCanvases).where(owned(ctx,id));
    if(!before)throw new OwnershipError("画布不存在");
    for(const projectId of [...new Set([before.projectId,input.projectId].filter((value):value is string=>Boolean(value)))].sort())await deps.assertProject(ctx,projectId,tx,true);
    const [row]=await tx.select().from(creativeCanvases).where(owned(ctx,id)).for("update");
    if(!row)throw new OwnershipError("画布不存在");
    if(row.projectId!==before.projectId)throw new CanvasConflictError("画布关联作品已变化，请重试");
    if(row.revision!==input.expectedRevision)throw new CanvasConflictError("画布已在其他窗口更新，请重新载入后再保存");
    const doc=await validateDocument(ctx,input.document,tx);
    const [saved]=await tx.update(creativeCanvases).set({documentJson:doc,title:input.title?.trim()??row.title,projectId:input.projectId===undefined?row.projectId:input.projectId,revision:row.revision+1,updatedAt:now()}).where(owned(ctx,id)).returning();
    return project(saved!);
   });
  },
  async archive(ctx:RequestContext,id:string){const [row]=await db.update(creativeCanvases).set({archivedAt:now(),updatedAt:now()}).where(owned(ctx,id)).returning();if(!row)throw new OwnershipError("画布不存在");return project(row);},
  async previewNode(ctx:RequestContext,id:string,nodeId:string){
   const canvas=await requireCanvas(ctx,id),doc=canvasDocumentSchema.parse(canvas.documentJson);
   const node=doc.nodes.find(value=>value.id===nodeId);
   if(!node||(node.type!=="image"&&node.type!=="video")||!node.fileId)throw new OwnershipError("画布媒体节点不存在");
   const file=await deps.assertMediaAsset(ctx,node.assetId,node.type,node.fileId,db);
   if(node.checksum&&file.checksum!==node.checksum)throw new CanvasConflictError("画布素材文件校验已变化");
   return deps.getMediaFileDownloadUrl(ctx,node.assetId,node.fileId);
  },
  async listProposals(ctx:RequestContext,id:string){await requireCanvas(ctx,id);return (await db.select().from(canvasAgentProposals).where(and(eq(canvasAgentProposals.userId,ctx.userId),eq(canvasAgentProposals.accountId,account(ctx)),eq(canvasAgentProposals.canvasId,id))).orderBy(desc(canvasAgentProposals.createdAt))).map(proposal);},
  async propose(ctx:RequestContext,id:string,baseRevision:number,raw:unknown){
   const canvas=await requireCanvas(ctx,id),operations=z.array(canvasProposalOperationSchema).min(1).max(100).parse(raw);
   if(canvas.revision!==baseRevision)throw new CanvasConflictError("画布版本已变化，请先重新读取");
   if(new Set(operations.map(operation=>operation.operationId)).size!==operations.length)throw new CanvasConflictError("候选操作 ID 重复");
   const stamp=now(),expiresAt=new Date(Date.parse(stamp)+24*60*60*1000).toISOString();
   const [row]=await db.insert(canvasAgentProposals).values({id:randomUUID(),userId:ctx.userId,accountId:account(ctx),canvasId:id,baseRevision,operationsJson:operations,status:"pending",appliedRevision:null,createdAt:stamp,expiresAt}).returning();
   return proposal(row!);
  },
  async applyProposal(ctx:RequestContext,id:string,proposalId:string,expectedRevision:number){
   const accountId=account(ctx);
   return db.transaction(async transaction=>{
    const tx=transaction as unknown as Db;
    const [before]=await tx.select().from(creativeCanvases).where(owned(ctx,id));
    if(!before)throw new OwnershipError("画布不存在");
    if(before.projectId)await deps.assertProject(ctx,before.projectId,tx,true);
    const [canvas]=await tx.select().from(creativeCanvases).where(owned(ctx,id)).for("update");
    if(!canvas)throw new OwnershipError("画布不存在");
    if(canvas.projectId!==before.projectId)throw new CanvasConflictError("画布关联作品已变化，请重试");
    const [candidate]=await tx.select().from(canvasAgentProposals).where(and(eq(canvasAgentProposals.id,proposalId),eq(canvasAgentProposals.userId,ctx.userId),eq(canvasAgentProposals.accountId,accountId),eq(canvasAgentProposals.canvasId,id))).for("update");
    if(!candidate)throw new OwnershipError("画布建议不存在");
    if(candidate.status==="applied"&&candidate.appliedCanvasJson)return creativeCanvasResource.parse(candidate.appliedCanvasJson);
    if(candidate.status!=="pending"||Date.parse(candidate.expiresAt)<=Date.parse(now()))throw new CanvasConflictError("画布建议已失效，请重新生成");
    if(canvas.revision!==expectedRevision||candidate.baseRevision!==canvas.revision)throw new CanvasConflictError("画布已更新，请重新查看建议");
    const doc=canvasDocumentSchema.parse(canvas.documentJson),nodes=[...doc.nodes],edges=[...doc.edges],idMap=new Map<string,string>();
    const resolve=(value:string)=>idMap.get(value)??value;
    for(const operation of z.array(canvasProposalOperationSchema).parse(candidate.operationsJson) as ProposalOperation[]){
     switch(operation.type){
      case "addNode":{
       if(idMap.has(operation.tempId))throw new CanvasConflictError("候选节点引用重复");
       const node={...operation.node,id:randomUUID()} as CanvasNode;idMap.set(operation.tempId,node.id);nodes.push(node);break;
      }
      case "updateNode":{
       const index=nodes.findIndex(node=>node.id===resolve(operation.nodeId));if(index<0)throw new CanvasConflictError("建议引用的节点已不存在");
       const old=nodes[index]!;if((operation.patch.text!==undefined&&old.type!=="text")||(operation.patch.prompt!==undefined&&old.type!=="image_generation"&&old.type!=="video_generation"))throw new CanvasConflictError("建议修改与节点类型不符");
       const patch={...operation.patch};
       const updated={...old,...patch} as CanvasNode;
       if(patch.referenceAssetId===null){delete (updated as {referenceAssetId?:string}).referenceAssetId;delete (updated as {referenceFileId?:string}).referenceFileId;}
       if(patch.referenceFileId===null)delete (updated as {referenceFileId?:string}).referenceFileId;
       nodes[index]=updated;break;
      }
      case "moveNode":{const index=nodes.findIndex(node=>node.id===resolve(operation.nodeId));if(index<0)throw new CanvasConflictError("建议引用的节点已不存在");nodes[index]={...nodes[index]!,position:operation.position};break;}
      case "deleteNode":{const target=resolve(operation.nodeId),index=nodes.findIndex(node=>node.id===target);if(index<0)throw new CanvasConflictError("建议引用的节点已不存在");nodes.splice(index,1);for(let i=edges.length-1;i>=0;i--)if(edges[i]!.source===target||edges[i]!.target===target)edges.splice(i,1);break;}
      case "connect":{edges.push({id:randomUUID(),source:resolve(operation.source),target:resolve(operation.target),...(operation.label?{label:operation.label}:{})});break;}
      case "disconnect":{const index=edges.findIndex(edge=>edge.id===resolve(operation.edgeId));if(index<0)throw new CanvasConflictError("建议引用的连接已不存在");edges.splice(index,1);break;}
     }
    }
    const valid=await validateDocument(ctx,{...doc,nodes,edges},tx);
    const stamp=now();
    const [saved]=await tx.update(creativeCanvases).set({documentJson:valid,revision:canvas.revision+1,updatedAt:stamp}).where(owned(ctx,id)).returning();
    await tx.update(canvasAgentProposals).set({status:"applied",appliedRevision:saved!.revision,appliedCanvasJson:project(saved!)}).where(eq(canvasAgentProposals.id,proposalId));
    return project(saved!);
   });
  },
  async getGenerationMaterial(ctx:RequestContext,canvasId:string,generationLinkId:string){
   return db.transaction(async transaction=>{
    const tx=transaction as unknown as Db;
    const [canvas]=await tx.select().from(creativeCanvases).where(owned(ctx,canvasId));
    if(!canvas)throw new OwnershipError("画布不存在");
    const [row]=await tx.select().from(canvasGenerationLinks).where(and(eq(canvasGenerationLinks.id,generationLinkId),eq(canvasGenerationLinks.canvasId,canvasId),eq(canvasGenerationLinks.userId,ctx.userId),eq(canvasGenerationLinks.accountId,account(ctx))));
    if(!row)throw new OwnershipError("画布生成记录不存在");
    const anchor={canvasId,generationLinkId,nodeId:row.nodeId,attemptId:row.attemptId,inputRevision:row.inputRevision,inputDigest:row.inputDigest,taskId:row.taskId};
    const unavailable=(status:"not_ready"|"unverifiable",reason:string)=>canvasMaterialSelectionResource.parse({status,...anchor,reason});
    if(!row.taskId)return unavailable("not_ready","原任务尚未绑定，请恢复原生成请求");
    const task=await deps.readTask(ctx,row.taskId,tx);
    if(!task||task.id!==row.taskId||task.userId!==ctx.userId||task.taskType!=="asset.generate"||task.attemptId!==row.attemptId)return unavailable("unverifiable","原生成任务身份与预约不符");
    try{await this.assertFrozenGenerationInput(ctx,{attemptId:row.attemptId,inputData:task.inputData,taskId:task.id},tx);}catch(error){if(error instanceof CanvasConflictError||error instanceof z.ZodError)return unavailable("unverifiable","原生成输入与预约不符");throw error;}
    const frozen=frozenInput(row);
    if(Object.prototype.hasOwnProperty.call(frozen,"projectId")&&task.projectId!==frozen.projectId)return unavailable("unverifiable","原任务项目与冻结预约不符");
    const results=(await deps.readTaskResults(ctx,task.id,tx)).filter(value=>value.resultType==="generated_asset"&&typeof value.assetId==="string"&&value.assetId.length>0);
    if(results.length===0)return unavailable("not_ready","原生成任务尚无素材结果");
    if(results.length!==1||!results[0]!.id)return unavailable("unverifiable","原生成任务缺少唯一可追溯结果");
    const result=results[0]!;
    if(row.resultAssetId&&row.resultAssetId!==result.assetId)return unavailable("unverifiable","历史预约与原素材结果不符");
    if(!deps.getCommittedAssetResult)return unavailable("unverifiable","精确生成文件证明端口未装配");
    const checked=await deps.getCommittedAssetResult(ctx,{taskId:task.id,resultId:result.id!},tx);
    if(checked.status!=="verified")return unavailable("unverifiable",checked.reason);
    const proof=committedGeneratedAssetProof.parse(checked.proof);
    if(proof.taskId!==task.id||proof.resultId!==result.id||proof.receipt.assetId!==result.assetId||proof.receipt.assetType!==frozen.kind)return unavailable("unverifiable","原生成文件证明身份不符");
    return canvasMaterialSelectionResource.parse({status:"available",phase:proof.taskStatus==="succeeded"?"confirmed":"candidate",origin:{canvasId,generationLinkId,nodeId:row.nodeId,attemptId:row.attemptId,inputRevision:row.inputRevision,inputDigest:row.inputDigest,taskId:task.id,resultId:result.id!,executionTaskId:proof.executionTaskId,callId:proof.callId},file:{assetId:proof.receipt.assetId,assetFileId:proof.receipt.fileId},checksum:proof.receipt.checksum,assetType:proof.receipt.assetType,name:proof.receipt.name,assetStatus:proof.assetStatus,taskStatus:proof.taskStatus});
   });
  },
  async listTasks(ctx:RequestContext,id:string){await requireCanvas(ctx,id);
   const rows=await db.select().from(canvasGenerationLinks).where(and(eq(canvasGenerationLinks.userId,ctx.userId),eq(canvasGenerationLinks.accountId,account(ctx)),eq(canvasGenerationLinks.canvasId,id))).orderBy(desc(canvasGenerationLinks.createdAt));
   return Promise.all(rows.map(async row=>{
    if(!row.taskId)return link(row);
    const task=await deps.readTask(ctx,row.taskId,db);
    if(!task||task.id!==row.taskId||task.userId!==ctx.userId||task.taskType!=="asset.generate")throw new OwnershipError("原生成任务不存在");
    if(task.attemptId!==row.attemptId)throw new CanvasConflictError("原生成任务请求与预约不符");
    await this.assertFrozenGenerationInput(ctx,{attemptId:row.attemptId,inputData:task.inputData,taskId:task.id},db);
    const input=frozenInput(row);
    if(Object.prototype.hasOwnProperty.call(input,"projectId")&&task.projectId!==input.projectId)throw new CanvasConflictError("原生成任务项目与预约不符");
    const results=(await deps.readTaskResults(ctx,row.taskId,db)).filter(value=>value.resultType==="generated_asset"&&typeof value.assetId==="string"&&value.assetId.length>0);
    if(results.length>1)throw new CanvasConflictError("原生成任务有多个素材结果，不能自动选择");
    const result=results[0];
    if(row.resultAssetId&&row.resultAssetId!==result?.assetId)throw new CanvasConflictError("原生成结果与历史预约不符");
    // GET只投影原owner结果，绝不更新预约或伪造历史文件身份。
    return link(result?.assetId?{...row,resultAssetId:result.assetId}:row);
   }));
  },
  async generate(ctx:RequestContext,canvasId:string,nodeId:string,input:{expectedRevision:number;attemptId:string}){
   const accountId=account(ctx);
   const [existing]=await db.select().from(canvasGenerationLinks).where(eq(canvasGenerationLinks.attemptId,input.attemptId));
   if(existing && (existing.userId!==ctx.userId||existing.accountId!==accountId||existing.canvasId!==canvasId||existing.nodeId!==nodeId))throw new OwnershipError("生成请求不存在");
   if(existing){await requireCanvas(ctx,canvasId);if(existing.inputRevision!==input.expectedRevision)throw new CanvasConflictError("生成请求版本与原提交不符");}
   let reservation=existing;
   if(!reservation){
    const canvas=await requireCanvas(ctx,canvasId);
    if(canvas.revision!==input.expectedRevision)throw new CanvasConflictError("画布已更新，请保存当前节点后再生成");
    const doc=canvasDocumentSchema.parse(canvas.documentJson),node=doc.nodes.find(value=>value.id===nodeId);
    if(!node || (node.type!=="image_generation"&&node.type!=="video_generation"))throw new OwnershipError("生成节点不存在");
    const config=node as GenerationNode;
    if(!config.prompt.trim())throw new CanvasConflictError("请先填写生成描述");
    if(!deps.resolveCapability)throw new CanvasConflictError("生成模型尚未配置");
    const spec=await deps.resolveCapability(ctx,capabilityForAssetMode(config.mode));
    if(!supportsAssetGenerationMode(spec,config.mode))throw new CanvasConflictError("当前模型渠道不支持该生成模式");
    const parameterError=assetGenerationParameterError(spec,config.mode,config);
    if(parameterError)throw new CanvasConflictError(parameterError);
    if(config.mode.startsWith("image_to_")&&!config.referenceAssetId)throw new CanvasConflictError("请先选择参考图片");
    let reference:Reference|null=null;
    if(config.referenceAssetId){
     reference=await deps.getReference(ctx,config.referenceAssetId,config.referenceFileId);
     if(!reference)throw new OwnershipError("参考图片不存在");
     if(config.referenceFileId&&reference.fileId!==config.referenceFileId)throw new CanvasConflictError("参考图片未读回所指定的精确文件");
     if(!referenceImageAllowed(spec,config.mode,reference.mimeType,reference.bytes)||createHash("sha256").update(reference.bytes).digest("hex")!==reference.checksum)throw new CanvasConflictError("参考图片格式、尺寸、大小或校验不符合生成要求");
    }
    const kind=config.type==="image_generation"?"image":"video";
    const taskInput:CanvasTaskInput={projectId:canvas.projectId,kind,mode:config.mode,prompt:config.prompt,...(config.aspectRatio?{aspectRatio:config.aspectRatio}:{}),...(kind==="video"?{durationSec:config.durationSec??6,resolution:config.resolution??"768P"}:{}),...(reference&&config.referenceAssetId?{referenceAssetId:config.referenceAssetId,referenceFileId:reference.fileId,referenceChecksum:reference.checksum}:{}),canvasOwner:{accountId,canvasId,nodeId,inputDigest:""}};
    const digest=createHash("sha256").update(JSON.stringify([canvas.revision,nodeId,taskInput])).digest("hex");taskInput.canvasOwner.inputDigest=digest;
    const stamp=now();
    reservation=await db.transaction(async transaction=>{
     const tx=transaction as unknown as Db;
     if(canvas.projectId)await deps.assertProject(ctx,canvas.projectId,tx,true);
     const [current]=await tx.select({revision:creativeCanvases.revision,projectId:creativeCanvases.projectId}).from(creativeCanvases).where(owned(ctx,canvasId)).for("update");
     if(!current||current.revision!==canvas.revision||current.projectId!==canvas.projectId)throw new CanvasConflictError("画布在提交生成前已更新，请重新保存后再生成");
     const [inserted]=await tx.insert(canvasGenerationLinks).values({id:randomUUID(),userId:ctx.userId,accountId,canvasId,nodeId,attemptId:input.attemptId,taskId:null,inputRevision:canvas.revision,inputDigest:digest,inputJson:taskInput,referenceFileId:reference?.fileId??null,referenceChecksum:reference?.checksum??null,resultAssetId:null,createdAt:stamp,updatedAt:stamp}).onConflictDoNothing().returning();
     return inserted;
    });
    if(!reservation){const [winner]=await db.select().from(canvasGenerationLinks).where(eq(canvasGenerationLinks.attemptId,input.attemptId));if(!winner||winner.userId!==ctx.userId||winner.accountId!==accountId||winner.canvasId!==canvasId||winner.nodeId!==nodeId)throw new OwnershipError("生成请求不存在");if(winner.inputRevision!==input.expectedRevision)throw new CanvasConflictError("生成请求版本与原提交不符");reservation=winner;}
   }
   if(!reservation)throw new CanvasConflictError("生成请求未预留");
   const taskInput=frozenInput(reservation);
   if(taskInput.canvasOwner.inputDigest!==reservation.inputDigest)throw new CanvasConflictError("生成输入与原提交不符");
   // Known link re-reads the original task; only an unknown submission invokes the original idempotent attempt again.
   const task=reservation.taskId?{id:reservation.taskId}:await deps.submitTask(ctx,{attemptId:reservation.attemptId,inputData:taskInput});
   const original=await deps.readTask(ctx,task.id,db);
   if(!original||original.id!==task.id||original.userId!==ctx.userId||original.taskType!=="asset.generate")throw new OwnershipError("原生成任务不存在");
   if(original.attemptId!==reservation.attemptId||Object.prototype.hasOwnProperty.call(taskInput,"projectId")&&original.projectId!==taskInput.projectId)throw new CanvasConflictError("原生成任务请求或项目与预约不符");
   await this.assertFrozenGenerationInput(ctx,{attemptId:reservation.attemptId,inputData:original.inputData,taskId:original.id},db);
   if(reservation.taskId && reservation.taskId!==task.id)throw new CanvasConflictError("生成任务与原请求不符");
   if(reservation.taskId)return link(reservation);
   const [saved]=await db.update(canvasGenerationLinks).set({taskId:task.id,updatedAt:now()}).where(and(eq(canvasGenerationLinks.id,reservation.id),eq(canvasGenerationLinks.accountId,accountId),eq(canvasGenerationLinks.userId,ctx.userId))).returning();
   return link(saved!);
  },
 };
}
