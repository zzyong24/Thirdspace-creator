import type {Db} from "@creatoros/backend";
import {outputConversionRequest,type OutputConversionRequest,type RequestContext} from "@creatoros/contract";
import type {ProjectsService} from "../projects";
import type {ArticlesService} from "../articles";
import type {GraphicPostsService} from "../graphic-posts";
import {conversionInputRejectionCodes,type CreativeResultsService} from "./creative-results.service";
import type {createConversionSourceService} from "./conversion-source.service";
import {createConversionReservationRepository,type ConversionReservation} from "./conversion-reservation.repository";

export function createOutputConversionsService(db:Db,deps:{
  projects:Pick<ProjectsService,"getProject"|"getOutput"|"createOutput">;
  articles:Pick<ArticlesService,"createOutput"|"getArticle">;
  graphicPosts:Pick<GraphicPostsService,"createOutput"|"getGraphicPost"|"getVersion"|"createVersion">;
  source:Pick<ReturnType<typeof createConversionSourceService>,"freeze">;
  results:Pick<CreativeResultsService,"reserveConversionFields"|"generate"|"get"|"getConversionReceipt">;
  assertReuseImageFile:(ctx:RequestContext,assetId:string,assetFileId:string)=>Promise<void>;
  now?:()=>string;nextId?:()=>string;
}) {
  async function createTarget(ctx:RequestContext,reservation:ConversionReservation){
    const request=reservation.context.request,input={title:{article:"转换文章",image:"转换图文",video:"转换视频"}[request.targetType],
      clientRequestId:reservation.targetCreationKey,...(request.targetPlatform?{targetPlatform:request.targetPlatform}:{})};
    const created=request.targetType==="article"?await deps.articles.createOutput(ctx,reservation.projectId,input):
      request.targetType==="image"?await deps.graphicPosts.createOutput(ctx,reservation.projectId,input):
      await deps.projects.createOutput(ctx,reservation.projectId,{...input,contentType:"video"});
    const owned=await deps.projects.getOutput(ctx,created.id);
    // 原 owner 创建回执与真实正式稿锚点都必须存在；不接受客户端伪造目标 ID。
    if(request.targetType==="article")await deps.articles.getArticle(ctx,owned.id);
    if(request.targetType==="image")await deps.graphicPosts.getGraphicPost(ctx,owned.id);
    return {...owned,targetPlatform:owned.targetPlatform??null};
  }
  const reservations=createConversionReservationRepository(db,{now:deps.now,nextId:deps.nextId,
    assertProject:async(ctx,id)=>{await deps.projects.getProject(ctx,id);},readCreatedTarget:createTarget});
  return {
    async convert(ctx:RequestContext,input:OutputConversionRequest){
      const request=outputConversionRequest.parse(input);
      const reservation=await reservations.reserve(ctx,request,async()=>{
        const frozen=await deps.source.freeze(ctx,request);
        // 用户明确选择的所有真实图片文件均核验；没有分页截断或替换最新文件。
        for(const image of request.reuseImages)await deps.assertReuseImageFile(ctx,image.assetId,image.assetFileId);
        return frozen;
      });
      const target=await createTarget(ctx,reservation);
      const bound=await reservations.bindOutput(ctx,reservation,target);
      if(bound.context.request.targetType==="image"&&bound.context.request.reuseImages.length){
        const saved=await deps.graphicPosts.getGraphicPost(ctx,target.id),initial=saved.versions.find(version=>version.versionNumber===1);
        if(!initial)throw Object.assign(Error("目标初始版本不存在，图片输入仍保留"),{code:"SOURCE_ANCHOR_CONFLICT"});
        const base=await deps.graphicPosts.getVersion(ctx,target.id,initial.id);
        // SEMANTIC_BOUNDARY_ALLOW: 用户明确选择的顺序直接作为图卡顺序，不判断配图语义或指定封面。
        await deps.graphicPosts.createVersion(ctx,target.id,{expectedCurrentVersionId:base.versionId,clientRequestId:`conversion-images-${bound.id}`,
          document:{...base.document,imageUses:bound.context.request.reuseImages.map((image,order)=>({...image,order,role:"card" as const})),sourceRefs:[bound.context.sourceAnchor]}});
      }

      const plans=await deps.results.reserveConversionFields(ctx,bound.id);
      for(const plan of plans){
        const current=await deps.results.get(ctx,plan.resultId);
        if(current.taskId||current.typedCandidateRef||current.retryOf)continue;
        try {await deps.results.generate(ctx,{outputId:target.id,kind:plan.kind,targetPlatform:plan.targetPlatform,
          clientRequestId:plan.clientRequestId,bundleId:bound.id,conversion:bound.context});}
        catch(error){
          // 原账本必须已经保存失败或未知提交；安全/归属错误不能伪装单项模型失败。
          const saved=await deps.results.get(ctx,plan.resultId);
          const code=(error as {code?:string})?.code;
          if((code&&conversionInputRejectionCodes.has(code))||!saved.errorCode)throw error;
        }
      }
      return deps.results.getConversionReceipt(ctx,bound.id);
    },
    async get(ctx:RequestContext,originalClientRequestId:string){
      const reservation=await reservations.get(ctx,originalClientRequestId);
      return deps.results.getConversionReceipt(ctx,reservation.id);
    },
  };
}
export type OutputConversionsService=ReturnType<typeof createOutputConversionsService>;
