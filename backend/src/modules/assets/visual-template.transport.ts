import type {Transport} from "@creatoros/contract";
import {AuthenticationError,UnsupportedOperationError} from "@creatoros/backend";
import type {VisualTemplateService} from "./visual-template.service";
export const VISUAL_TEMPLATE_OP_IDS=["assets.visualTemplates.list","assets.visualTemplates.save","assets.visualTemplates.remove"] as const;
export function createVisualTemplateTransport(service:VisualTemplateService):Transport{return {async request(endpoint,input,ctx){
 if(!ctx)throw new AuthenticationError();const raw=(input??{}) as {query?:unknown;body?:unknown;params?:{templateId?:string}};
 if(endpoint.id==="assets.visualTemplates.list"){const page=await service.list(ctx,raw.query??{});return {data:page.data,meta:{requestId:ctx.requestId,total:page.total,page:page.page,pageSize:page.pageSize}};}
 if(endpoint.id==="assets.visualTemplates.save")return {data:await service.save(ctx,raw.body),meta:{requestId:ctx.requestId}};
 if(endpoint.id==="assets.visualTemplates.remove")return {data:await service.remove(ctx,raw.params?.templateId??"",raw.body),meta:{requestId:ctx.requestId}};
 throw new UnsupportedOperationError(endpoint.id);
}};}
