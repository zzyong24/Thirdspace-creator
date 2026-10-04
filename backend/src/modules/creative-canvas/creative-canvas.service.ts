import {isDeepStrictEqual} from "node:util";
import {createHash,randomUUID} from "node:crypto";
import {and,desc,eq,isNull} from "drizzle-orm";
import {canvasDocumentSchema,canvasProposalOperationSchema,creativeCanvasResource,emptyCanvasDocument,type CanvasDocument,type CanvasNode,type RequestContext,ErrorCode} from "@creatoros/contract";
import {executionTasks,executionCalls,aiTaskResults,aiTasks,canvasAgentProposals,canvasGenerationLinks,creativeCanvases,requireAccountId,OwnershipError,type Db} from "@creatoros/backend";
import {z} from "zod";
import {supportsAssetGenerationMode,capabilityForAssetMode,referenceImageAllowed,assetGenerationParameterError,assetGenerationAspectRatios} from "../ai-runtime/asset-generation-modes";

type CanvasRow=typeof creativeCanvases.$inferSelect;
type LinkRow=typeof canvasGenerationLinks.$inferSelect;
type GenerationNode=Extract<CanvasNode,{type:"image_generation"|"video_generation"}>;
type ProposalOperation=z.infer<typeof canvasProposalOperationSchema>;
type Reference={fileId:string;checksum:string;mimeType:string;bytes:Uint8Array};
type TaskInput={kind:"image"|"video";mode:"text_to_image"|"image_to_image"|"text_to_video"|"image_to_video";prompt:string;visualMode?:"real_person"|"photo_product"|"graphic"|"ai_concept";templateId?:string;templateVersion?:number;aspectRatio?:string;durationSec?:number;resolution?:"768P"|"2K";referenceAssetId?:string;referenceFileId?:string;referenceChecksum?:string;canvasOwner:{accountId:string;canvasId:string;nodeId:string;inputDigest:string}};
// SEMANTIC_BOUNDARY_ALLOW: 冻结字段顺序仅恢复历史JSON摘要；JSONB回读的键顺序不代表内容变化。
function canvasInputDigest(revision:number,nodeId:string,input:TaskInput){
 const ordered={kind:input.kind,mode:input.mode,prompt:input.prompt,...(input.visualMode?{visualMode:input.visualMode}:{}),...(input.templateId?{templateId:input.templateId}:{}),...(input.templateVersion?{templateVersion:input.templateVersion}:{}),...(input.aspectRatio?{aspectRatio:input.aspectRatio}:{}),...(input.kind==="video"?{durationSec:input.durationSec??6,resolution:input.resolution??"768P"}:{}),...(input.referenceAssetId?{referenceAssetId:input.referenceAssetId,referenceFileId:input.referenceFileId,referenceChecksum:input.referenceChecksum}:{}),canvasOwner:{accountId:input.canvasOwner.accountId,canvasId:input.canvasOwner.canvasId,nodeId:input.canvasOwner.nodeId,inputDigest:""}};
 return createHash("sha256").update(JSON.stringify([revision,nodeId,ordered])).digest("hex");
}
class CanvasConflictError extends Error {readonly code=ErrorCode.ConflictError;constructor(message:string){super(message);this.name="ConflictError";}}
function account(ctx:RequestContext){return requireAccountId(ctx.accountId,"creativeCanvas");}
function owned(ctx:RequestContext,id:string){return and(eq(creativeCanvases.id,id),eq(creativeCanvases.userId,ctx.userId),eq(creativeCanvases.accountId,account(ctx)),isNull(creativeCanvases.archivedAt));}
function project(row:CanvasRow){const {documentJson,...visible}=row;return {...visible,document:canvasDocumentSchema.parse(documentJson)};}
function link(row:LinkRow){const {userId:_userId,accountId:_accountId,inputJson,...visible}=row;return {...visible,mediaKind:(inputJson as TaskInput).kind};}
function proposal(row:typeof canvasAgentProposals.$inferSelect){const {userId:_userId,accountId:_accountId,operationsJson,...visible}=row;return {...visible,operations:z.array(canvasProposalOperationSchema).parse(operationsJson)};}

export interface CanvasMaterialSelection {nodeId:string;taskId?:string;resultId?:string;}
export interface CanvasMaterialPage extends CanvasMaterialSelection {assetId:string;fileId?:string;checksum?:string;}
export interface CanvasMaterialPlan {canvasId:string;projectId:string|null;revision:number;group:{id:string;libraryKind:"cover"|"xhs";caption:string;aspectRatio:string;pageOrder:string[]};pages:CanvasMaterialPage[];}
export function createCreativeCanvasService(db:Db,deps:{
 now?:()=>string;
 assertProject:(ctx:RequestContext,id:string)=>Promise<void>;
 assertMediaAsset:(ctx:RequestContext,id:string,type:"image"|"video",fileId?:string)=>Promise<{fileId:string;checksum:string}>;
 assertReferenceAsset:(ctx:RequestContext,id:string)=>Promise<void>;
 getMediaFileDownloadUrl:(ctx:RequestContext,assetId:string,fileId:string)=>Promise<{url:string;fileName:string}>;
 getReference:(ctx:RequestContext,id:string,fileId?:string)=>Promise<Reference|null>;
 submitTask:(ctx:RequestContext,input:{attemptId:string;inputData:TaskInput})=>Promise<{id:string}>;
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
 function pruneGroups(doc:CanvasDocument):CanvasDocument {
  if(!doc.visualGroups)return doc;
  const ids=new Set(doc.nodes.map(node=>node.id));
  return {...doc,visualGroups:doc.visualGroups.map(group=>{const pageOrder=group.pageOrder.filter(id=>ids.has(id));return {...group,pageOrder,generationAttempts:Object.fromEntries(Object.entries(group.generationAttempts).filter(([id])=>pageOrder.includes(id)))};}).filter(group=>group.pageOrder.length>0)};
 }
 async function validateDocument(ctx:RequestContext,raw:unknown):Promise<CanvasDocument>{
  const doc=canvasDocumentSchema.parse(raw),ids=new Set<string>(),edgeIds=new Set<string>();
  for(const node of doc.nodes){
   if(ids.has(node.id))throw new CanvasConflictError("画布节点 ID 重复");ids.add(node.id);
   if(node.type==="image"||node.type==="video"){
    const file=await deps.assertMediaAsset(ctx,node.assetId,node.type,node.fileId);
    if(node.checksum&&node.checksum!==file.checksum)throw new CanvasConflictError("画布素材文件校验已变化");
    node.fileId=file.fileId;node.checksum=file.checksum;
   }
   if(node.type==="image_generation"&&node.visualMode==="real_person"&&(node.mode!=="image_to_image"||!node.referenceAssetId))throw new CanvasConflictError("真人身份需要当前用户的参考图与图生图模式");
   if((node.type==="image_generation"||node.type==="video_generation")&&node.referenceAssetId)await deps.assertReferenceAsset(ctx,node.referenceAssetId);
  }
  for(const edge of doc.edges){if(edgeIds.has(edge.id)||!ids.has(edge.source)||!ids.has(edge.target))throw new CanvasConflictError("画布连接包含重复或失效节点");edgeIds.add(edge.id);}
  const groupIds=new Set<string>(),groupNodes=new Set<string>(),attempts=new Set<string>();
  for(const group of doc.visualGroups??[]){
   if(groupIds.has(group.id))throw new CanvasConflictError("页组 ID 重复");groupIds.add(group.id);
   for(const nodeId of group.pageOrder){
    const node=doc.nodes.find(node=>node.id===nodeId);
    if(!node||!['image','image_generation'].includes(node.type)||groupNodes.has(nodeId))throw new CanvasConflictError("页组引用失效、重复或跨组节点");groupNodes.add(nodeId);
    if(node.type==="image_generation"){
     if((group.templateSnapshot.requiredIdentity||group.templateSnapshot.visualMode==="real_person")&&(node.mode!=="image_to_image"||!node.referenceAssetId))throw new CanvasConflictError("模板身份需要当前用户的参考图与图生图模式");
     if(node.aspectRatio&&node.aspectRatio!==group.aspectRatio)throw new CanvasConflictError("页组与节点画幅不一致");
    }
   }
   for(const [nodeId,attempt] of Object.entries(group.generationAttempts)){
    if(!group.pageOrder.includes(nodeId)||attempts.has(attempt))throw new CanvasConflictError("页组生成尝试引用失效或重复");attempts.add(attempt);
   }
  }
  return doc;
 }
 async function verifyGeneratedPage(ctx:RequestContext,canvas:CanvasRow,node:GenerationNode,selection:CanvasMaterialSelection,settled=false):Promise<CanvasMaterialPage>{
  if(!selection.taskId||!selection.resultId)throw new CanvasConflictError("生成页必须选择原任务的真实候选");
  const [source]=await db.select().from(canvasGenerationLinks).where(and(eq(canvasGenerationLinks.canvasId,canvas.id),eq(canvasGenerationLinks.nodeId,node.id),eq(canvasGenerationLinks.taskId,selection.taskId),eq(canvasGenerationLinks.userId,ctx.userId),eq(canvasGenerationLinks.accountId,account(ctx))));
  const [task]=await db.select().from(aiTasks).where(and(eq(aiTasks.id,selection.taskId),eq(aiTasks.userId,ctx.userId),eq(aiTasks.accountId,account(ctx))));
  const [result]=await db.select().from(aiTaskResults).where(and(eq(aiTaskResults.id,selection.resultId),eq(aiTaskResults.aiTaskId,selection.taskId)));
  if(!source||!task||!result?.assetId||task.taskType!=="asset.generate"||result.resultType!=="generated_asset"||source.inputRevision>canvas.revision)throw new OwnershipError("生成候选不属于当前画布节点");
  if(!["awaiting_confirmation","succeeded"].includes(task.status)||(settled&&task.status!=="succeeded"))throw new CanvasConflictError("生成候选尚未完成或采纳");
  const input=source.inputJson as TaskInput,business=task.inputData as TaskInput;
  // SEMANTIC_BOUNDARY_ALLOW: 精确比较原生成协议输入与用户当前选择，仅守来源身份和版本边界。
  const digest=canvasInputDigest(source.inputRevision,node.id,input);
  if(input.kind!=="image"||digest!==source.inputDigest||business.canvasOwner?.accountId!==account(ctx)||business.canvasOwner?.canvasId!==canvas.id||business.canvasOwner?.nodeId!==node.id||business.canvasOwner?.inputDigest!==source.inputDigest||!isDeepStrictEqual(business,input))throw new CanvasConflictError("生成任务与原画布输入不符");
  if(input.prompt!==node.prompt||input.mode!==node.mode||(input.referenceAssetId??null)!==(node.referenceAssetId??null)||(input.aspectRatio??null)!==(node.aspectRatio??null)||(input.visualMode??null)!==(node.visualMode??null)||(input.templateId??null)!==(node.templateId??null)||(input.templateVersion??null)!==(node.templateVersion??null))throw new CanvasConflictError("节点内容已修改，请选择当前输入生成的候选");
  if(!task.executionTaskId||!result.executionCallId)throw new CanvasConflictError("生成候选缺少执行回执");
  const [execution]=await db.select().from(executionTasks).where(and(eq(executionTasks.id,task.executionTaskId),eq(executionTasks.userId,ctx.userId),eq(executionTasks.accountId,account(ctx)),eq(executionTasks.ownerId,task.id)));
  const [call]=await db.select().from(executionCalls).where(and(eq(executionCalls.id,result.executionCallId),eq(executionCalls.executionTaskId,task.executionTaskId)));
  if(execution?.kind!=="ai_task"||execution.ownerType!=="ai_task"||execution.status!=="succeeded"||call?.status!=="settled"||call.resultRef!==result.id||!call.resultText)throw new CanvasConflictError("生成候选缺少原结算回执");
  const receipt=JSON.parse(call.resultText) as {assetId?:string;assetType?:string;fileId?:string;checksum?:string};
  const data=result.resultData as {assetId?:string;assetType?:string};
  if(receipt.assetId!==result.assetId||data.assetId!==result.assetId||receipt.assetType!=="image"||data.assetType!=="image"||!receipt.fileId||!receipt.checksum)throw new CanvasConflictError("候选素材与原结算产物不符");
  return {nodeId:node.id,taskId:task.id,resultId:result.id,assetId:result.assetId,fileId:receipt.fileId,checksum:receipt.checksum};
 }
 return {
  async resolveMaterialSelections(ctx:RequestContext,canvasId:string,input:{expectedRevision:number;groupId:string;selections:CanvasMaterialSelection[]}):Promise<CanvasMaterialPlan>{
   const canvas=await requireCanvas(ctx,canvasId);
   if(canvas.revision!==input.expectedRevision)throw new CanvasConflictError("画布版本已变化，请重新选择候选");
   if(canvas.projectId)await deps.assertProject(ctx,canvas.projectId);
   const document=canvasDocumentSchema.parse(canvas.documentJson),group=document.visualGroups?.find(group=>group.id===input.groupId);
   if(!group)throw new OwnershipError("画布页组不存在");
   const selected=new Map(input.selections.map(selection=>[selection.nodeId,selection]));
   if(!selected.size||selected.size!==input.selections.length||!selected.has(group.pageOrder[0]!)||input.selections.some(selection=>!group.pageOrder.includes(selection.nodeId)))throw new CanvasConflictError("所选页必须包含封面且属于当前页组");
   const pages:CanvasMaterialPage[]=[];
   for(const nodeId of group.pageOrder){const selection=selected.get(nodeId);if(!selection)continue;const node=document.nodes.find(node=>node.id===nodeId);
    if(node?.type==="image_generation")pages.push(await verifyGeneratedPage(ctx,canvas,node,selection));
    else if(node?.type==="image"&&node.fileId&&node.checksum){if(selection.taskId||selection.resultId)throw new CanvasConflictError("用户原图不能冒充生成结果");const file=await deps.assertMediaAsset(ctx,node.assetId,"image",node.fileId);if(file.fileId!==node.fileId||file.checksum!==node.checksum)throw new CanvasConflictError("原图文件版本已变化");pages.push({nodeId,assetId:node.assetId,fileId:file.fileId,checksum:file.checksum});}
    else throw new CanvasConflictError("页组图片或冻结原图不存在");
   }
   return {canvasId,projectId:canvas.projectId,revision:canvas.revision,group:{id:group.id,libraryKind:group.libraryKind,caption:group.caption,aspectRatio:group.aspectRatio,pageOrder:group.pageOrder},pages};
  },
  async verifyMaterialSettlement(ctx:RequestContext,plan:CanvasMaterialPlan){
   const canvas=await requireCanvas(ctx,plan.canvasId);
   if(canvas.revision!==plan.revision||canvas.projectId!==plan.projectId)throw new CanvasConflictError("采纳期间画布版本已变化");
   const doc=canvasDocumentSchema.parse(canvas.documentJson);
   for(const page of plan.pages){if(!page.taskId)continue;const node=doc.nodes.find(node=>node.id===page.nodeId);if(node?.type!=="image_generation")throw new CanvasConflictError("生成节点已变化");const verified=await verifyGeneratedPage(ctx,canvas,node,page,true);if(!isDeepStrictEqual(verified,page))throw new CanvasConflictError("采纳产物与所选原候选不符");}
  },
  async capabilities(ctx:RequestContext){account(ctx);const modes=["text_to_image","image_to_image","text_to_video","image_to_video"] as const;
   return {modes:await Promise.all(modes.map(async mode=>{
    const capability=capabilityForAssetMode(mode);
    if(!deps.resolveCapability)return {mode,available:false,model:null,reason:"生成模型尚未配置",aspectRatios:undefined};
    try{const spec=await deps.resolveCapability(ctx,capability);
     const supported=supportsAssetGenerationMode(spec,mode);
     return {mode,available:supported,model:spec.model,reason:supported?null:"当前模型渠道不支持该模式",...(supported&&assetGenerationAspectRatios(spec,mode)?{aspectRatios:assetGenerationAspectRatios(spec,mode)}:{})};
    }catch{return {mode,available:false,model:null,reason:"当前账号尚未配置可用模型",aspectRatios:undefined};}
   }))};
  },
  async list(ctx:RequestContext){const rows=await db.select().from(creativeCanvases).where(and(eq(creativeCanvases.userId,ctx.userId),eq(creativeCanvases.accountId,account(ctx)),isNull(creativeCanvases.archivedAt))).orderBy(desc(creativeCanvases.updatedAt));return Promise.all(rows.map(row=>visibleCanvas(ctx,row)));},
  async get(ctx:RequestContext,id:string){return visibleCanvas(ctx,await requireCanvas(ctx,id));},
  async create(ctx:RequestContext,input:{title:string;projectId?:string|null}){
   const accountId=account(ctx);if(input.projectId)await deps.assertProject(ctx,input.projectId);
   const stamp=now(),id=randomUUID();
   const [row]=await db.insert(creativeCanvases).values({id,userId:ctx.userId,accountId,title:input.title.trim(),projectId:input.projectId??null,documentJson:emptyCanvasDocument,revision:1,createdAt:stamp,updatedAt:stamp}).returning();
   return project(row!);
  },
  async save(ctx:RequestContext,id:string,input:{expectedRevision:number;document:unknown;title?:string;projectId?:string|null}){
   const previous=await requireCanvas(ctx,id),raw=canvasDocumentSchema.parse(input.document);
   const doc=await validateDocument(ctx,raw.visualGroups===undefined&&canvasDocumentSchema.parse(previous.documentJson).visualGroups?pruneGroups({...raw,visualGroups:canvasDocumentSchema.parse(previous.documentJson).visualGroups}):raw);
   if(input.projectId)await deps.assertProject(ctx,input.projectId);
   return db.transaction(async tx=>{
    const [row]=await tx.select().from(creativeCanvases).where(owned(ctx,id)).for("update");
    if(!row)throw new OwnershipError("画布不存在");
    if(row.revision!==input.expectedRevision)throw new CanvasConflictError("画布已在其他窗口更新，请重新载入后再保存");
    const [saved]=await tx.update(creativeCanvases).set({documentJson:doc,title:input.title?.trim()??row.title,projectId:input.projectId===undefined?row.projectId:input.projectId,revision:row.revision+1,updatedAt:now()}).where(owned(ctx,id)).returning();
    return project(saved!);
   });
  },
  async archive(ctx:RequestContext,id:string){const [row]=await db.update(creativeCanvases).set({archivedAt:now(),updatedAt:now()}).where(owned(ctx,id)).returning();if(!row)throw new OwnershipError("画布不存在");return project(row);},
  async previewNode(ctx:RequestContext,id:string,nodeId:string){
   const canvas=await requireCanvas(ctx,id),doc=canvasDocumentSchema.parse(canvas.documentJson);
   const node=doc.nodes.find(value=>value.id===nodeId);
   if(!node||(node.type!=="image"&&node.type!=="video")||!node.fileId)throw new OwnershipError("画布媒体节点不存在");
   const file=await deps.assertMediaAsset(ctx,node.assetId,node.type,node.fileId);
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
   {
    const [candidate]=await db.select().from(canvasAgentProposals).where(and(eq(canvasAgentProposals.id,proposalId),eq(canvasAgentProposals.userId,ctx.userId),eq(canvasAgentProposals.accountId,accountId),eq(canvasAgentProposals.canvasId,id)));
    if(!candidate)throw new OwnershipError("画布建议不存在");
    const [canvas]=await db.select().from(creativeCanvases).where(owned(ctx,id));
    if(!canvas)throw new OwnershipError("画布不存在");
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
       if(patch.referenceAssetId===null)delete (updated as {referenceAssetId?:string}).referenceAssetId;
       nodes[index]=updated;break;
      }
      case "moveNode":{const index=nodes.findIndex(node=>node.id===resolve(operation.nodeId));if(index<0)throw new CanvasConflictError("建议引用的节点已不存在");nodes[index]={...nodes[index]!,position:operation.position};break;}
      case "deleteNode":{const target=resolve(operation.nodeId),index=nodes.findIndex(node=>node.id===target);if(index<0)throw new CanvasConflictError("建议引用的节点已不存在");nodes.splice(index,1);for(let i=edges.length-1;i>=0;i--)if(edges[i]!.source===target||edges[i]!.target===target)edges.splice(i,1);break;}
      case "connect":{edges.push({id:randomUUID(),source:resolve(operation.source),target:resolve(operation.target),...(operation.label?{label:operation.label}:{})});break;}
      case "disconnect":{const index=edges.findIndex(edge=>edge.id===resolve(operation.edgeId));if(index<0)throw new CanvasConflictError("建议引用的连接已不存在");edges.splice(index,1);break;}
     }
    }
    const valid=await validateDocument(ctx,pruneGroups({...doc,nodes,edges}));
    // 外部素材端口在事务外验证；进事务后重新锁定版本，避免PGlite自等候。
    return db.transaction(async tx=>{
    const [lockedCandidate]=await tx.select().from(canvasAgentProposals).where(and(eq(canvasAgentProposals.id,proposalId),eq(canvasAgentProposals.userId,ctx.userId),eq(canvasAgentProposals.accountId,accountId),eq(canvasAgentProposals.canvasId,id))).for("update");
    const [lockedCanvas]=await tx.select().from(creativeCanvases).where(owned(ctx,id)).for("update");
    if(!lockedCandidate||!lockedCanvas)throw new OwnershipError("画布建议不存在");
    if(lockedCandidate.status==="applied"&&lockedCandidate.appliedCanvasJson)return creativeCanvasResource.parse(lockedCandidate.appliedCanvasJson);
    if(lockedCandidate.status!=="pending"||Date.parse(lockedCandidate.expiresAt)<=Date.parse(now())||lockedCanvas.revision!==canvas.revision||lockedCandidate.baseRevision!==canvas.revision)throw new CanvasConflictError("画布已更新，请重新查看建议");
    const stamp=now();
    const [saved]=await tx.update(creativeCanvases).set({documentJson:valid,revision:canvas.revision+1,updatedAt:stamp}).where(owned(ctx,id)).returning();
    await tx.update(canvasAgentProposals).set({status:"applied",appliedRevision:saved!.revision,appliedCanvasJson:project(saved!)}).where(eq(canvasAgentProposals.id,proposalId));
    return project(saved!);
   });
   }
  },
  async listTasks(ctx:RequestContext,id:string){await requireCanvas(ctx,id);
   const rows=await db.select().from(canvasGenerationLinks).where(and(eq(canvasGenerationLinks.userId,ctx.userId),eq(canvasGenerationLinks.accountId,account(ctx)),eq(canvasGenerationLinks.canvasId,id))).orderBy(desc(canvasGenerationLinks.createdAt));
   return Promise.all(rows.map(async row=>{
    if(!row.taskId||row.resultAssetId)return link(row);
    const [result]=await db.select({assetId:aiTaskResults.assetId}).from(aiTaskResults).innerJoin(aiTasks,eq(aiTasks.id,aiTaskResults.aiTaskId)).where(and(eq(aiTasks.id,row.taskId),eq(aiTasks.userId,ctx.userId),eq(aiTasks.accountId,account(ctx)),eq(aiTaskResults.aiTaskId,row.taskId))).limit(1);
    if(!result?.assetId)return link(row);
    const [saved]=await db.update(canvasGenerationLinks).set({resultAssetId:result.assetId,updatedAt:now()}).where(and(eq(canvasGenerationLinks.id,row.id),eq(canvasGenerationLinks.accountId,account(ctx)),eq(canvasGenerationLinks.userId,ctx.userId),eq(canvasGenerationLinks.taskId,row.taskId))).returning();
    return link(saved??row);
   }));
  },
  async generate(ctx:RequestContext,canvasId:string,nodeId:string,input:{expectedRevision:number;attemptId:string}){
   const accountId=account(ctx);
   const [existing]=await db.select().from(canvasGenerationLinks).where(eq(canvasGenerationLinks.attemptId,input.attemptId));
   if(existing && (existing.userId!==ctx.userId||existing.accountId!==accountId||existing.canvasId!==canvasId||existing.nodeId!==nodeId))throw new OwnershipError("生成请求不存在");
   if(existing)await requireCanvas(ctx,canvasId);
   let reservation=existing;
   if(!reservation){
    const canvas=await requireCanvas(ctx,canvasId);
    if(canvas.revision!==input.expectedRevision)throw new CanvasConflictError("画布已更新，请保存当前节点后再生成");
    const doc=canvasDocumentSchema.parse(canvas.documentJson),node=doc.nodes.find(value=>value.id===nodeId);
    if(!node || (node.type!=="image_generation"&&node.type!=="video_generation"))throw new OwnershipError("生成节点不存在");
    const config=node as GenerationNode;
    const group=doc.visualGroups?.find(group=>group.pageOrder.includes(nodeId));
    if(group&&group.generationAttempts[nodeId]!==input.attemptId)throw new CanvasConflictError("请先保存当前页的生成尝试再提交");
    if((config.visualMode==="real_person"||group?.templateSnapshot.requiredIdentity||group?.templateSnapshot.visualMode==="real_person")&&(config.mode!=="image_to_image"||!config.referenceAssetId))throw new CanvasConflictError("真人身份需要参考图，不允许降级文生图");
    if(!config.prompt.trim())throw new CanvasConflictError("请先填写生成描述");
    if(!deps.resolveCapability)throw new CanvasConflictError("生成模型尚未配置");
    const spec=await deps.resolveCapability(ctx,capabilityForAssetMode(config.mode));
    if(!supportsAssetGenerationMode(spec,config.mode))throw new CanvasConflictError("当前模型渠道不支持该生成模式");
    const parameterError=assetGenerationParameterError(spec,config.mode,config);
    if(parameterError)throw new CanvasConflictError(parameterError);
    if(config.mode.startsWith("image_to_")&&!config.referenceAssetId)throw new CanvasConflictError("请先选择参考图片");
    let reference:Reference|null=null;
    if(config.referenceAssetId){
     reference=await deps.getReference(ctx,config.referenceAssetId);
     if(!reference)throw new OwnershipError("参考图片不存在");
     if(!referenceImageAllowed(spec,config.mode,reference.mimeType,reference.bytes)||createHash("sha256").update(reference.bytes).digest("hex")!==reference.checksum)throw new CanvasConflictError("参考图片格式、尺寸、大小或校验不符合生成要求");
    }
    const kind=config.type==="image_generation"?"image":"video";
    const taskInput:TaskInput={kind,mode:config.mode,prompt:config.prompt,...(config.visualMode?{visualMode:config.visualMode}:{}),...(config.templateId?{templateId:config.templateId}:{}),...(config.templateVersion?{templateVersion:config.templateVersion}:{}),...(config.aspectRatio?{aspectRatio:config.aspectRatio}:{}),...(kind==="video"?{durationSec:config.durationSec??6,resolution:config.resolution??"768P"}:{}),...(reference&&config.referenceAssetId?{referenceAssetId:config.referenceAssetId,referenceFileId:reference.fileId,referenceChecksum:reference.checksum}:{}),canvasOwner:{accountId,canvasId,nodeId,inputDigest:""}};
    const digest=canvasInputDigest(canvas.revision,nodeId,taskInput);taskInput.canvasOwner.inputDigest=digest;
    const stamp=now();
    reservation=await db.transaction(async tx=>{
     const [current]=await tx.select({revision:creativeCanvases.revision}).from(creativeCanvases).where(owned(ctx,canvasId)).for("update");
     if(!current||current.revision!==canvas.revision)throw new CanvasConflictError("画布在提交生成前已更新，请重新保存后再生成");
     const [inserted]=await tx.insert(canvasGenerationLinks).values({id:randomUUID(),userId:ctx.userId,accountId,canvasId,nodeId,attemptId:input.attemptId,taskId:null,inputRevision:canvas.revision,inputDigest:digest,inputJson:taskInput,referenceFileId:reference?.fileId??null,referenceChecksum:reference?.checksum??null,resultAssetId:null,createdAt:stamp,updatedAt:stamp}).onConflictDoNothing().returning();
     return inserted;
    });
    if(!reservation){const [winner]=await db.select().from(canvasGenerationLinks).where(eq(canvasGenerationLinks.attemptId,input.attemptId));if(!winner||winner.userId!==ctx.userId||winner.accountId!==accountId||winner.canvasId!==canvasId||winner.nodeId!==nodeId)throw new OwnershipError("生成请求不存在");reservation=winner;}
   }
   if(!reservation)throw new CanvasConflictError("生成请求未预留");
   const taskInput=reservation.inputJson as TaskInput;
   if(taskInput.canvasOwner.inputDigest!==reservation.inputDigest)throw new CanvasConflictError("生成输入与原提交不符");
   if(reservation.taskId)return link(reservation);
   const currentCanvas=await requireCanvas(ctx,canvasId),currentNode=canvasDocumentSchema.parse(currentCanvas.documentJson).nodes.find(node=>node.id===nodeId);
   if(!currentNode||(currentNode.type!=="image_generation"&&currentNode.type!=="video_generation")||currentNode.prompt!==taskInput.prompt||currentNode.mode!==taskInput.mode||(currentNode.referenceAssetId??null)!==(taskInput.referenceAssetId??null)||(currentNode.aspectRatio??null)!==(taskInput.aspectRatio??null)||(currentNode.visualMode??null)!==(taskInput.visualMode??null)||(currentNode.templateId??null)!==(taskInput.templateId??null)||(currentNode.templateVersion??null)!==(taskInput.templateVersion??null))throw new CanvasConflictError("节点输入已编辑，请明确再创作而不是恢复旧提交");
   const task=await deps.submitTask(ctx,{attemptId:reservation.attemptId,inputData:taskInput});
   if(reservation.taskId && reservation.taskId!==task.id)throw new CanvasConflictError("生成任务与原请求不符");
   const [saved]=await db.update(canvasGenerationLinks).set({taskId:task.id,updatedAt:now()}).where(and(eq(canvasGenerationLinks.id,reservation.id),eq(canvasGenerationLinks.accountId,accountId),eq(canvasGenerationLinks.userId,ctx.userId))).returning();
   return link(saved!);
  },
 };
}
