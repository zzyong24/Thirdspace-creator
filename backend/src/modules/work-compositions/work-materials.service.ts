import {createHash} from "node:crypto";
import {and,eq,workMaterialAssociations,workMaterialReceipts,workDependencies,workCompositionRequests,OwnershipError,requireAccountId,type Db} from "@creatoros/backend";
import {ENDPOINTS,workCanvasContext,ErrorCode,workMaterialAttachBody,workMaterialReplaceBody,workMaterialDetachBody,workMaterialAssociation,workMaterialTarget,workRuleRef,workCompositionRequestResource,workDependency,workCommitReceipt,workTargetBelongsToMember,type RequestContext,type WorkMemberRef,type WorkMaterialTarget,type WorkAssetFile,type WorkContentSource,type WorkOwnerVersion,type WorkFieldTarget,type WorkCompositionRequestResource,type WorkMaterialAssociation,type WorkDependency,type WorkCommitReceipt,type WorkRuleRef} from "@creatoros/contract";
class ConflictError extends Error{readonly code=ErrorCode.ConflictError;}
// SEMANTIC_BOUNDARY_ALLOW: 摘要仅判定协议同一性、正式字段前值和明确引用，不理解创作内容。
const canonical=(value:unknown):string=>Array.isArray(value)?`[${value.map(canonical).join(",")}]`:value&&typeof value==="object"?`{${Object.entries(value).sort(([a],[b])=>a.localeCompare(b)).map(([key,item])=>`${JSON.stringify(key)}:${canonical(item)}`).join(",")}}`:JSON.stringify(value)??"null";
const digest=(value:unknown)=>createHash("sha256").update(canonical(value)).digest("hex");
type TargetState={version:WorkOwnerVersion;files:WorkAssetFile[];targetFiles?:WorkAssetFile[];field:WorkFieldTarget;value:unknown};
type Ports={
 /** 只读原Canvas实际装配事实；未装配不能宣称可进入。 */
 canvasAvailable?:(ctx:RequestContext,projectId:string,tx:Db)=>Promise<boolean>;
 lockMember:(ctx:RequestContext,compositionId:string,member:WorkMemberRef,tx:Db)=>Promise<{projectId:string;revision:number}>;
 /** 写时必须在同tx锁project→composition；读时只验权。 */
 assertComposition:(ctx:RequestContext,id:string,tx:Db,forUpdate?:boolean)=>Promise<void>;
 assertFile:(ctx:RequestContext,projectId:string,file:WorkAssetFile,tx:Db,context?:{member:WorkMemberRef;target:WorkMaterialTarget})=>Promise<void>;
 assertSource:(ctx:RequestContext,projectId:string,source:WorkContentSource,tx:Db)=>Promise<void>;
 sourceRules:(ctx:RequestContext,projectId:string,source:WorkContentSource,tx:Db)=>Promise<WorkRuleRef[]>;
 readTarget:(ctx:RequestContext,member:WorkMemberRef,target:WorkMaterialTarget,tx:Db)=>Promise<TargetState>;
 writeTarget:(ctx:RequestContext,input:{member:WorkMemberRef;target:WorkMaterialTarget;expectedVersion:WorkOwnerVersion;operation:"attach"|"replace"|"detach";file:WorkAssetFile;expectedFile:WorkAssetFile|null;position:number|null;clientRequestId:string},tx:Db)=>Promise<{state:TargetState;receipt:WorkCommitReceipt}>;
};
export function createWorkMaterialsService(deps:{db:Db;now:()=>string;nextId:(p:string)=>string;ports:Ports}){
 const {db,now,nextId,ports}=deps,account=(ctx:RequestContext)=>requireAccountId(ctx.accountId);
 const scope=(table:typeof workMaterialAssociations|typeof workMaterialReceipts|typeof workDependencies,ctx:RequestContext,id:string)=>and(eq(table.compositionId,id),eq(table.userId,ctx.userId),eq(table.accountId,account(ctx)));
 async function change(ctx:RequestContext,id:string,operation:"attach"|"replace"|"detach",raw:unknown){
  const input=operation==="attach"?workMaterialAttachBody.parse(raw):operation==="replace"?workMaterialReplaceBody.parse(raw):workMaterialDetachBody.parse(raw);
  const requestDigest=digest({compositionId:id,operation:`materials.${operation}`,input});
  return db.transaction(async transaction=>{
   const tx=transaction as unknown as Db;await ports.assertComposition(ctx,id,tx,true);
   const requestScope=and(eq(workCompositionRequests.userId,ctx.userId),eq(workCompositionRequests.accountId,account(ctx)),eq(workCompositionRequests.requestId,input.clientRequestId));
   await tx.insert(workCompositionRequests).values({id:nextId("work-request"),userId:ctx.userId,accountId:account(ctx),compositionId:id,requestId:input.clientRequestId,requestDigest,operation:`materials.${operation}`,input,status:"reserved",createdAt:now()}).onConflictDoNothing();
   const [reserved]=await tx.select().from(workCompositionRequests).where(requestScope).for("update");
   if(!reserved||reserved.compositionId!==id||reserved.requestDigest!==requestDigest)throw new ConflictError("同一物料请求不能改变组合或输入");
   const [old]=await tx.select().from(workMaterialReceipts).where(and(scope(workMaterialReceipts,ctx,id),eq(workMaterialReceipts.requestId,input.clientRequestId))).for("update");
   if(old){if(old.requestDigest!==requestDigest)throw new ConflictError("同一物料请求不能改变输入");const saved=old.snapshot as {association:unknown;request:unknown};return{association:workMaterialAssociation.parse(saved.association),request:workCompositionRequestResource.parse(saved.request)};}
   if(reserved.status!=="reserved")throw new ConflictError("原物料提交回执缺失，请读取原请求");
   let prior:WorkMaterialAssociation|null=null,priorRules:WorkRuleRef[]=[];
   if("associationId"in input){const [row]=await tx.select().from(workMaterialAssociations).where(and(scope(workMaterialAssociations,ctx,id),eq(workMaterialAssociations.id,input.associationId))).for("update");if(!row)throw new OwnershipError("物料关联不存在");prior=workMaterialAssociation.parse(row.snapshot);priorRules=workRuleRef.array().parse(row.ruleRefs);if(prior.status!=="attached")throw new ConflictError("物料已解除关联");if(canonical(prior.file)!==canonical(input.expectedFile))throw new ConflictError("物料文件已变化，原选择保留");}
   const member="member"in input?input.member:prior!.member,target="target"in input?input.target:prior!.target;
   const owner=await ports.lockMember(ctx,id,member,tx),current=await ports.readTarget(ctx,member,target,tx);
   if(canonical(current.version)!==canonical(input.expectedOwnerVersion))throw new ConflictError("稿件已更新，物料选择保留，请读取当前稿件");
   const file="file"in input?input.file:prior!.file,source="source"in input?input.source:prior!.source;
   if(prior&&!(current.targetFiles??current.files).some(item=>canonical(item)===canonical(prior!.file)))throw new ConflictError("稿件已移除或替换该物料，请读取当前稿件");
   if(operation!=="detach"){await ports.assertFile(ctx,owner.projectId,file,tx,{member,target});if(source)await ports.assertSource(ctx,owner.projectId,source,tx);}
   const associationRules=operation==="detach"?priorRules:source?await ports.sourceRules(ctx,owner.projectId,source,tx):[];
   const associationId=prior?.associationId??nextId("work-material"),ownerCommandId=`work-material-owner-${nextId("command")}`,ownerCommit=await ports.writeTarget(ctx,{member,target,expectedVersion:input.expectedOwnerVersion,operation,file,expectedFile:prior?.file??null,position:"position"in input?input.position:null,clientRequestId:ownerCommandId},tx);
   const committed=ownerCommit.state,commitReceipt=workCommitReceipt.parse(ownerCommit.receipt);
   const receiptVersion=commitReceipt.kind==="AI_adopt"?commitReceipt.receipt.version:commitReceipt.version;
   const receiptCommandId=commitReceipt.kind==="AI_adopt"?commitReceipt.receipt.clientRequestId:commitReceipt.clientRequestId;if(receiptCommandId!==ownerCommandId)throw new ConflictError("原owner提交回执不属于本次物料命令");
   if(canonical(receiptVersion)!==canonical(committed.version))throw new ConflictError("原owner提交回执与物料版本不一致");
   if(committed.version.kind==="not_saved")throw new ConflictError("物料修改没有正式owner版本");
   if(!workTargetBelongsToMember(member,committed.field)||canonical(current.field)!==canonical(committed.field))throw new ConflictError("原owner写后触点与所选用途不一致");
   const expectedFiles=[...current.files];if(prior){const index=expectedFiles.findIndex(item=>canonical(item)===canonical(prior!.file));if(index<0)throw new ConflictError("原物料已变化");expectedFiles.splice(index,1);}if(operation!=="detach")expectedFiles.push(file);
   const identities=(items:WorkAssetFile[])=>items.map(canonical).sort();
   if(canonical(identities(expectedFiles))!==canonical(identities(committed.files)))throw new ConflictError("原owner物料提交未对应确切文件变更");
   if(committed.targetFiles!==undefined){const selected=operation==='detach'?[]:[file];if(canonical(identities(committed.targetFiles))!==canonical(identities(selected)))throw new ConflictError('原owner写后的明确素材触点不符');}
   const association=workMaterialAssociation.parse({associationId,compositionId:id,member,target,file,source,ownerVersion:committed.version,clientRequestId:input.clientRequestId,requestDigest,status:operation==="detach"?"detached":"attached",createdAt:prior?.createdAt??now()});
   const request=workCompositionRequestResource.parse({compositionId:id,clientRequestId:input.clientRequestId,requestDigest,operation:`materials.${operation}`,input,status:"committed",resultRevision:owner.revision,memberReservation:null,errorCode:null,createdAt:reserved.createdAt});
   if(prior)await tx.update(workMaterialAssociations).set({snapshot:association,ruleRefs:associationRules}).where(and(scope(workMaterialAssociations,ctx,id),eq(workMaterialAssociations.id,associationId)));else await tx.insert(workMaterialAssociations).values({id:associationId,userId:ctx.userId,accountId:account(ctx),projectId:owner.projectId,compositionId:id,snapshot:association,ruleRefs:associationRules,createdAt:association.createdAt});
   await tx.update(workCompositionRequests).set({status:"committed",resultRevision:owner.revision}).where(requestScope);
   await tx.insert(workMaterialReceipts).values({id:nextId("work-material-receipt"),userId:ctx.userId,accountId:account(ctx),compositionId:id,requestId:input.clientRequestId,requestDigest,snapshot:{association,request},createdAt:request.createdAt});
   // SEMANTIC_BOUNDARY_ALLOW: 原触点前值与明确依赖身份的机械状态，不解释内容冲突。
   const existingDependencies=await tx.select().from(workDependencies).where(scope(workDependencies,ctx,id));
   for(const row of existingDependencies){const previous=workDependency.parse(row.snapshot);if(canonical(previous.target)===canonical(committed.field)&&previous.status==="current")await tx.update(workDependencies).set({snapshot:{...previous,status:"historical"}}).where(eq(workDependencies.id,row.id));}
   const attached=await tx.select().from(workMaterialAssociations).where(scope(workMaterialAssociations,ctx,id));
   const currentSources:WorkContentSource[]=[],currentRules:WorkRuleRef[]=[];
   for(const row of attached){const material=workMaterialAssociation.parse(row.snapshot);if(material.status!=="attached"||canonical(material.member)!==canonical(member)||!committed.files.some(file=>canonical(file)===canonical(material.file)))continue;let materialField:WorkFieldTarget;try{const selected=await ports.readTarget(ctx,material.member,material.target,tx);if(!(selected.targetFiles??selected.files).some(file=>canonical(file)===canonical(material.file)))continue;materialField=selected.field;}catch(error){if((error as {code?:string}).code===ErrorCode.OwnershipError)continue;throw error;}if(canonical(materialField)!==canonical(committed.field)||!material.source)continue;if(!currentSources.some(ref=>canonical(ref)===canonical(material.source)))currentSources.push(material.source);for(const rule of workRuleRef.array().parse(row.ruleRefs))if(!currentRules.some(ref=>ref.versionId===rule.versionId))currentRules.push(rule);}
   const dependency=workDependency.parse({dependencyId:nextId("work-dependency"),compositionId:id,member,target:committed.field,targetVersion:committed.version,targetFingerprint:digest(committed.value),sources:currentSources,sourceRefs:currentSources,files:committed.files,ruleRefs:currentRules,commitReceipt,status:"current",createdAt:now()});
   await tx.insert(workDependencies).values({id:dependency.dependencyId,userId:ctx.userId,accountId:account(ctx),projectId:owner.projectId,compositionId:id,snapshot:dependency,materialTarget:target,createdAt:dependency.createdAt});
   return{association,request};
  });
 }
 return{
  async canvasContext(ctx:RequestContext,id:string,raw:unknown){
   const input=ENDPOINTS.getWorkCompositionCanvasContext.body!.parse(raw);
   return db.transaction(async transaction=>{
    const tx=transaction as unknown as Db;
    await ports.assertComposition(ctx,id,tx);
    const owner=await ports.lockMember(ctx,id,input.member,tx);
    const actual=await ports.readTarget(ctx,input.member,input.target,tx);
    if(canonical(actual.version)!==canonical(input.ownerVersion))throw new ConflictError("稿件或素材位置已更新，请保留原选择并读取当前稿件");
    await ports.assertSource(ctx,owner.projectId,input.source,tx);
    const available=await ports.canvasAvailable?.(ctx,owner.projectId,tx)??false;
    return workCanvasContext.parse({compositionId:id,member:input.member,ownerVersion:actual.version,source:input.source,target:input.target,availability:available?"available":"unavailable",reasonCode:available?null:"CANVAS_NOT_ASSEMBLED"});
   });
  },
  attach:(ctx:RequestContext,id:string,input:unknown)=>change(ctx,id,"attach",input),
  replace:(ctx:RequestContext,id:string,input:unknown)=>change(ctx,id,"replace",input),
  detach:(ctx:RequestContext,id:string,input:unknown)=>change(ctx,id,"detach",input),
  async list(ctx:RequestContext,id:string){await ports.assertComposition(ctx,id,db);const rows=await db.select().from(workMaterialAssociations).where(scope(workMaterialAssociations,ctx,id));return rows.map(row=>workMaterialAssociation.parse(row.snapshot));},
  async dependencies(ctx:RequestContext,id:string){await ports.assertComposition(ctx,id,db);const rows=await db.select().from(workDependencies).where(scope(workDependencies,ctx,id));return Promise.all(rows.map(async row=>{const dependency=workDependency.parse(row.snapshot);if(dependency.status!=="current"||!row.materialTarget)return dependency;try{const actual=await ports.readTarget(ctx,dependency.member,workMaterialTarget.parse(row.materialTarget),db);return workDependency.parse({...dependency,status:digest(actual.value)===dependency.targetFingerprint?"current":"needs_review"});}catch(error){if((error as {code?:string}).code!==ErrorCode.OwnershipError)throw error;return workDependency.parse({...dependency,status:"needs_review"});}}));},
 };
}
export type WorkMaterialsService=ReturnType<typeof createWorkMaterialsService>;
