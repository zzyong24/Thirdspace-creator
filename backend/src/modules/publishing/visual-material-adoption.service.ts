import {createHash} from "node:crypto";
import {ENDPOINTS,publicationVisualNoteSchema,type RequestContext,type PublicationVisualNote} from "@creatoros/contract";
export interface CanvasMaterialSelection {nodeId:string;taskId?:string;resultId?:string;}
export interface CanvasMaterialPlan {canvasId:string;projectId:string|null;revision:number;group:{id:string;libraryKind:"cover"|"xhs";caption:string;aspectRatio:string;pageOrder:string[]};pages:Array<CanvasMaterialSelection&{assetId:string;fileId?:string;checksum?:string}>;}
import type {PublishingService} from "./publishing.service";
import {ConflictError,OwnershipError,ValidationError,requireAccountId} from "./publishing.errors";
export interface CanvasVisualMaterialPort {
 get:(ctx:RequestContext,id:string)=>Promise<{revision:number;projectId:string|null}>;
 resolveMaterialSelections:(ctx:RequestContext,id:string,input:{expectedRevision:number;groupId:string;selections:CanvasMaterialSelection[]})=>Promise<CanvasMaterialPlan>;
 verifyMaterialSettlement:(ctx:RequestContext,plan:CanvasMaterialPlan)=>Promise<void>;
}
export interface VisualMaterialAdoptionDeps {
 canvas:CanvasVisualMaterialPort;
 confirmGeneratedTask:(ctx:RequestContext,taskId:string)=>Promise<unknown>;
 assertFrozenImage:(ctx:RequestContext,assetId:string,fileId?:string,checksum?:string)=>Promise<{fileId:string;checksum:string}>;
 assertOutputProject:(ctx:RequestContext,outputId:string,projectId:string)=>Promise<void>;
 publishing:Pick<PublishingService,"adoptDraft"|"adoptVisualRevision"|"getPublication"|"readRevision"|"getVisualAdoptionRevision">;
}
export function createVisualMaterialAdoptionService(deps:VisualMaterialAdoptionDeps){return {
 async adopt(ctx:RequestContext,canvasId:string,raw:unknown){
  const input=ENDPOINTS.adoptCanvasMaterial.body!.parse(raw),accountId=requireAccountId(ctx.accountId,"canvas.material.adopt");
  const plan=await deps.canvas.resolveMaterialSelections(ctx,canvasId,input);
  if(!plan.projectId)throw new ConflictError("请先将画布关联到目标项目");
  await deps.assertOutputProject(ctx,input.outputId,plan.projectId);
  if(plan.group.libraryKind==="xhs"&&input.platform!=="xiaohongshu")throw new ValidationError("小红书图文需要选择小红书平台");
  if(plan.group.libraryKind==="cover"&&plan.pages.length!==1)throw new ValidationError("封面制作只采纳一张封面");
  const previous=input.publicationId?await deps.publishing.getPublication(ctx,input.publicationId):null;
  if(previous&&(previous.contentOutputId!==input.outputId||previous.platform!==input.platform))throw new OwnershipError("发布草稿不属于目标稿件与平台");
  const base=previous?await deps.publishing.readRevision(ctx,previous.id,input.expectedCurrentRevisionId!):null;
  // 素材激活沿原确认端口；CAS失败保留已采纳素材，不回滚成功候选或伪造整组成功。
  for(const page of plan.pages)if(page.taskId)await deps.confirmGeneratedTask(ctx,page.taskId);
  await deps.canvas.verifyMaterialSettlement(ctx,plan);
  const pages=await Promise.all(plan.pages.map(async page=>{const frozen=await deps.assertFrozenImage(ctx,page.assetId,page.fileId,page.checksum);if(page.fileId&&page.fileId!==frozen.fileId||page.checksum&&page.checksum!==frozen.checksum)throw new ConflictError("采纳图片文件版本已变化");return {...page,...frozen};}));
  const current=await deps.canvas.get(ctx,canvasId);if(current.revision!==plan.revision||current.projectId!==plan.projectId)throw new ConflictError("采纳期间画布版本已变化");
  await deps.assertOutputProject(ctx,input.outputId,plan.projectId);
  const receipts=pages.map(({assetId:_assetId,...receipt})=>receipt);
  const visualNote:PublicationVisualNote={schemaVersion:1,sourceCanvasId:canvasId,sourceGroupId:plan.group.id,sourceCanvasRevision:plan.revision,imageMode:pages.length===1?"single_cover":"carousel",aspectRatio:plan.group.aspectRatio,orderedAssetIds:pages.map(page=>page.assetId),pageReceipts:receipts};
  const settings={...(base?.platformSettings??{})} as Record<string,unknown>;
  const isCover=plan.group.libraryKind==="cover";
  if(isCover&&base){
   settings.visualCover=visualNote;
   const oldNote=publicationVisualNoteSchema.safeParse(settings.visualNote);
   if(oldNote.success)settings.visualNote={...oldNote.data,orderedAssetIds:[pages[0]!.assetId,...oldNote.data.orderedAssetIds.slice(1)],pageReceipts:[receipts[0]!,...oldNote.data.pageReceipts.slice(1)]};
  }else settings.visualNote=visualNote;
  // SEMANTIC_BOUNDARY_ALLOW: 稳定采纳键仅识别用户已授权的同一次提交，不做内容选择。
  const adoptionKey="canvas-visual:"+createHash("sha256").update(JSON.stringify([ctx.userId,accountId,canvasId,plan.group.id,input.attemptId])).digest("hex");
  const revision={outputId:input.outputId,adoptionKey,platform:input.platform,title:input.title,description:isCover&&base?base.description:plan.group.caption,platformTags:(base?.platformTags??[]) as string[],category:base?.category??"",series:base?.series??"",coverAssetId:pages[0]!.assetId,platformSettings:settings};
  if(previous)return deps.publishing.adoptVisualRevision(ctx,{...revision,publicationId:previous.id,expectedCurrentRevisionId:input.expectedCurrentRevisionId!});
  const publication=await deps.publishing.adoptDraft(ctx,revision);
  if("kind" in publication && publication.kind==="unassigned")throw new ConflictError("物料已保存，请选择发布账号后采纳到发布草稿");
  return {publication,revision:await deps.publishing.getVisualAdoptionRevision(ctx,publication.id,adoptionKey)};
 },
};}
export type VisualMaterialAdoptionService=ReturnType<typeof createVisualMaterialAdoptionService>;
