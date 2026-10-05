import {workSourceSelectBody,workSourceSelectResult,type SavedOutputSourcePick} from "@creatoros/contract";
import {createHash} from "node:crypto";
import {z} from "zod";
import type {Db} from "@creatoros/backend";
import {id, workFingerprint, workSourceRef, momentsSourceSelection,
  workBasisSelection, momentsSourceAnchor, workBasisSourceAnchor, momentsVersion,
  workBasisVersion, workBasisClaim, workBasisFactItem, workRuleRef, graphicPostCardBriefs, outputConversionRequest, outputConversionSourceAnchor,
  type RequestContext, type WorkSourceRef, type WorkAssetFile} from "@creatoros/contract";

// SEMANTIC_BOUNDARY_ALLOW: 只比较真实身份、选区、字符边界和机械摘要，不理解或选择创作内容。
export function sourceCanonical(value:unknown):string {
 if(Array.isArray(value))return `[${value.map(sourceCanonical).join(",")}]`;
 if(value && typeof value==="object")return `{${Object.entries(value).sort(([a],[b])=>a.localeCompare(b)).map(([k,v])=>`${JSON.stringify(k)}:${sourceCanonical(v)}`).join(",")}}`;
 return JSON.stringify(value)??"null";
}
export const sourceDigest=(value:unknown)=>createHash("sha256").update(sourceCanonical(value)).digest("hex");
export const sourceTextDigest=(text:string)=>createHash("sha256").update(text).digest("hex");
function fail(code:string,message:string):never {throw Object.assign(new Error(message),{code});}
function same(a:unknown,b:unknown){return sourceCanonical(a)===sourceCanonical(b);}
function splitPair(text:string,at:number){return at>0&&at<text.length&&text.charCodeAt(at-1)>=0xd800&&text.charCodeAt(at-1)<=0xdbff&&text.charCodeAt(at)>=0xdc00&&text.charCodeAt(at)<=0xdfff;}
export const workSourceOutputContent=z.object({fields:z.object({title:z.string().optional(),summary:z.string().optional(),body:z.union([z.string(),z.array(z.string())]).optional(),tags:z.array(z.string()).optional(),script:z.union([z.string(),z.array(z.string())]).optional(),cardBriefs:graphicPostCardBriefs.optional()}).strict(),sections:z.array(z.object({sectionId:id,heading:z.string(),body:z.string(),sourceRefs:z.array(workSourceRef)}).strict())}).strict();
export const workSourceConstraints=z.object({sourceRefs:z.array(z.object({location:z.string(),refs:z.array(workSourceRef)}).strict()),factItems:z.array(workBasisFactItem),ruleSnapshotRef:z.union([workRuleRef,z.array(workRuleRef),z.null()])}).strict();
const common={schemaVersion:z.literal(1),projectId:id,source:workSourceRef,contentDigest:workFingerprint};
export const workFrozenSource=z.discriminatedUnion("kind",[
 z.object({...common,kind:z.literal("output"),content:workSourceOutputContent,constraints:workSourceConstraints}).strict(),
 z.object({...common,kind:z.literal("moments"),content:z.object({text:z.string().optional(),textFragments:z.array(z.string()).optional(),imageUses:z.array(z.object({assetId:id,assetFileId:id,order:z.number().int().nonnegative()}).strict()).optional()}).strict(),constraints:workSourceConstraints}).strict(),
 z.object({...common,kind:z.literal("basis"),content:z.object({topic:z.string().optional(),claims:z.array(workBasisClaim).optional(),factItems:z.array(workBasisFactItem).optional()}).strict(),constraints:workSourceConstraints}).strict(),
 z.object({...common,kind:z.literal("legacy"),content:z.object({text:z.string()}).strict(),constraints:workSourceConstraints}).strict(),
]).superRefine((v,ctx)=>{
 const expected=v.kind==="output"?"output_version":v.kind==="moments"?"moments_version":v.kind==="basis"?"work_basis_version":null;
 if(expected?v.source.kind!==expected:!["project","asset","intelligence","project_script"].includes(v.source.kind))
  ctx.addIssue({code:"custom",message:"冻结内容类型与来源锚点不一致"});
});
export type WorkFrozenSource=z.infer<typeof workFrozenSource>;
/** 每个函数必须由对应 owner 公共服务实现，工厂必须绑定传入 tx。
 * readIntelligenceSnapshot 是待新增的纯只读 owner seam；不能用有写副作用的 getItem 冒充。
 */
export interface WorkSourcePorts {
 ownerProject(ctx:RequestContext,kind:"moments"|"basis",ownerId:string):Promise<string>;
 readProjectScriptVersion?:(ctx:RequestContext,ref:import("@creatoros/contract").ProjectScriptSourceRef,projectId:string)=>Promise<{text:string}>;
 projects:{getProject(ctx:RequestContext,id:string):Promise<{id:string;updatedAt:string;brief?:string|null}>};
 assets:{assertAssetFileOwned(ctx:RequestContext,assetId:string,fileId:string,requireActive:boolean):Promise<void>;
   getAsset(ctx:RequestContext,assetId:string):Promise<{assetType:string}>;
   readDocumentFileSource(ctx:RequestContext,assetId:string,fileId:string):Promise<{text:string;label:string}>};
 assertAssetLinkedToProject(ctx:RequestContext,projectId:string,assetId:string):Promise<void>;
 readIntelligenceSnapshot(ctx:RequestContext,itemId:string,snapshotId:string):Promise<{itemId:string;versionId:string;text:string}>;
 moments:{readVersion(ctx:RequestContext,id:string,versionId:string):Promise<unknown>};
 compositions:{basisVersion(ctx:RequestContext,id:string,versionId:string):Promise<unknown>};
 conversion:{selectSavedSource(ctx:RequestContext,pick:SavedOutputSourcePick):Promise<{projectId:string;sourceAnchor:z.infer<typeof outputConversionSourceAnchor>;content:z.infer<typeof workSourceOutputContent>;constraints:z.infer<typeof workSourceConstraints>}>;freeze(ctx:RequestContext,request:z.infer<typeof outputConversionRequest>):Promise<{projectId:string;sourceAnchor:z.infer<typeof outputConversionSourceAnchor>;content:z.infer<typeof workSourceOutputContent>;constraints:z.infer<typeof workSourceConstraints>}>;restore(ctx:RequestContext,request:z.infer<typeof outputConversionRequest>,anchor:z.infer<typeof outputConversionSourceAnchor>):Promise<{projectId:string;sourceAnchor:z.infer<typeof outputConversionSourceAnchor>;content:z.infer<typeof workSourceOutputContent>;constraints:z.infer<typeof workSourceConstraints>}>};
}
export const momentsSourcePick=z.object({kind:z.literal("moments_version"),momentsId:id,versionId:id,selection:momentsSourceSelection}).strict();
export const basisSourcePick=z.object({kind:z.literal("work_basis_version"),compositionId:id,versionId:id,selection:workBasisSelection}).strict();
export const outputSourcePick=outputConversionSourceAnchor.omit({artifactId:true,selectionDigest:true});
function frozen(projectId:string,source:WorkSourceRef,kind:WorkFrozenSource["kind"],content:unknown,refs:Array<{location:string;refs:WorkSourceRef[]}>,factItems:unknown[]=[],ruleSnapshotRef:unknown=null):WorkFrozenSource {
 const payload={schemaVersion:1,projectId,source,kind,content,constraints:{sourceRefs:refs,factItems,ruleSnapshotRef}};
 return structuredClone(workFrozenSource.parse({...payload,contentDigest:sourceDigest(payload)}));
}
function conversionRequest(anchor:z.infer<typeof outputSourcePick>){
 // 另一类型只满足已有 restore 的机械协议，不建立目标、不产生创作选择。
 const targetType=anchor.sourceType==="article"?"image" as const:"article" as const;
 const common={sourceOutputId:anchor.sourceOutputId,sourceVersionId:anchor.versionId,targetType,clientRequestId:"verify-work-source",reuseImages:[]};
 return outputConversionRequest.parse(anchor.selection.mode==="whole"?{...common,mode:"whole"}:{...common,...anchor.selection,targetFields:targetType==="image"?["body"]:["sections"]});
}
export function createWorkSourceService(factory:(tx:Db)=>WorkSourcePorts){
 async function assertFile(ctx:RequestContext,projectId:string,file:WorkAssetFile,tx:Db){const ports=factory(tx);await ports.projects.getProject(ctx,projectId);await ports.assets.assertAssetFileOwned(ctx,file.assetId,file.assetFileId,false);await ports.assertAssetLinkedToProject(ctx,projectId,file.assetId);}
 async function selectMoments(ctx:RequestContext,projectId:string,raw:unknown,tx:Db){
  const input=momentsSourcePick.parse(raw),ports=factory(tx);await ports.projects.getProject(ctx,projectId);
  const version=momentsVersion.parse(await ports.moments.readVersion(ctx,input.momentsId,input.versionId));
  if(version.momentsId!==input.momentsId||version.versionId!==input.versionId)fail("SOURCE_ANCHOR_CONFLICT","朋友圈历史身份不一致");
  // readVersion 本身不返回 projectId：必须经 owner get 仅鉴权归属，见 resolveOwnerProject 必选适配。
  await resolveOwnerProject(ports,ctx,projectId,"moments",input.momentsId);
  const doc=version.document,selection=input.selection.mode==="whole"?input.selection:{...input.selection,fields:[...input.selection.fields].sort(),textRanges:[...input.selection.textRanges].sort((a,b)=>a.start-b.start)};
  const content:{text?:string;textFragments?:string[];imageUses?:typeof doc.imageUses}={};
  if(selection.mode==="whole"||selection.fields.includes("text"))content.text=doc.text;
  if(selection.mode==="whole"||selection.fields.includes("imageUses"))content.imageUses=doc.imageUses;
  if(selection.mode==="selected"&&selection.textRanges.length){content.textFragments=selection.textRanges.map(range=>{if(range.end>doc.text.length||sourceTextDigest(doc.text)!==range.textDigest||splitPair(doc.text,range.start)||splitPair(doc.text,range.end))fail("SOURCE_SELECTION_INVALID","朋友圈范围、全文摘要或 UTF-16 边界不一致");return doc.text.slice(range.start,range.end);});}
  const identity={kind:"moments_version" as const,momentsId:version.momentsId,artifactId:version.artifactId,versionId:version.versionId,selection};
  const anchor=momentsSourceAnchor.parse({...identity,selectionDigest:sourceDigest(identity)});
  return frozen(projectId,anchor,"moments",content,[{location:"document",refs:doc.sourceRefs}]);
 }
 async function selectBasis(ctx:RequestContext,projectId:string,raw:unknown,tx:Db){
  const input=basisSourcePick.parse(raw),ports=factory(tx);await ports.projects.getProject(ctx,projectId);
  const version=workBasisVersion.parse(await ports.compositions.basisVersion(ctx,input.compositionId,input.versionId));
  if(version.compositionId!==input.compositionId||version.versionId!==input.versionId)fail("SOURCE_ANCHOR_CONFLICT","依据历史身份不一致");
  await resolveOwnerProject(ports,ctx,projectId,"basis",input.compositionId);
  const doc=version.document,selection=input.selection.mode==="whole"?input.selection:{...input.selection,fields:[...input.selection.fields].sort(),claimIds:doc.claims.filter(x=>input.selection.mode==="selected"&&input.selection.claimIds.includes(x.id)).map(x=>x.id),factItemIds:doc.factItems.filter(x=>input.selection.mode==="selected"&&input.selection.factItemIds.includes(x.id)).map(x=>x.id)};
  if(input.selection.mode==="selected"&&(selection.mode!=="selected"||selection.claimIds.length!==input.selection.claimIds.length||selection.factItemIds.length!==input.selection.factItemIds.length))fail("SOURCE_SELECTION_INVALID","所选观点或事实 ID 不存在");
  const selected=selection.mode==="selected"?selection:null;
  const whole=selected===null,fields=selected?.fields??[];
  const content={...(whole||fields.includes("topic")?{topic:doc.topic}:{}),...(whole||fields.includes("claims")||(selected&&selected.claimIds.length)?{claims:whole||fields.includes("claims")?doc.claims:doc.claims.filter(x=>selected&&selected.claimIds.includes(x.id))}:{}),...(whole||fields.includes("factItems")||(selected&&selected.factItemIds.length)?{factItems:whole||fields.includes("factItems")?doc.factItems:doc.factItems.filter(x=>selected&&selected.factItemIds.includes(x.id))}:{})};
  const identity={kind:"work_basis_version" as const,compositionId:version.compositionId,artifactId:version.artifactId,versionId:version.versionId,selection};
  const anchor=workBasisSourceAnchor.parse({...identity,selectionDigest:sourceDigest(identity)});
  return frozen(projectId,anchor,"basis",content,[{location:"document",refs:doc.sourceRefs},...(content.claims??[]).map(x=>({location:`claim:${x.id}`,refs:x.sourceRefs})),...(content.factItems??[]).map(x=>({location:`fact:${x.id}`,refs:x.sourceRefs}))],content.factItems??[],doc.ruleRefs);
 }
 async function read(ctx:RequestContext,projectId:string,raw:unknown,tx:Db):Promise<WorkFrozenSource>{
  const ref=workSourceRef.parse(raw),ports=factory(tx);await ports.projects.getProject(ctx,projectId);
  if(ref.kind==="moments_version"||ref.kind==="work_basis_version"){
   const saved=ref.kind==="moments_version"?await selectMoments(ctx,projectId,{kind:ref.kind,momentsId:ref.momentsId,versionId:ref.versionId,selection:ref.selection},tx):await selectBasis(ctx,projectId,{kind:ref.kind,compositionId:ref.compositionId,versionId:ref.versionId,selection:ref.selection},tx);
   if(!same(saved.source,ref))fail("SOURCE_ANCHOR_CONFLICT","历史身份或标准化选区摘要不一致");return saved;
  }
  if(ref.kind==="output_version"){
   const saved=await ports.conversion.restore(ctx,conversionRequest(ref),ref);
   if(saved.projectId!==projectId||!same(saved.sourceAnchor,ref))fail("SOURCE_ANCHOR_CONFLICT","具体作品归属或锚点不一致");
   return frozen(projectId,ref,"output",saved.content,saved.constraints.sourceRefs,saved.constraints.factItems,saved.constraints.ruleSnapshotRef);
  }
  if(ref.kind==="project_script"){
   if(!ports.readProjectScriptVersion)fail("SOURCE_HISTORY_UNAVAILABLE","主脚本历史读取暂不可用");
   const saved=await ports.readProjectScriptVersion!(ctx,ref,projectId);
   return frozen(projectId,ref,"legacy",{text:saved.text},[]);
  }
  if(ref.kind==="asset"){
   await assertFile(ctx,projectId,{assetId:ref.id,assetFileId:ref.versionId},tx);
   const asset=await ports.assets.getAsset(ctx,ref.id);
   const text=asset.assetType==="document"?(await ports.assets.readDocumentFileSource(ctx,ref.id,ref.versionId)).text:"";
   return frozen(projectId,ref,"legacy",{text},[]);
  }
  if(ref.kind==="intelligence"){
   const saved=await ports.readIntelligenceSnapshot(ctx,ref.id,ref.versionId);
   if(saved.itemId!==ref.id||saved.versionId!==ref.versionId)fail("SOURCE_ANCHOR_CONFLICT","雷达历史快照身份不一致");
   return frozen(projectId,ref,"legacy",{text:saved.text},[]);
  }
  if(ref.id!==projectId)fail("SOURCE_ANCHOR_CONFLICT","来源项目不一致");
  const project=await ports.projects.getProject(ctx,ref.id);
  if(project.updatedAt!==ref.versionId)fail("SOURCE_HISTORY_UNAVAILABLE","项目旧 Brief 无公开不可变读取端口，不能换成当前内容");
  return frozen(projectId,ref,"legacy",{text:project.brief??""},[]);
 }
 async function selectOutput(ctx:RequestContext,projectId:string,raw:unknown,tx:Db){
  const input=outputSourcePick.parse(raw),saved=await factory(tx).conversion.freeze(ctx,conversionRequest(input));
  if(saved.projectId!==projectId||saved.sourceAnchor.sourceType!==input.sourceType)
    fail("SOURCE_ANCHOR_CONFLICT","来源作品类型或项目不一致");
  return frozen(projectId,saved.sourceAnchor,"output",saved.content,saved.constraints.sourceRefs,saved.constraints.factItems,saved.constraints.ruleSnapshotRef);
 }
 async function restoreSnapshot(ctx:RequestContext,projectId:string,raw:unknown,tx:Db){
  const snapshot=workFrozenSource.parse(raw),{contentDigest,...payload}=snapshot;
  if(snapshot.projectId!==projectId||sourceDigest(payload)!==contentDigest)
    fail("SOURCE_SNAPSHOT_CONFLICT","冻结快照身份或完整摘要不一致");
  const saved=await read(ctx,projectId,snapshot.source,tx);
  if(!same(saved,snapshot))fail("SOURCE_SNAPSHOT_CONFLICT","快照与真实历史来源不一致");
  return saved;
 }
 async function select(ctx:RequestContext,raw:unknown,tx:Db){
  const {projectId,pick}=workSourceSelectBody.parse(raw),ports=factory(tx);await ports.projects.getProject(ctx,projectId);
  if(pick.kind==="output_version"){
   const saved=await ports.conversion.selectSavedSource(ctx,pick);
   if(saved.projectId!==projectId||saved.sourceAnchor.kind!==pick.kind||saved.sourceAnchor.sourceOutputId!==pick.sourceOutputId||saved.sourceAnchor.versionId!==pick.versionId)fail("SOURCE_ANCHOR_CONFLICT","历史具体作品来源身份或项目不一致");
   return workSourceSelectResult.parse({source:saved.sourceAnchor});
  }
  const saved=pick.kind==="work_basis_version"?await selectBasis(ctx,projectId,pick,tx):await (async()=>{
   const version=momentsVersion.parse(await ports.moments.readVersion(ctx,pick.momentsId,pick.versionId));
   if(version.momentsId!==pick.momentsId||version.versionId!==pick.versionId)fail("SOURCE_ANCHOR_CONFLICT","朋友圈历史身份不一致");
   const selection=pick.selection.mode==="whole"?pick.selection:{...pick.selection,textRanges:pick.selection.textRanges.map(range=>({...range,textDigest:sourceTextDigest(version.document.text)}))};
   return selectMoments(ctx,projectId,{...pick,selection},tx);
  })();
  return workSourceSelectResult.parse({source:saved.source});
 }
 return {select,read,restoreSnapshot,selectOutput,selectMoments,selectBasis,assertFile,assertSource:async(ctx:RequestContext,projectId:string,ref:WorkSourceRef,tx:Db)=>{await read(ctx,projectId,ref,tx);}};
}
/** 必须通过 Moments.get / WorkCompositions.get 的公开 owner 读取真实 projectId。
 * 此 seam 只读身份；不把 owner 当前正文放入历史 payload。 */
async function resolveOwnerProject(ports:WorkSourcePorts,ctx:RequestContext,projectId:string,kind:"moments"|"basis",ownerId:string){
 const actual=await ports.ownerProject(ctx,kind,ownerId);
 if(actual!==projectId)fail("SOURCE_ANCHOR_CONFLICT","历史来源不属于目标项目");
}
