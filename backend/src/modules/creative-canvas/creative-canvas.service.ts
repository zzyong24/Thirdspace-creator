import {workspaceFilter,workspaceStamp,workspaceKey,requireWorkspace,assertWritableWorkspace} from '../../workspace-scope';
import {withWorkspaceWrite} from '../../workspace-write';
import {lockWorkspaceMembership} from '../platform-account/membership-lock.service';
import {isDeepStrictEqual} from "node:util";
import {createHash,randomUUID} from "node:crypto";
import {and,desc,eq,isNull} from "drizzle-orm";
import {canvasCreateProposalInputSchema,canvasFrozenGenerationInputSchema,canvasProposalAdmissionSchema,type CanvasProposalAdmission,canvasMaterialSelectionResource,committedGeneratedAssetProof,canvasDocumentSchema,canvasProposalOperationSchema,creativeCanvasResource,emptyCanvasDocument,type CanvasDocument,type CanvasNode,type RequestContext,ErrorCode} from "@creatoros/contract";
import {executionTasks,executionCalls,aiTaskResults,aiTasks,canvasAgentProposals,canvasGenerationLinks,creativeCanvases,requireAccountId,OwnershipError,type Db} from "@creatoros/backend";
import {z} from "zod";
import {supportsAssetGenerationMode,capabilityForAssetMode,referenceImageAllowed,assetGenerationParameterError,assetGenerationAspectRatios} from "../ai-runtime/asset-generation-modes";

type CanvasRow=typeof creativeCanvases.$inferSelect;
type LinkRow=typeof canvasGenerationLinks.$inferSelect;
type GenerationNode=Extract<CanvasNode,{type:"image_generation"|"video_generation"}>;
type ProposalOperation=z.infer<typeof canvasProposalOperationSchema>;
type Reference={fileId:string;checksum:string;mimeType:string;bytes:Uint8Array};
export type CanvasTaskInput=z.infer<typeof canvasFrozenGenerationInputSchema>;
type TaskInput=CanvasTaskInput;
// SEMANTIC_BOUNDARY_ALLOW: 冻结字段顺序仅恢复历史JSON摘要；JSONB回读的键顺序不代表内容变化。
function canvasInputDigest(revision:number,nodeId:string,input:TaskInput){
 const ordered={...(Object.prototype.hasOwnProperty.call(input,"projectId")?{projectId:input.projectId}:{}),kind:input.kind,mode:input.mode,prompt:input.prompt,...(input.visualMode?{visualMode:input.visualMode}:{}),...(input.templateId?{templateId:input.templateId}:{}),...(input.templateVersion?{templateVersion:input.templateVersion}:{}),...(input.aspectRatio?{aspectRatio:input.aspectRatio}:{}),...(input.kind==="video"?{durationSec:input.durationSec??6,resolution:input.resolution??"768P"}:{}),...(input.referenceAssetId?{referenceAssetId:input.referenceAssetId,referenceFileId:input.referenceFileId,referenceChecksum:input.referenceChecksum}:{}),canvasOwner:{accountId:input.canvasOwner.accountId,...(input.canvasOwner.groupId?{groupId:input.canvasOwner.groupId,groupVersion:input.canvasOwner.groupVersion,membershipVersion:input.canvasOwner.membershipVersion}:{}),canvasId:input.canvasOwner.canvasId,nodeId:input.canvasOwner.nodeId,inputDigest:"",...(input.canvasOwner.proposalAdmission?{proposalAdmission:canvasProposalAdmissionSchema.parse(input.canvasOwner.proposalAdmission)}:{})}};
 return createHash("sha256").update(JSON.stringify([revision,nodeId,ordered])).digest("hex");
}
const frozenTaskInputSchema=canvasFrozenGenerationInputSchema;
function frozenInput(row:LinkRow):CanvasTaskInput{
 const value=frozenTaskInputSchema.parse(row.inputJson);
 if(value.canvasOwner.groupId&&(value.canvasOwner.groupVersion!==row.groupVersion||value.canvasOwner.membershipVersion!==row.membershipVersion))throw new CanvasConflictError("原生成冻结组不符");
 if(value.canvasOwner.accountId===null&&!value.canvasOwner.groupId)throw new CanvasConflictError("原生成缺少冻结归属");
 const digest=canvasInputDigest(row.inputRevision,row.nodeId,value);
 const legacyDigest=createHash("sha256").update(JSON.stringify([row.inputRevision,row.nodeId,{...(row.inputJson as CanvasTaskInput),canvasOwner:{...value.canvasOwner,inputDigest:""}}])).digest("hex");
 if(value.canvasOwner.accountId!==row.accountId||value.canvasOwner.canvasId!==row.canvasId||value.canvasOwner.nodeId!==row.nodeId||value.canvasOwner.inputDigest!==row.inputDigest||(digest!==row.inputDigest&&(value.canvasOwner.proposalAdmission||legacyDigest!==row.inputDigest))||row.referenceFileId!==(value.referenceFileId??null)||row.referenceChecksum!==(value.referenceChecksum??null))throw new CanvasConflictError("生成输入与原提交不符");
 return value;
}
class CanvasConflictError extends Error {readonly code=ErrorCode.ConflictError;constructor(message:string){super(message);this.name="ConflictError";}}
function account(ctx:RequestContext){requireWorkspace(ctx);return workspaceStamp(workspaceKey(ctx)).accountId;}
// SEMANTIC_BOUNDARY_ALLOW: 当前物理行只授权内容；任务读取严格沿原冻结身份，不重签迁组后的输入/版本。
function sourceContext(ctx:RequestContext,row:LinkRow):RequestContext{const original=frozenInput(row).canvasOwner;return {...ctx,userId:row.userId,accountId:original.accountId,groupId:original.groupId,groupVersion:original.groupVersion??undefined,membershipVersion:original.membershipVersion??undefined};}
function rowOwned(ctx:RequestContext,row:{userId:string;accountId:string|null;groupId:string|null}){return row.userId===ctx.userId&&(ctx.groupId?row.groupId===ctx.groupId:row.accountId===ctx.accountId&&(!row.groupId||row.groupId===`grp_legacy_${ctx.accountId}`));}
function owned(ctx:RequestContext,id:string){return and(eq(creativeCanvases.id,id),eq(creativeCanvases.userId,ctx.userId),workspaceFilter(creativeCanvases,ctx),isNull(creativeCanvases.archivedAt));}
function project(row:CanvasRow){const {documentJson,...visible}=row;return {...visible,document:canvasDocumentSchema.parse(documentJson)};}
function link(row:LinkRow){const {userId:_userId,accountId:_accountId,groupId:_groupId,groupVersion:_groupVersion,membershipVersion:_membershipVersion,inputJson,...visible}=row;return {...visible,mediaKind:frozenInput(row).kind};}
function proposal(row:typeof canvasAgentProposals.$inferSelect){const {userId:_userId,accountId:_accountId,groupId:_groupId,operationsJson,appliedCanvasJson:_appliedCanvasJson,...visible}=row;return {...visible,operations:z.array(canvasProposalOperationSchema).parse(operationsJson)};}

export interface CanvasMaterialSelection {nodeId:string;taskId?:string;resultId?:string;}
export interface CanvasMaterialPage extends CanvasMaterialSelection {assetId:string;fileId?:string;checksum?:string;}
export interface CanvasMaterialPlan {canvasId:string;projectId:string|null;revision:number;group:{id:string;libraryKind:"cover"|"xhs";caption:string;aspectRatio:string;pageOrder:string[]};pages:CanvasMaterialPage[];}
export function createCreativeCanvasService(db:Db,deps:{
 now?:()=>string;
 assertProject:(ctx:RequestContext,id:string,tx?:Db,forUpdate?:boolean)=>Promise<void>;
 assertMediaAsset:(ctx:RequestContext,id:string,type:"image"|"video",fileId?:string,tx?:Db)=>Promise<{fileId:string;checksum:string}>;
 assertReferenceAsset:(ctx:RequestContext,id:string,tx?:Db)=>Promise<void>;
 getMediaFileDownloadUrl:(ctx:RequestContext,assetId:string,fileId:string)=>Promise<{url:string;fileName:string}>;
 getReference:(ctx:RequestContext,id:string,fileId?:string,tx?:Db)=>Promise<Reference|null>;
 readTask:(ctx:RequestContext,taskId:string,tx?:Db)=>Promise<{id:string;userId:string;attemptId:string|null;idempotencyKey?:string;projectId:string|null;taskType:string;inputData:unknown;status?:string;runtimeStatus?:string|null}|null>;
 readTaskResults:(ctx:RequestContext,taskId:string,tx?:Db)=>Promise<Array<{id?:string;resultType:string;assetId?:string|null}>>;
 getCommittedAssetResult?:(ctx:RequestContext,input:{taskId:string;resultId:string},tx:Db)=>Promise<{status:"verified";proof:z.infer<typeof committedGeneratedAssetProof>}|{status:"unverifiable";reason:string}>;
 submitTask:(ctx:RequestContext,input:{attemptId:string;inputData:CanvasTaskInput})=>Promise<{id:string}>;
 findTaskByAttempt?:(ctx:RequestContext,attemptId:string)=>Promise<{id:string}|null>;
 resolveTemplateRequirement?:(ctx:RequestContext,id:string,version:number,tx?:Db)=>Promise<boolean>;
 assertProposalAdmission?:(ctx:RequestContext,input:{attemptId:string;inputData:CanvasTaskInput;taskId:string;generationLinkId:string},tx:Db)=>Promise<void>;
 resolveCapability?:(ctx:RequestContext,capability:"image.generate"|"image.edit"|"video.generate",tx?:Db)=>Promise<{provider:string;model:string}>;
}){
 const now=deps.now??(()=>new Date().toISOString());
 async function requireCanvas(ctx:RequestContext,id:string,store:Db=db){const [row]=await store.select().from(creativeCanvases).where(owned(ctx,id));if(!row)throw new OwnershipError("画布不存在");return row;}
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
 async function requiresIdentity(ctx:RequestContext,node:GenerationNode,snapshot?:{id:string;version:number;requiredIdentity:boolean;visualMode:string},tx?:Db):Promise<boolean>{
  const sources=[...(node.templateId?[{id:node.templateId,version:node.templateVersion}]:[]),...(snapshot?[{id:snapshot.id,version:snapshot.version}]:[])];
  let trusted=false;for(const source of sources){if(deps.resolveTemplateRequirement){if(!source.version)throw new CanvasConflictError("模板缺少快照版本");trusted=(await deps.resolveTemplateRequirement(ctx,source.id,source.version,tx))||trusted;}}
  return trusted||node.visualMode==="real_person"||Boolean(snapshot?.requiredIdentity)||snapshot?.visualMode==="real_person";
 }
 async function recoverReservation(ctx:RequestContext,row:LinkRow):Promise<LinkRow>{
  const accessContext=ctx;ctx=sourceContext(ctx,row);if(row.taskId||!deps.findTaskByAttempt)return row;const found=await deps.findTaskByAttempt(ctx,row.attemptId);if(!found)return row;
  const [task]=await db.select().from(aiTasks).where(and(eq(aiTasks.id,found.id),eq(aiTasks.userId,ctx.userId),workspaceFilter(aiTasks,ctx)));if(!task)throw new OwnershipError("原生成任务无权访问");
  const frozen=frozenInput(row);
  if(task.userId!==ctx.userId||task.accountId!==row.accountId||!rowOwned(ctx,task)||task.taskType!=="asset.generate")throw new OwnershipError("原生成任务无权访问");
  if(!isDeepStrictEqual(task.inputData,frozen)||canvasInputDigest(row.inputRevision,row.nodeId,frozen)!==row.inputDigest||frozen.canvasOwner.inputDigest!==row.inputDigest||frozen.canvasOwner.accountId!==row.accountId||frozen.canvasOwner.canvasId!==row.canvasId||frozen.canvasOwner.nodeId!==row.nodeId)throw new CanvasConflictError("原生成任务与冻结请求不符");
  const [saved]=await db.update(canvasGenerationLinks).set({taskId:task.id,updatedAt:now()}).where(and(eq(canvasGenerationLinks.id,row.id),eq(canvasGenerationLinks.userId,ctx.userId),workspaceFilter(canvasGenerationLinks,accessContext),isNull(canvasGenerationLinks.taskId))).returning();
  if(saved)return saved;const [winner]=await db.select().from(canvasGenerationLinks).where(eq(canvasGenerationLinks.id,row.id));if(winner?.taskId!==task.id)throw new CanvasConflictError("原生成任务恢复冲突");return winner;
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
   if(node.type==="image_generation"&&await requiresIdentity(ctx,node,undefined,tx)&&(node.mode!=="image_to_image"||!node.referenceAssetId))throw new CanvasConflictError("真人身份需要当前用户的参考图与图生图模式");
   if((node.type==="image_generation"||node.type==="video_generation")&&node.referenceAssetId)await deps.assertReferenceAsset(ctx,node.referenceAssetId,tx);
  }
  for(const edge of doc.edges){if(edgeIds.has(edge.id)||!ids.has(edge.source)||!ids.has(edge.target))throw new CanvasConflictError("画布连接包含重复或失效节点");edgeIds.add(edge.id);}
  const groupIds=new Set<string>(),groupNodes=new Set<string>(),attempts=new Set<string>();
  for(const group of doc.visualGroups??[]){
   if(groupIds.has(group.id))throw new CanvasConflictError("页组 ID 重复");groupIds.add(group.id);
   for(const nodeId of group.pageOrder){
    const node=doc.nodes.find(node=>node.id===nodeId);
    if(!node||!['image','image_generation'].includes(node.type)||groupNodes.has(nodeId))throw new CanvasConflictError("页组引用失效、重复或跨组节点");groupNodes.add(nodeId);
    if(node.type==="image_generation"){
     if((await requiresIdentity(ctx,node,group.templateSnapshot,tx))&&(node.mode!=="image_to_image"||!node.referenceAssetId))throw new CanvasConflictError("模板身份需要当前用户的参考图与图生图模式");
     if(node.aspectRatio&&node.aspectRatio!==group.aspectRatio)throw new CanvasConflictError("页组与节点画幅不一致");
    }
   }
   for(const [nodeId,attempt] of Object.entries(group.generationAttempts)){
    if(!group.pageOrder.includes(nodeId)||attempts.has(attempt))throw new CanvasConflictError("页组生成尝试引用失效或重复");attempts.add(attempt);
   }
  }
  return doc;
 }
 async function prepareGenerationInput(ctx:RequestContext,canvas:CanvasRow,nodeId:string,store:Db,attemptId?:string,proposal=false):Promise<CanvasTaskInput>{
  const doc=canvasDocumentSchema.parse(canvas.documentJson),node=doc.nodes.find(value=>value.id===nodeId);
  if(!node || (node.type!=="image_generation"&&node.type!=="video_generation"))throw new OwnershipError("生成节点不存在");
  const config=node as GenerationNode;
  const group=doc.visualGroups?.find(group=>group.pageOrder.includes(nodeId));
  if(!proposal&&group&&group.generationAttempts[nodeId]!==attemptId)throw new CanvasConflictError("请先保存当前页的生成尝试再提交");
  if((await requiresIdentity(ctx,config,group?.templateSnapshot,store))&&(config.mode!=="image_to_image"||!config.referenceAssetId))throw new CanvasConflictError("真人身份需要参考图，不允许降级文生图");
  if(!config.prompt.trim())throw new CanvasConflictError("请先填写生成描述");
  if(!deps.resolveCapability)throw new CanvasConflictError("生成模型尚未配置");
  const spec=await deps.resolveCapability(ctx,capabilityForAssetMode(config.mode),store);
  if(!supportsAssetGenerationMode(spec,config.mode))throw new CanvasConflictError("当前模型渠道不支持该生成模式");
  const parameterError=assetGenerationParameterError(spec,config.mode,config);
  if(parameterError)throw new CanvasConflictError(parameterError);
  if(config.mode.startsWith("image_to_")&&!config.referenceAssetId)throw new CanvasConflictError("请先选择参考图片");
  let reference:Reference|null=null;
  if(config.referenceAssetId){
   reference=await deps.getReference(ctx,config.referenceAssetId,config.referenceFileId,store);
   if(!reference)throw new OwnershipError("参考图片不存在");
   if(config.referenceFileId&&reference.fileId!==config.referenceFileId)throw new CanvasConflictError("参考图片未读回所指定的精确文件");
   if(!referenceImageAllowed(spec,config.mode,reference.mimeType,reference.bytes)||createHash("sha256").update(reference.bytes).digest("hex")!==reference.checksum)throw new CanvasConflictError("参考图片格式、尺寸、大小或校验不符合生成要求");
  }
  const kind=config.type==="image_generation"?"image":"video";
  const taskInput:CanvasTaskInput={projectId:canvas.projectId,kind,mode:config.mode,prompt:config.prompt,...(config.visualMode?{visualMode:config.visualMode}:{}),...(config.templateId?{templateId:config.templateId}:{}),...(config.templateVersion?{templateVersion:config.templateVersion}:{}),...(config.aspectRatio?{aspectRatio:config.aspectRatio}:{}),...(kind==="video"?{durationSec:config.durationSec??6,resolution:config.resolution??"768P"}:{}),...(reference&&config.referenceAssetId?{referenceAssetId:config.referenceAssetId,referenceFileId:reference.fileId,referenceChecksum:reference.checksum}:{}),canvasOwner:{accountId:account(ctx),...(ctx.groupId?{groupId:ctx.groupId,groupVersion:ctx.groupVersion??null,membershipVersion:null}:{}),canvasId:canvas.id,nodeId,inputDigest:""}};
  taskInput.canvasOwner.inputDigest=canvasInputDigest(canvas.revision,nodeId,taskInput);
  return taskInput;
 }
 async function attachReservedTask(ctx:RequestContext,generationLinkId:string,taskId:string,store:Db){
  const [row]=await store.select().from(canvasGenerationLinks).where(and(eq(canvasGenerationLinks.id,generationLinkId),eq(canvasGenerationLinks.userId,ctx.userId),workspaceFilter(canvasGenerationLinks,ctx))).for('update');
  if(!row)throw new OwnershipError('画布生成预约不存在');
  if(row.taskId&&row.taskId!==taskId)throw new CanvasConflictError('原预约已经绑定其它任务');
  const input=frozenInput(row),original=await deps.readTask(sourceContext(ctx,row),taskId,store);
  if(!original||original.id!==taskId||original.userId!==ctx.userId||original.taskType!=='asset.generate')throw new OwnershipError('原生成任务不存在');
  if((original.attemptId!==row.attemptId&&original.idempotencyKey!==row.attemptId)||(Object.prototype.hasOwnProperty.call(input,'projectId')&&original.projectId!==input.projectId)||!isDeepStrictEqual(original.inputData,input))throw new CanvasConflictError('原生成任务请求或输入与预约不符');
  if(row.taskId)return link(row);
  const [saved]=await store.update(canvasGenerationLinks).set({taskId,updatedAt:now()}).where(eq(canvasGenerationLinks.id,row.id)).returning();
  return link(saved!);
 }
 async function verifyGeneratedPage(ctx:RequestContext,canvas:CanvasRow,node:GenerationNode,selection:CanvasMaterialSelection,settled=false):Promise<CanvasMaterialPage>{
  if(!selection.taskId||!selection.resultId)throw new CanvasConflictError("生成页必须选择原任务的真实候选");
  const [source]=await db.select().from(canvasGenerationLinks).where(and(eq(canvasGenerationLinks.canvasId,canvas.id),eq(canvasGenerationLinks.nodeId,node.id),eq(canvasGenerationLinks.taskId,selection.taskId),eq(canvasGenerationLinks.userId,ctx.userId),workspaceFilter(canvasGenerationLinks,ctx)));
  if(!source)throw new OwnershipError("生成候选不属于当前画布节点");
  const input=frozenInput(source),originalContext=sourceContext(ctx,source);
  const [task]=await db.select().from(aiTasks).where(and(eq(aiTasks.id,selection.taskId),eq(aiTasks.userId,ctx.userId),workspaceFilter(aiTasks,originalContext)));
  const [result]=await db.select().from(aiTaskResults).where(and(eq(aiTaskResults.id,selection.resultId),eq(aiTaskResults.aiTaskId,selection.taskId)));
  if(!source||!task||!result?.assetId||task.taskType!=="asset.generate"||result.resultType!=="generated_asset"||source.inputRevision>canvas.revision)throw new OwnershipError("生成候选不属于当前画布节点");
  if(!["awaiting_confirmation","succeeded"].includes(task.status)||(settled&&task.status!=="succeeded"))throw new CanvasConflictError("生成候选尚未完成或采纳");
  const parsedBusiness=frozenTaskInputSchema.safeParse(task.inputData);if(!parsedBusiness.success)throw new CanvasConflictError("生成任务与原画布输入不符");
  const business=parsedBusiness.data;
  // SEMANTIC_BOUNDARY_ALLOW: 精确比较原生成协议输入与用户当前选择，仅守来源身份和版本边界。
  const digest=canvasInputDigest(source.inputRevision,node.id,input);
  if(input.kind!=="image"||digest!==source.inputDigest||business.canvasOwner.accountId!==input.canvasOwner.accountId||business.canvasOwner?.canvasId!==canvas.id||business.canvasOwner?.nodeId!==node.id||business.canvasOwner?.inputDigest!==source.inputDigest||!isDeepStrictEqual(business,input))throw new CanvasConflictError("生成任务与原画布输入不符");
  if(!task.executionTaskId||!result.executionCallId)throw new CanvasConflictError("生成候选缺少执行回执");
  const [execution]=await db.select().from(executionTasks).where(and(eq(executionTasks.id,task.executionTaskId),eq(executionTasks.userId,ctx.userId),workspaceFilter(executionTasks,originalContext),eq(executionTasks.ownerId,task.id)));
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
   if(canvas.projectId)await deps.assertProject(ctx,canvas.projectId);
   const doc=canvasDocumentSchema.parse(canvas.documentJson);
   for(const page of plan.pages){if(!page.taskId)continue;const node=doc.nodes.find(node=>node.id===page.nodeId);if(node?.type!=="image_generation")throw new CanvasConflictError("生成节点已变化");const verified=await verifyGeneratedPage(ctx,canvas,node,page,true);if(!isDeepStrictEqual(verified,page))throw new CanvasConflictError("采纳产物与所选原候选不符");}
  },
  /** 只验证原节点和引用，没有预约、AI任务或外部调用。 */
  async prepareGenerateProposal(ctx:RequestContext,canvasId:string,input:{baseRevision:number;nodeId:string}){
   account(ctx);return db.transaction(async tx=>{
    const originalContext=ctx.groupId?{...ctx,accountId:null,membershipVersion:undefined}:ctx;
    const freeze=await lockWorkspaceMembership(tx,originalContext);
    const canvas=await requireCanvas(ctx,canvasId,tx as unknown as Db);
    if(canvas.revision!==input.baseRevision)throw new CanvasConflictError('画布已更新，请读取保存后的节点');
    if(canvas.projectId)await deps.assertProject(originalContext,canvas.projectId,tx as unknown as Db);
    const inputData=await prepareGenerationInput(originalContext,canvas,input.nodeId,tx as unknown as Db,undefined,true);
    if(inputData.canvasOwner.groupId){inputData.canvasOwner.groupVersion=freeze.groupVersion;inputData.canvasOwner.membershipVersion=freeze.membershipVersion;inputData.canvasOwner.inputDigest=canvasInputDigest(canvas.revision,input.nodeId,inputData);}
    return {canvasId,inputRevision:canvas.revision,inputDigest:inputData.canvasOwner.inputDigest,inputData};
   });
  },
  /** 原手工与AI确认共用预约核心；调用方必须同行提交原AI task与采用回执。 */
  async reserveGenerationInTransaction(ctx:RequestContext,canvasId:string,nodeId:string,input:{expectedRevision:number;attemptId:string;snapshot?:{inputRevision:number;inputDigest:string;inputData:CanvasTaskInput};proposalAdmission?:CanvasProposalAdmission},transaction:Db){
   account(ctx);const originalContext=ctx.groupId?{...ctx,accountId:null,membershipVersion:undefined}:ctx;
   const freeze=await lockWorkspaceMembership(transaction as unknown as Parameters<typeof lockWorkspaceMembership>[0],originalContext);
   const before=await requireCanvas(ctx,canvasId,transaction);
   if(before.projectId)await deps.assertProject(originalContext,before.projectId,transaction,true);
   const [canvas]=await transaction.select().from(creativeCanvases).where(owned(ctx,canvasId)).for('update');
   if(!canvas||canvas.projectId!==before.projectId||canvas.revision!==input.expectedRevision)throw new CanvasConflictError('画布在提交生成前已更新，请重新读取后再生成');
   const admission=input.proposalAdmission?canvasProposalAdmissionSchema.parse(input.proposalAdmission):undefined;
   if(admission&&(!input.snapshot||input.attemptId!==`canvas-proposal:${admission.source.callId}`))throw new CanvasConflictError('确认预约必须使用真实来源的稳定尝试');
   const taskInput=await prepareGenerationInput(originalContext,canvas,nodeId,transaction,input.attemptId,Boolean(admission));
   if(taskInput.canvasOwner.groupId){taskInput.canvasOwner.groupVersion=freeze.groupVersion;taskInput.canvasOwner.membershipVersion=freeze.membershipVersion;}
   taskInput.canvasOwner.inputDigest=canvasInputDigest(canvas.revision,nodeId,taskInput);
   if(input.snapshot&&(input.snapshot.inputRevision!==canvas.revision||input.snapshot.inputDigest!==taskInput.canvasOwner.inputDigest||!isDeepStrictEqual(input.snapshot.inputData,taskInput)))throw new CanvasConflictError('保存节点或参考图片已改变，请重新准备生成候选');
   if(admission){if(Date.parse(now())>=Date.parse(admission.deadlineAt))throw new CanvasConflictError('原生成确认期限已耗尽');taskInput.canvasOwner.proposalAdmission=admission;taskInput.canvasOwner.inputDigest=canvasInputDigest(canvas.revision,nodeId,taskInput);}
   const [existing]=await transaction.select().from(canvasGenerationLinks).where(eq(canvasGenerationLinks.attemptId,input.attemptId));
   if(existing){if(!rowOwned(ctx,existing)||existing.canvasId!==canvasId||existing.nodeId!==nodeId||!isDeepStrictEqual(frozenInput(existing),taskInput))throw new CanvasConflictError('原生成尝试与本次确认不符');return {link:link(existing),inputData:frozenInput(existing),context:sourceContext(ctx,existing)};}
   // 同一canvas行锁串行预约：不同attempt不可绕过原任务在途/未知状态；原attempt仍由上方回读。
   const previous=await transaction.select().from(canvasGenerationLinks).where(and(eq(canvasGenerationLinks.canvasId,canvasId),eq(canvasGenerationLinks.nodeId,nodeId),eq(canvasGenerationLinks.userId,ctx.userId),workspaceFilter(canvasGenerationLinks,ctx)));
   for(const pending of previous){
    if(!pending.taskId)throw new CanvasConflictError("此节点的原提交结果尚未明确，请继续原任务");
    const task=await deps.readTask(sourceContext(ctx,pending),pending.taskId,transaction);
    const status=task?.runtimeStatus??task?.status;
    if(!status||!["succeeded","awaiting_confirmation","failed","partial","cancelled"].includes(status))throw new CanvasConflictError("此节点仍在生成或等待原任务结果，请勿重复提交");
   }
   const stamp=now();
   const [row]=await transaction.insert(canvasGenerationLinks).values({id:randomUUID(),userId:ctx.userId,...workspaceStamp(workspaceKey(originalContext)),groupVersion:freeze.groupVersion,membershipVersion:freeze.membershipVersion,canvasId,nodeId,attemptId:input.attemptId,taskId:null,inputRevision:canvas.revision,inputDigest:taskInput.canvasOwner.inputDigest,inputJson:taskInput,referenceFileId:taskInput.referenceFileId??null,referenceChecksum:taskInput.referenceChecksum??null,resultAssetId:null,createdAt:stamp,updatedAt:stamp}).onConflictDoNothing().returning();
   if(!row){
    const [winner]=await transaction.select().from(canvasGenerationLinks).where(eq(canvasGenerationLinks.attemptId,input.attemptId));
    if(!winner||!rowOwned(ctx,winner)||winner.canvasId!==canvasId||winner.nodeId!==nodeId||!isDeepStrictEqual(frozenInput(winner),taskInput))throw new CanvasConflictError('原生成尝试与本次确认不符');
    return {link:link(winner),inputData:frozenInput(winner),context:sourceContext(ctx,winner)};
   }
   return {link:link(row),inputData:frozenInput(row),context:sourceContext(ctx,row)};
  },
  attachReservedTaskInTransaction:attachReservedTask,
  async assertFrozenGenerationInput(ctx:RequestContext,input:{attemptId:string;inputData:unknown;taskId?:string},transaction:Db=db){
   const [row]=await transaction.select().from(canvasGenerationLinks).where(and(eq(canvasGenerationLinks.attemptId,input.attemptId),eq(canvasGenerationLinks.userId,ctx.userId),workspaceFilter(canvasGenerationLinks,ctx)));
   if(!row)throw new OwnershipError("画布生成预约不存在");
   const frozen=frozenInput(row);
   if(!isDeepStrictEqual(frozenTaskInputSchema.parse(input.inputData),frozen)||input.taskId&&row.taskId&&row.taskId!==input.taskId)throw new CanvasConflictError("生成输入或原任务与原提交不符");
   const admission=frozen.canvasOwner.proposalAdmission;
   if(!admission)return undefined;
   if(!input.taskId||row.taskId!==input.taskId||!deps.assertProposalAdmission)throw new CanvasConflictError('画布生成缺少已采用的来源证明');
   await deps.assertProposalAdmission(ctx,{attemptId:row.attemptId,inputData:frozen,taskId:input.taskId,generationLinkId:row.id},transaction);
   return admission;
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
  async list(ctx:RequestContext){const rows=await db.select().from(creativeCanvases).where(and(eq(creativeCanvases.userId,ctx.userId),workspaceFilter(creativeCanvases,ctx),isNull(creativeCanvases.archivedAt))).orderBy(desc(creativeCanvases.updatedAt));return Promise.all(rows.map(row=>visibleCanvas(ctx,row)));},
  async get(ctx:RequestContext,id:string){return visibleCanvas(ctx,await requireCanvas(ctx,id));},
  /** 仅读取和验证原引用；完整初文档先供用户检查，没有空画布写入。 */
  async prepareCreateProposal(ctx:RequestContext,raw:unknown){
   account(ctx);await assertWritableWorkspace(db,ctx);
   const input=canvasCreateProposalInputSchema.parse(raw);
   if(!input.title.trim())throw new CanvasConflictError("请填写画布名称");
   if(input.projectId)await deps.assertProject(ctx,input.projectId,db);
   const document=await validateDocument(ctx,input.document,db);
   return {title:input.title,projectId:input.projectId??null,document};
  },
  /** 只供用户采用的服务组合调用；与来源回执共享同一transaction。 */
  async createWithDocumentInTransaction(ctx:RequestContext,raw:unknown,transaction:Db){
   account(ctx);
   const input=canvasCreateProposalInputSchema.parse(raw);
   if(!input.title.trim())throw new CanvasConflictError("请填写画布名称");
   await lockWorkspaceMembership(transaction as unknown as Parameters<typeof lockWorkspaceMembership>[0],ctx);
   if(input.projectId)await deps.assertProject(ctx,input.projectId,transaction,true);
   const document=await validateDocument(ctx,input.document,transaction);
   const stamp=now(),[row]=await transaction.insert(creativeCanvases).values({id:randomUUID(),userId:ctx.userId,...workspaceStamp(workspaceKey(ctx)),title:input.title.trim(),projectId:input.projectId??null,documentJson:document,revision:1,createdAt:stamp,updatedAt:stamp}).returning();
   if(!row)throw new CanvasConflictError("画布创建没有完成");
   return project(row);
  },
  async create(ctx:RequestContext,input:{title:string;projectId?:string|null}){
   const accountId=account(ctx);return withWorkspaceWrite(db,ctx,async tx=>{if(input.projectId)await deps.assertProject(ctx,input.projectId,tx,true);
   const stamp=now(),id=randomUUID();
   const [row]=await tx.insert(creativeCanvases).values({id,userId:ctx.userId,...workspaceStamp(workspaceKey(ctx)),title:input.title.trim(),projectId:input.projectId??null,documentJson:emptyCanvasDocument,revision:1,createdAt:stamp,updatedAt:stamp}).returning();
   return project(row!);});
  },
  async save(ctx:RequestContext,id:string,input:{expectedRevision:number;document:unknown;title?:string;projectId?:string|null}){
   return withWorkspaceWrite(db,ctx,async tx=>{
    // 原项目根锁先于画布锁；每个依赖都显式使用同事务owner。
    const [before]=await tx.select().from(creativeCanvases).where(owned(ctx,id));
    if(!before)throw new OwnershipError("画布不存在");
    for(const projectId of [...new Set([before.projectId,input.projectId].filter((value):value is string=>Boolean(value)))].sort())await deps.assertProject(ctx,projectId,tx,true);
    const [row]=await tx.select().from(creativeCanvases).where(owned(ctx,id)).for("update");
    if(!row)throw new OwnershipError("画布不存在");
    if(row.projectId!==before.projectId)throw new CanvasConflictError("画布关联作品已变化，请重试");
    if(row.revision!==input.expectedRevision)throw new CanvasConflictError("画布已在其他窗口更新，请重新载入后再保存");
    const raw=canvasDocumentSchema.parse(input.document),previous=canvasDocumentSchema.parse(row.documentJson);
    const doc=await validateDocument(ctx,raw.visualGroups===undefined&&previous.visualGroups?pruneGroups({...raw,visualGroups:previous.visualGroups}):raw,tx);
    const [saved]=await tx.update(creativeCanvases).set({documentJson:doc,title:input.title?.trim()??row.title,projectId:input.projectId===undefined?row.projectId:input.projectId,revision:row.revision+1,updatedAt:now()}).where(owned(ctx,id)).returning();
    return project(saved!);
   });
  },
  async archive(ctx:RequestContext,id:string){return withWorkspaceWrite(db,ctx,async tx=>{const current=await requireCanvas(ctx,id,tx);if(current.projectId)await deps.assertProject(ctx,current.projectId,tx,true);const [row]=await tx.update(creativeCanvases).set({archivedAt:now(),updatedAt:now()}).where(owned(ctx,id)).returning();if(!row)throw new OwnershipError("画布不存在");return project(row);});},
  async previewNode(ctx:RequestContext,id:string,nodeId:string){
   const canvas=await requireCanvas(ctx,id),doc=canvasDocumentSchema.parse(canvas.documentJson);
   const node=doc.nodes.find(value=>value.id===nodeId);
   if(!node||(node.type!=="image"&&node.type!=="video")||!node.fileId)throw new OwnershipError("画布媒体节点不存在");
   const file=await deps.assertMediaAsset(ctx,node.assetId,node.type,node.fileId,db);
   if(node.checksum&&file.checksum!==node.checksum)throw new CanvasConflictError("画布素材文件校验已变化");
   return deps.getMediaFileDownloadUrl(ctx,node.assetId,node.fileId);
  },
  async listProposals(ctx:RequestContext,id:string){await requireCanvas(ctx,id);return (await db.select().from(canvasAgentProposals).where(and(eq(canvasAgentProposals.userId,ctx.userId),workspaceFilter(canvasAgentProposals,ctx),eq(canvasAgentProposals.canvasId,id))).orderBy(desc(canvasAgentProposals.createdAt))).map(proposal);},
  async propose(ctx:RequestContext,id:string,baseRevision:number,raw:unknown){
   return withWorkspaceWrite(db,ctx,async tx=>{
   const canvas=await requireCanvas(ctx,id,tx);if(canvas.projectId)await deps.assertProject(ctx,canvas.projectId,tx,true);const operations=z.array(canvasProposalOperationSchema).min(1).max(100).parse(raw);
   if(canvas.revision!==baseRevision)throw new CanvasConflictError("画布版本已变化，请先重新读取");
   if(new Set(operations.map(operation=>operation.operationId)).size!==operations.length)throw new CanvasConflictError("候选操作 ID 重复");
   const stamp=now(),expiresAt=new Date(Date.parse(stamp)+24*60*60*1000).toISOString();
   const [row]=await tx.insert(canvasAgentProposals).values({id:randomUUID(),userId:ctx.userId,...workspaceStamp(workspaceKey(ctx)),canvasId:id,baseRevision,operationsJson:operations,status:"pending",appliedRevision:null,createdAt:stamp,expiresAt}).returning();
   return proposal(row!);});
  },
  async applyProposal(ctx:RequestContext,id:string,proposalId:string,expectedRevision:number){
   const accountId=account(ctx);
   return withWorkspaceWrite(db,ctx,async tx=>{
    const [before]=await tx.select().from(creativeCanvases).where(owned(ctx,id));
    if(!before)throw new OwnershipError("画布不存在");
    if(before.projectId)await deps.assertProject(ctx,before.projectId,tx,true);
    const [canvas]=await tx.select().from(creativeCanvases).where(owned(ctx,id)).for("update");
    if(!canvas)throw new OwnershipError("画布不存在");
    if(canvas.projectId!==before.projectId)throw new CanvasConflictError("画布关联作品已变化，请重试");
    const [candidate]=await tx.select().from(canvasAgentProposals).where(and(eq(canvasAgentProposals.id,proposalId),eq(canvasAgentProposals.userId,ctx.userId),workspaceFilter(canvasAgentProposals,ctx),eq(canvasAgentProposals.canvasId,id))).for("update");
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
    const valid=await validateDocument(ctx,pruneGroups({...doc,nodes,edges}),tx);
    const stamp=now();
    const [saved]=await tx.update(creativeCanvases).set({documentJson:valid,revision:canvas.revision+1,updatedAt:stamp}).where(owned(ctx,id)).returning();
    await tx.update(canvasAgentProposals).set({status:"applied",appliedRevision:saved!.revision,appliedCanvasJson:project(saved!)}).where(eq(canvasAgentProposals.id,proposalId));
    return project(saved!);
   });
  },
  async getGenerationMaterial(ctx:RequestContext,canvasId:string,generationLinkId:string){
   return db.transaction(async tx=>{
    const [canvas]=await tx.select().from(creativeCanvases).where(owned(ctx,canvasId));
    if(!canvas)throw new OwnershipError("画布不存在");
    if(canvas.projectId)await deps.assertProject(ctx,canvas.projectId,tx);
    const [row]=await tx.select().from(canvasGenerationLinks).where(and(eq(canvasGenerationLinks.id,generationLinkId),eq(canvasGenerationLinks.canvasId,canvasId),eq(canvasGenerationLinks.userId,ctx.userId),workspaceFilter(canvasGenerationLinks,ctx)));
    if(!row)throw new OwnershipError("画布生成记录不存在");
    const anchor={canvasId,generationLinkId,nodeId:row.nodeId,attemptId:row.attemptId,inputRevision:row.inputRevision,inputDigest:row.inputDigest,taskId:row.taskId};
    const unavailable=(status:"not_ready"|"unverifiable",reason:string)=>canvasMaterialSelectionResource.parse({status,...anchor,reason});
    if(!row.taskId)return unavailable("not_ready","原任务尚未绑定，请恢复原生成请求");
    const task=await deps.readTask(sourceContext(ctx,row),row.taskId,tx);
    if(!task||task.id!==row.taskId||task.userId!==ctx.userId||task.taskType!=="asset.generate"||(task.attemptId!==row.attemptId&&task.idempotencyKey!==row.attemptId))return unavailable("unverifiable","原生成任务身份与预约不符");
    try{await this.assertFrozenGenerationInput(ctx,{attemptId:row.attemptId,inputData:task.inputData,taskId:task.id},tx);}catch(error){if(error instanceof CanvasConflictError||error instanceof z.ZodError)return unavailable("unverifiable","原生成输入与预约不符");throw error;}
    const frozen=frozenInput(row);
    if(Object.prototype.hasOwnProperty.call(frozen,"projectId")&&task.projectId!==frozen.projectId)return unavailable("unverifiable","原任务项目与冻结预约不符");
    const results=(await deps.readTaskResults(sourceContext(ctx,row),task.id,tx)).filter(value=>value.resultType==="generated_asset"&&typeof value.assetId==="string"&&value.assetId.length>0);
    if(results.length===0)return unavailable("not_ready","原生成任务尚无素材结果");
    if(results.length!==1||!results[0]!.id)return unavailable("unverifiable","原生成任务缺少唯一可追溯结果");
    const result=results[0]!;
    if(row.resultAssetId&&row.resultAssetId!==result.assetId)return unavailable("unverifiable","历史预约与原素材结果不符");
    if(!deps.getCommittedAssetResult)return unavailable("unverifiable","精确生成文件证明端口未装配");
    const checked=await deps.getCommittedAssetResult(sourceContext(ctx,row),{taskId:task.id,resultId:result.id!},tx);
    if(checked.status!=="verified")return unavailable("unverifiable",checked.reason);
    const proof=committedGeneratedAssetProof.parse(checked.proof);
    if(proof.taskId!==task.id||proof.resultId!==result.id||proof.receipt.assetId!==result.assetId||proof.receipt.assetType!==frozen.kind)return unavailable("unverifiable","原生成文件证明身份不符");
    return canvasMaterialSelectionResource.parse({status:"available",phase:proof.taskStatus==="succeeded"?"confirmed":"candidate",origin:{canvasId,generationLinkId,nodeId:row.nodeId,attemptId:row.attemptId,inputRevision:row.inputRevision,inputDigest:row.inputDigest,taskId:task.id,resultId:result.id!,executionTaskId:proof.executionTaskId,callId:proof.callId},file:{assetId:proof.receipt.assetId,assetFileId:proof.receipt.fileId},checksum:proof.receipt.checksum,assetType:proof.receipt.assetType,name:proof.receipt.name,assetStatus:proof.assetStatus,taskStatus:proof.taskStatus});
   });
  },
  async listTasks(ctx:RequestContext,id:string){const canvas=await requireCanvas(ctx,id);if(canvas.projectId)await deps.assertProject(ctx,canvas.projectId);
   const rows=await db.select().from(canvasGenerationLinks).where(and(eq(canvasGenerationLinks.userId,ctx.userId),workspaceFilter(canvasGenerationLinks,ctx),eq(canvasGenerationLinks.canvasId,id))).orderBy(desc(canvasGenerationLinks.createdAt));
   return Promise.all(rows.map(async row=>{
    if(!row.taskId)return link(row);
    const task=await deps.readTask(sourceContext(ctx,row),row.taskId,db);
    if(!task||task.id!==row.taskId||task.userId!==ctx.userId||task.taskType!=="asset.generate")throw new OwnershipError("原生成任务不存在");
    if((task.attemptId!==row.attemptId&&task.idempotencyKey!==row.attemptId))throw new CanvasConflictError("原生成任务请求与预约不符");
    await this.assertFrozenGenerationInput(ctx,{attemptId:row.attemptId,inputData:task.inputData,taskId:task.id},db);
    const input=frozenInput(row);
    if(Object.prototype.hasOwnProperty.call(input,"projectId")&&task.projectId!==input.projectId)throw new CanvasConflictError("原生成任务项目与预约不符");
    const results=(await deps.readTaskResults(sourceContext(ctx,row),row.taskId,db)).filter(value=>value.resultType==="generated_asset"&&typeof value.assetId==="string"&&value.assetId.length>0);
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
   if(existing && (!rowOwned(ctx,existing)||existing.canvasId!==canvasId||existing.nodeId!==nodeId))throw new OwnershipError("生成请求不存在");
   if(existing){const current=await requireCanvas(ctx,canvasId);if(input.expectedRevision!==existing.inputRevision&&input.expectedRevision!==current.revision)throw new CanvasConflictError("生成请求版本与原提交不符");}
   let reservation=existing;
   if(!reservation){
    const reserved=await db.transaction(tx=>this.reserveGenerationInTransaction(ctx,canvasId,nodeId,input,tx as unknown as Db));
    [reservation]=await db.select().from(canvasGenerationLinks).where(eq(canvasGenerationLinks.id,reserved.link.id));
   }
   if(!reservation)throw new CanvasConflictError("生成请求未预留");
   reservation=await recoverReservation(ctx,reservation);
   const taskInput=frozenInput(reservation);
   const originalContext=sourceContext(ctx,reservation);
   if(taskInput.canvasOwner.inputDigest!==reservation.inputDigest)throw new CanvasConflictError("生成输入与原提交不符");
   // 用户明确继续原提交时只恢复预约冻结输入；后续编辑不改写原attempt，也不自动重发新任务。
   if(!reservation.taskId){await assertWritableWorkspace(db,originalContext);const currentCanvas=await requireCanvas(ctx,canvasId);if(currentCanvas.projectId)await deps.assertProject(originalContext,currentCanvas.projectId);}
   // Known link re-reads the original task; only an unknown submission invokes the original idempotent attempt again.
   const task=reservation.taskId?{id:reservation.taskId}:await deps.submitTask(originalContext,{attemptId:reservation.attemptId,inputData:taskInput});
   const original=await deps.readTask(originalContext,task.id,db);
   if(!original||original.id!==task.id||original.userId!==ctx.userId||original.taskType!=="asset.generate")throw new OwnershipError("原生成任务不存在");
   if((original.attemptId!==reservation.attemptId&&original.idempotencyKey!==reservation.attemptId)||Object.prototype.hasOwnProperty.call(taskInput,"projectId")&&original.projectId!==taskInput.projectId)throw new CanvasConflictError("原生成任务请求或项目与预约不符");
   await this.assertFrozenGenerationInput(ctx,{attemptId:reservation.attemptId,inputData:original.inputData,taskId:original.id},db);
   if(reservation.taskId && reservation.taskId!==task.id)throw new CanvasConflictError("生成任务与原请求不符");
   if(reservation.taskId)return link(reservation);
   const [saved]=await db.update(canvasGenerationLinks).set({taskId:task.id,updatedAt:now()}).where(and(eq(canvasGenerationLinks.id,reservation.id),workspaceFilter(canvasGenerationLinks,ctx),eq(canvasGenerationLinks.userId,ctx.userId))).returning();
   return link(saved!);
  },
 };
}
