import { expect, it, vi } from "vitest";
import { createDb } from "@creatoros/backend";
import { ErrorCode, type Endpoint, type RequestContext } from "@creatoros/contract";
import { createPublishingService } from "./publishing.service";
import { createPublishingTransport } from "./publishing.transport";
import { publicationResource } from "./publishing.schema";
import { createUnavailablePublisher } from "./platform-publisher";

const ctx: RequestContext = {userId:"publishing-truth-user",accountId:"publishing-truth-account",source:"user",requestId:"publishing-truth"};
it.each([false,true])("真实PGlite公共transport：手工登记保留，自动发布不可用且不伪造发布事实（显式装配=%s）",async explicit=>{
  const {db,client}=await createDb();let serial=0;
  const markOutputPublished=vi.fn(async()=>{}),notify=vi.fn(async()=>{});
  const service=createPublishingService({db,now:()=>"2026-09-05T00:00:00.000Z",nextId:prefix=>`${prefix}-${++serial}`,...(explicit?{publisher:createUnavailablePublisher()}:{}),markOutputPublished,notify});
  const transport=createPublishingTransport(()=>service);
  const call=async(id:string,input:unknown)=>transport.request({id} as Endpoint,input as never,ctx);
  try{
    const manual=await call("outputs.publications.register",{params:{outputId:"manual-output"},body:{platform:"bilibili",externalId:"BV-real-user-entry",externalUrl:"https://www.bilibili.com/video/BV-real-user-entry",title:"用户手工登记",publishedAt:"2026-09-04T20:00:00.000Z"}}) as {data:unknown};
    const registered=publicationResource.parse(manual.data);
    expect(registered).toMatchObject({status:"published",externalId:"BV-real-user-entry",externalUrl:"https://www.bilibili.com/video/BV-real-user-entry"});
    const created=await call("outputs.publications.create",{params:{outputId:"draft-output"},body:{platform:"bilibili",accountReference:"@fixture"}}) as {data:unknown};
    const draft=publicationResource.parse(created.data);
    for(let attempt=0;attempt<2;attempt++)await expect(call("publications.transition",{params:{publicationId:draft.id},body:{status:"published"}})).rejects.toMatchObject({name:"PublishingUnavailableError",code:ErrorCode.ConflictError,details:{reason:"automatic_publishing_unavailable",operation:"publish"}});
    const read=await call("publications.get",{params:{publicationId:draft.id}}) as {data:unknown};
    expect(publicationResource.parse(read.data)).toMatchObject({status:"draft",externalId:null,externalUrl:null,publishedAt:null});
    await call("publications.transition",{params:{publicationId:draft.id},body:{status:"scheduled"}});
    await expect(call("publications.transition",{params:{publicationId:draft.id},body:{status:"published"}})).rejects.toMatchObject({name:"PublishingUnavailableError"});
    expect(await service.getPublication(ctx,draft.id)).toMatchObject({status:"scheduled",externalId:null,externalUrl:null,publishedAt:null});
    expect(markOutputPublished).not.toHaveBeenCalled();expect(notify).not.toHaveBeenCalled();
    await expect(call("publications.transition",{params:{publicationId:registered.id},body:{status:"removed"}})).rejects.toMatchObject({name:"PublishingUnavailableError",details:{operation:"remove"}});
    expect(await service.getPublication(ctx,registered.id)).toMatchObject({status:"published",removedAt:null,externalId:registered.externalId});
  }finally{await client.close();}
},15000);
