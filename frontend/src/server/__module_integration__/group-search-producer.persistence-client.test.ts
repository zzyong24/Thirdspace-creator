// @vitest-environment node
import {afterAll,beforeAll,expect,it,vi} from "vitest";
import {ENDPOINTS,type AccountGroupResource,type CandidateResource,type Client,type Endpoint,type GlobalSearchPage,type RequestContext} from "@creatoros/contract";
import {compositeTransport,__resetPersistenceForTests} from "@/server/persistence-client";
import {canonicalDataset} from "@/fixtures/canonical";

const environment=vi.hoisted(()=>{
 const previous=process.env.CREATOROS_DB_DIR;
 process.env.CREATOROS_DB_DIR=`${process.cwd()}/../../creatoros-flow-repair-20261025/canvas-search/test-runtime/db`;
 return {previous};
});

vi.setConfig({testTimeout:180000,hookTimeout:180000});
let owner:RequestContext,other:RequestContext;
const initial:RequestContext={userId:canonicalDataset.user.id,accountId:null,requestId:"t1403-index",source:"user"};
type ContractClient=Client<typeof ENDPOINTS>;
type ProjectResult=Awaited<ReturnType<ContractClient['getProject']>>;
type AssetResult=Awaited<ReturnType<ContractClient['getAsset']>>;
type OperationResults={
 "accountGroups.create":AccountGroupResource;
 "candidates.create":CandidateResource;
 "candidates.promote":{projectId:string};
 "projects.get":ProjectResult;
 "projects.patch":ProjectResult;
 "pages.search.get":GlobalSearchPage;
 "assets.uploads.create":{uploadId:string};
 "assets.uploads.complete":AssetResult;
 "assets.get":AssetResult;
 "assets.trash":AssetResult;
 "assets.restore":AssetResult;
};
async function call<K extends keyof OperationResults>(id:K,input:Record<string,unknown>={},ctx=owner):Promise<OperationResults[K]>{
 const endpoint=Object.values(ENDPOINTS).find(value=>value.id===id) as Endpoint;
 if(!endpoint)throw new Error(`unknown operation: ${id}`);
 return (await compositeTransport.request(endpoint,input as never,ctx) as {data:OperationResults[K]}).data;
}
const search=(q:string,type:string,ctx=owner)=>call("pages.search.get",{query:{q,type}},ctx);
beforeAll(async()=>{
 for(const [key,value]of Object.entries({DATABASE_URL:"",CREATOROS_DISABLE_BACKGROUND_DRIVERS:"1",CREATOROS_DISABLE_SCHEDULER:"1",CREATOROS_CLIENT_CONFIG_PULL_ENABLED:"0"}))vi.stubEnv(key,value);
 __resetPersistenceForTests();
 const a=await call("accountGroups.create",{body:{name:"验收-投影来源A",idempotencyKey:"t1403-index-a"}},initial);
 const b=await call("accountGroups.create",{body:{name:"验收-投影来源B",idempotencyKey:"t1403-index-b"}},initial);
 owner={...initial,groupId:a.id,groupVersion:a.version};other={...initial,groupId:b.id,groupVersion:b.version};
});
afterAll(async()=>{await(globalThis as {__creatorosDisposePersistence?:()=>Promise<void>}).__creatorosDisposePersistence?.();__resetPersistenceForTests();vi.unstubAllEnvs();if(environment.previous===undefined)delete process.env.CREATOROS_DB_DIR;else process.env.CREATOROS_DB_DIR=environment.previous;});

it("选题立项→立刻全局搜索→改名投影，保留账号组隔离与来源",async()=>{
 const candidate=await call("candidates.create",{body:{title:"手工选题投影唯一1403",angle:"只验证关键词索引",source:"idea"}});
 const promoted=await call("candidates.promote",{params:{candidateId:candidate.id},body:{}});
 const project=await call("projects.get",{params:{projectId:promoted.projectId}});
 expect(project.title).toBe(candidate.title);
 expect((await search("手工选题投影唯一1403","project")).projects).toEqual(expect.arrayContaining([expect.objectContaining({id:project.id})]));
 expect((await search("手工选题投影唯一1403","project",other)).projects).toEqual([]);
 await call("projects.patch",{params:{projectId:project.id},body:{title:"改名后的投影唯一1403"}});
 expect((await search("手工选题投影唯一1403","project")).projects).toEqual([]);
 expect((await search("改名后的投影唯一1403","project")).projects).toEqual(expect.arrayContaining([expect.objectContaining({id:project.id})]));
});

it("上传完成→立刻全局搜索→回收移除→恢复重投影，不泄露另一组",async()=>{
 const upload=await call("assets.uploads.create",{body:{assetType:"image",mimeType:"image/png",fileSize:1024}});
 const asset=await call("assets.uploads.complete",{params:{uploadId:upload.uploadId},body:{name:"专用图片投影唯一1403"}});
 expect((await call("assets.get",{params:{assetId:asset.id}})).status).toBe("active");
 expect((await search("专用图片投影唯一1403","asset")).assets).toEqual(expect.arrayContaining([expect.objectContaining({id:asset.id})]));
 expect((await search("专用图片投影唯一1403","asset",other)).assets).toEqual([]);
 await call("assets.trash",{params:{assetId:asset.id}});
 expect((await search("专用图片投影唯一1403","asset")).assets).toEqual([]);
 await call("assets.restore",{params:{assetId:asset.id}});
 expect((await search("专用图片投影唯一1403","asset")).assets).toEqual(expect.arrayContaining([expect.objectContaining({id:asset.id})]));
});
