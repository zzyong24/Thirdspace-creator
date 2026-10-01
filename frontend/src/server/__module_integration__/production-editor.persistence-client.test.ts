import {beforeEach,expect,it,vi} from "vitest";
import {ENDPOINTS,type Endpoint,type RequestContext} from "@creatoros/contract";
type AiService=ReturnType<typeof import("@creatoros/backend/modules/ai").createAiService>;
const captured=vi.hoisted(()=>({runs:[] as Array<{id:string;inputData:{spec:unknown}}>,ai:null as AiService|null }));
// 仅隔离真实媒体执行；公共组合根、服务、AI任务幂等与数据库均使用实际实现。
vi.mock("@creatoros/backend/modules/execution",async importOriginal=>{
  const real=await importOriginal<typeof import("@creatoros/backend/modules/execution")>();
  return {...real,runExecutionTask:async(_ctx:unknown,task:{id:string;inputData:{spec:unknown}})=>{captured.runs.push(task);}};
});
vi.mock("@creatoros/backend/modules/ai",async importOriginal=>{
  const real=await importOriginal<typeof import("@creatoros/backend/modules/ai")>();
  return {...real,createAiService:(...args:Parameters<typeof real.createAiService>)=>{const service=real.createAiService(...args);captured.ai=service;return service;}};
});
import {compositeTransport,__resetPersistenceForTests} from "@/server/persistence-client";
import {canonicalDataset} from "@/fixtures/canonical";
const owner:RequestContext={userId:canonicalDataset.user.id,accountId:`acct-of-${canonicalDataset.user.id}`,requestId:"editor-root",source:"user"};
const ep=(id:string)=>({id} as Endpoint);
async function call(id:string,params:unknown,body?:unknown,query?:unknown){return compositeTransport.request(ep(id),{params,body,query} as never,owner) as Promise<{data:any}>;}
beforeEach(()=>{__resetPersistenceForTests();captured.runs=[];captured.ai=null;});
it("公共组合根保存不启动，冻结生成走既有运行器，重试复用实际AI任务",async()=>{
  const project=(await call("projects.create",undefined,{title:"隔离制作测试",brief:""})).data;
  const output=(await call("projects.outputs.create",{projectId:project.id},{title:"视频",contentType:"video"})).data;
  const upload=(await call("assets.uploads.create",undefined,{assetType:"video",mimeType:"video/mp4",fileSize:1024})).data;
  let asset=(await call("assets.uploads.complete",{uploadId:upload.uploadId},{name:"测试口播"})).data;
  await call("materialLinks.create",undefined,{projectId:project.id,entityType:"asset",entityId:asset.id});
  const candidates=[asset];
  for(let i=0;i<101;i++) {
    const nextUpload=(await call("assets.uploads.create",undefined,{assetType:"video",mimeType:"video/mp4",fileSize:1024})).data;
    const nextAsset=(await call("assets.uploads.complete",{uploadId:nextUpload.uploadId},{name:`分页测试素材${i}`})).data;
    await call("materialLinks.create",undefined,{projectId:project.id,entityType:"asset",entityId:nextAsset.id});
    candidates.push(nextAsset);
  }
  const firstPage=await compositeTransport.request(ENDPOINTS.listMaterialLinks,{params:undefined,query:{projectId:project.id,page:1,pageSize:100},body:undefined},owner) as {data:Array<{entityId:string}>};
  expect(firstPage.data).toHaveLength(100);
  asset=candidates.find(candidate=>!firstPage.data.some(row=>row.entityId===candidate.id))!;
  expect(asset).toBeDefined();
  const plan={renderProps:{meta:{title:"冻结A"},talkingHead:{file:asset.id,durationSec:10},scenes:[{id:"s",title:"正文",label:"正文",startSec:0,endSec:10,cards:[]}],captions:[],broll:[]}};
  const saved=(await call(ENDPOINTS.saveProductionEditor.id,{outputId:output.id},{expectedRevision:0,requestId:"request-save-root-1",plan,source:"manual"})).data;
  expect(captured.runs).toHaveLength(0);
  const rendered=(await call(ENDPOINTS.renderProductionEditor.id,{outputId:output.id},{revision:1,requestId:"request-render-root-1"})).data;
  await call(ENDPOINTS.saveProductionEditor.id,{outputId:output.id},{expectedRevision:1,requestId:"request-save-root-2",plan:{...saved.plan,renderProps:{...saved.plan.renderProps,meta:{title:"新稿B"}}},source:"manual"});
  const retry=(await call(ENDPOINTS.renderProductionEditor.id,{outputId:output.id},{revision:1,requestId:"request-render-root-1"})).data;
  expect(retry.taskId).toBe(rendered.taskId);
  await vi.waitFor(()=>expect(captured.runs.length).toBeGreaterThan(0));
  expect(captured.runs.every(r=>r.id===rendered.taskId)).toBe(true);
  expect(captured.runs[0]!.inputData.spec).toMatchObject({params:{props:{meta:{title:"冻结A"}}}});
  const task=(await call("execution.tasks.get",{taskId:rendered.taskId})).data;
  expect(task.spec.params.props.meta.title).toBe("冻结A");
  expect((await call(ENDPOINTS.listProductionEditorRenders.id,{outputId:output.id},undefined,{limit:20,offset:0})).data.items).toMatchObject([{revision:1,taskId:rendered.taskId,assetId:null}]);
  // 通过实际AI service写入可信执行采纳审计，再经实际execution/Asset端口回读；不是媒体渲染验收。
  await captured.ai!.recordAuxResult(owner,rendered.taskId,{resultType:"execution_adopted",resultData:{adoptedAssetIds:[asset.id]}});
  expect((await call(ENDPOINTS.listProductionEditorRenders.id,{outputId:output.id},undefined,{limit:20,offset:0})).data.items).toMatchObject([{revision:1,taskId:rendered.taskId,assetId:asset.id}]);
  expect((await call("outputs.get",{outputId:output.id})).data.primaryAssetId).toBeNull();

});
