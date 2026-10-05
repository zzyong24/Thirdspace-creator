import {beforeEach,expect,it,vi} from "vitest";
import type {Endpoint,RequestContext} from "@creatoros/contract";
type PublicationResultPorts=Parameters<typeof import("@creatoros/backend/modules/publishing").createPublicationResultsService>[1];
const captured=vi.hoisted(()=>({ports:null as PublicationResultPorts|null}));
vi.mock("@creatoros/backend/modules/publishing",async importOriginal=>{
  const real=await importOriginal<typeof import("@creatoros/backend/modules/publishing")>();
  return {...real,createPublicationResultsService:(...args:Parameters<typeof real.createPublicationResultsService>)=>{
    captured.ports=args[1];return real.createPublicationResultsService(...args);
  }};
});
import {compositeTransport,__resetPersistenceForTests} from "@/server/persistence-client";
import {canonicalDataset} from "@/fixtures/canonical";
const owner:RequestContext={userId:canonicalDataset.user.id,accountId:`acct-of-${canonicalDataset.user.id}`,requestId:"cover-wiring",source:"user"};
const ep=(id:string)=>({id} as Endpoint);
beforeEach(()=>{__resetPersistenceForTests();captured.ports=null;});
async function image(){
  const uploaded=await compositeTransport.request(ep("assets.uploads.create"),{params:undefined,query:undefined,
    body:{assetType:"image",mimeType:"image/png",fileSize:1024}} as never,owner) as {data:{uploadId:string}};
  const completed=await compositeTransport.request(ep("assets.uploads.complete"),{params:{uploadId:uploaded.data.uploadId},query:undefined,
    body:{name:"发布封面归属测试"}} as never,owner) as {data:{id:string;currentFileId:string}};
  return completed.data;
}
it("真实组合根接通发布封面文件校验，当前账号已确认图片可保存",async()=>{
  const asset=await image();
  expect(captured.ports?.assertCoverAssetFile).toBeTypeOf("function");
  await expect(captured.ports!.assertCoverAssetFile!(owner,asset.id,asset.currentFileId)).resolves.toBeUndefined();
});
it("同一实际端口拒绝错账号、错文件以及不存在的素材",async()=>{
  const asset=await image();
  expect(captured.ports?.assertCoverAssetFile).toBeTypeOf("function");
  const assert=captured.ports!.assertCoverAssetFile!;
  await expect(assert({...owner,accountId:"other-account"},asset.id,asset.currentFileId)).rejects.toThrow();
  await expect(assert(owner,asset.id,"wrong-file")).rejects.toThrow();
  const pending=await compositeTransport.request(ep("assets.uploads.create"),{params:undefined,query:undefined,
    body:{assetType:"image",mimeType:"image/png",fileSize:1024}} as never,owner) as {data:{uploadId:string}};
  await expect(assert(owner,pending.data.uploadId,"wrong-file")).rejects.toThrow();
});
