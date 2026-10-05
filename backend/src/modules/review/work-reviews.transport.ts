import {ENDPOINTS,type Transport,type RequestContext} from "@creatoros/contract";
import {AuthenticationError,UnsupportedOperationError} from "@creatoros/backend";
import type {WorkReviewsService} from "./work-reviews.service";
export const WORK_REVIEW_OP_IDS=["workReviews.create","workReviews.get","workReviews.list","workReviews.confirm","workReviews.status","workReviews.requests.get"];
export function createWorkReviewsTransport(serviceFor:(ctx:RequestContext)=>WorkReviewsService):Transport{
 return{async request(endpoint,input,ctx){if(!ctx)throw new AuthenticationError();const service=serviceFor(ctx),payload=(input??{}) as {params?:unknown;query?:unknown;body?:unknown},meta={requestId:ctx.requestId};
  switch(endpoint.id){
   case "workReviews.create":return{data:await service.create(ctx,ENDPOINTS.createWorkReview.body!.parse(payload.body)),meta};
   case "workReviews.get":{const p=ENDPOINTS.getWorkReview.params!.parse(payload.params);return{data:await service.get(ctx,p.reportId),meta};}
   case "workReviews.requests.get":{const p=ENDPOINTS.getWorkReviewRequest.params!.parse(payload.params);return{data:await service.request(ctx,p.clientRequestId),meta};}
   case "workReviews.list":{const q=ENDPOINTS.listWorkReviews.query!.parse(payload.query),items=await service.list(ctx,q.compositionId);return{data:items.slice((q.page-1)*q.pageSize,q.page*q.pageSize),meta:{...meta,page:q.page,pageSize:q.pageSize,total:items.length}};}
   case "workReviews.confirm":return{data:await service.confirm(ctx,ENDPOINTS.confirmWorkReview.body!.parse(payload.body)),meta};
   case "workReviews.status":{const body=ENDPOINTS.getWorkReviewStatus.body!.parse(payload.body);return{data:await service.status(ctx,body.scope),meta};}
   default:throw new UnsupportedOperationError(endpoint.id);
  }
 }};
}
