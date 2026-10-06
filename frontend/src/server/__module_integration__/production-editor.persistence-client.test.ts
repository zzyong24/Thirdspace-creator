import {afterEach,beforeEach,expect,it,vi} from "vitest";
import {mkdtemp,rm} from "node:fs/promises";
import {join} from "node:path";
import {tmpdir} from "node:os";
import {ENDPOINTS,type Endpoint,type RequestContext} from "@creatoros/contract";
type AiService=ReturnType<typeof import("@creatoros/backend/modules/ai").createAiService>;
const captured=vi.hoisted(()=>({runs:[] as Array<{id:string;inputData:{spec:unknown}}>,ai:null as AiService|null,
  contexts:[] as RequestContext[],claims:[] as RequestContext[],failures:[] as RequestContext[],db:null as import("@creatoros/backend").Db|null,
  mutateRuntime:null as null|((value:any)=>void),beforeRuntimeRead:null as null|((taskId:string)=>Promise<void>),workspace:"" }));
// 仅隔离真实媒体执行；公共组合根、服务、AI任务幂等与数据库均使用实际实现。
vi.mock("@creatoros/backend/modules/execution",async importOriginal=>{
  const real=await importOriginal<typeof import("@creatoros/backend/modules/execution")>();
  return {...real,runExecutionTask:async(ctx:RequestContext,task:{id:string;inputData:{spec:unknown}})=>{captured.contexts.push(ctx);captured.runs.push(task);}};
});
vi.mock("@creatoros/backend",async importOriginal=>{
  const real=await importOriginal<typeof import("@creatoros/backend")>();
  return {...real,createConfiguredDb:async(...args:Parameters<typeof real.createConfiguredDb>)=>{
    const opened=await real.createConfiguredDb(...args);captured.db=opened.db;return opened;
  }};
});
vi.mock("@creatoros/backend/modules/ai",async importOriginal=>{
  const real=await importOriginal<typeof import("@creatoros/backend/modules/ai")>();
  return {...real,createAiService:(...args:Parameters<typeof real.createAiService>)=>{
    const service=real.createAiService(...args);captured.ai=service;
    const runtime=service.getTaskRuntimeData.bind(service);
    service.getTaskRuntimeData=async(ctx,id)=>{await captured.beforeRuntimeRead?.(id);const value=structuredClone(await runtime(ctx,id));captured.mutateRuntime?.(value);return value;};
    // 仅在真实新窄口读取完成后注入明确腐坏；owner与真实服务守卫不替换。
    const optional=service as AiService & {getTaskExecutionRuntime?:(ctx:RequestContext,id:string)=>Promise<any>};
    if(optional.getTaskExecutionRuntime){const read=optional.getTaskExecutionRuntime.bind(service);optional.getTaskExecutionRuntime=async(ctx,id)=>{
      await captured.beforeRuntimeRead?.(id);const state=await read(ctx,id),copy=structuredClone(state);captured.mutateRuntime?.(copy.runtimeData);return copy;
    };}
    const claim=service.runClaimedTaskExecution.bind(service),fail=service.markFailed.bind(service);
    service.runClaimedTaskExecution=async(ctx,id,execute,options)=>{captured.claims.push(ctx);return claim(ctx,id,execute,options);};
    service.markFailed=async(...input)=>{captured.failures.push(input[0]);return fail(...input);};
    return service;
  }};
});
// 内存存储协议不供浏览器执行；测试仅把签名URL表示替为HTTP，真实Asset/文件归属仍走原服务。
vi.mock("@creatoros/backend/modules/assets",async importOriginal=>{
  const real=await importOriginal<typeof import("@creatoros/backend/modules/assets")>();
  return {...real,createMockObjectStorage:(...args:Parameters<typeof real.createMockObjectStorage>)=>{
    const storage=real.createMockObjectStorage(...args);return {...storage,getSignedUrl:async(key:string)=>`https://fixture-media.example/${encodeURIComponent(key)}`};
  }};
});
import {compositeTransport,__resetPersistenceForTests} from "@/server/persistence-client";
import {canonicalDataset} from "@/fixtures/canonical";
const owner:RequestContext={userId:canonicalDataset.user.id,accountId:`acct-of-${canonicalDataset.user.id}`,requestId:"editor-root",source:"user"};
const ep=(id:string)=>({id} as Endpoint);
async function call(id:string,params:unknown,body?:unknown,query?:unknown){return compositeTransport.request(ep(id),{params,body,query} as never,owner) as Promise<{data:any}>;}
beforeEach(async()=>{
  // 组合根会清理sandbox；每例先隔离到自有目录，绝不扫描用户的默认workspaces。
  captured.workspace=await mkdtemp(join(tmpdir(),"creatoros-render-owner-"));
  vi.stubEnv("CREATOROS_WORKSPACES_ROOT",captured.workspace);vi.stubEnv("CREATOROS_DISABLE_BACKGROUND_DRIVERS","1");
  vi.stubEnv("DATABASE_URL","");vi.stubEnv("PGLITE_DATA_DIR","");
  __resetPersistenceForTests();captured.runs=[];captured.ai=null;captured.db=null;captured.contexts=[];captured.claims=[];captured.failures=[];captured.mutateRuntime=null;captured.beforeRuntimeRead=null;
});
afterEach(async()=>{
  await (globalThis as {__creatorosDisposePersistence?:()=>Promise<void>}).__creatorosDisposePersistence?.();
  __resetPersistenceForTests();vi.unstubAllEnvs();await rm(captured.workspace,{recursive:true,force:true});
});
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
  const beforePreview=(await call(ENDPOINTS.getProductionEditor.id,{outputId:output.id})).data;
  const preview=(await call(ENDPOINTS.previewProductionEditor.id,{outputId:output.id},{expectedRevision:0,requestId:"request-preview-root",plan})).data;
  expect(preview.durationSec).toBe(10);expect(preview.html).toContain("window.__timelines");
  expect((await call(ENDPOINTS.getProductionEditor.id,{outputId:output.id})).data).toEqual(beforePreview);
  expect(captured.runs).toHaveLength(0);
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

// 新公共链路：真实组/父工程/资产/Skill/任务/claim；媒体executor保持上方明确夹具。
async function scopedCall(ctx:RequestContext,id:string,params?:unknown,body?:unknown,query?:unknown){
  return (await compositeTransport.request(ep(id),{params,body,query} as never,ctx) as {data:any}).data;
}
async function renderOwnerFixture(accountMode:"omitted"|"null"|"member"|"legacy"="omitted"){
  const base:RequestContext={userId:owner.userId,requestId:"render-owner-public",source:"user"};
  let ctx=base,group:any=null;
  if(accountMode==="legacy"){
    const account=await scopedCall(base,"accounts.create",undefined,{platform:"douyin",accountHandle:"隔离旧账号",idempotencyKey:"legacy-render-owner-account"});
    ctx={...base,accountId:account.id};
  }else{
    group=await scopedCall(base,"accountGroups.create",undefined,{name:"隔离空组",idempotencyKey:"render-owner-empty-group"});
    ctx={...base,groupId:group.id,groupVersion:group.version,...(accountMode==="null"?{accountId:null}:{})};
    if(accountMode==="member"){
      const account=await scopedCall(ctx,"accounts.create",undefined,{platform:"douyin",accountHandle:"隔离成员",idempotencyKey:"render-owner-member"});
      group=await scopedCall(base,"accountGroups.get",{groupId:group.id});ctx={...ctx,groupVersion:group.version,accountId:account.id};
    }
  }
  const project=await scopedCall(ctx,"projects.create",undefined,{title:"冻归属生成",brief:""});
  const output=await scopedCall(ctx,"projects.outputs.create",{projectId:project.id},{title:"原素材保持",contentType:"video"});
  const upload=await scopedCall(ctx,"assets.uploads.create",undefined,{assetType:"video",mimeType:"video/mp4",fileSize:1024});
  const asset=await scopedCall(ctx,"assets.uploads.complete",{uploadId:upload.uploadId},{name:"明确媒体执行夹具"});
  await scopedCall(ctx,"materialLinks.create",undefined,{projectId:project.id,entityType:"asset",entityId:asset.id});
  const params={outputId:output.id},plan={renderProps:{meta:{title:"冻归属"},talkingHead:{file:asset.id,durationSec:2},scenes:[{id:"frozen-scene",title:"正文",label:"正文",startSec:0,endSec:2,cards:[]}],captions:[],broll:[]}};
  const saved=await scopedCall(ctx,ENDPOINTS.saveProductionEditor.id,params,{expectedRevision:0,requestId:"frozen-owner-save",plan,source:"manual"});
  const render=(requestId="frozen-owner-render",c=ctx)=>scopedCall(c,ENDPOINTS.renderProductionEditor.id,params,{revision:saved.revision,requestId});
  const task=(id:string,c=ctx)=>scopedCall(c,"execution.tasks.get",{taskId:id});
  return {base,ctx,group,project,output,asset,params,saved,render,task};
}
for(const mode of ["omitted","null","member","legacy"] as const)it(`公开root ${mode}：真实冻结归属达到claim/执行，回放不重复`,async()=>{
  const f=await renderOwnerFixture(mode);
  if(mode==="omitted")expect(Object.hasOwn(f.ctx,"accountId")).toBe(false);
  if(mode==="omitted"||mode==="null")expect((await scopedCall(f.base,"accountGroups.get",{groupId:f.group.id})).members).toEqual([]);
  const preview=await scopedCall(f.ctx,ENDPOINTS.previewProductionEditor.id,f.params,{expectedRevision:f.saved.revision,requestId:"frozen-owner-preview",plan:f.saved.plan});expect(preview.durationSec).toBe(2);
  const result=await f.render();let observed:any;await vi.waitFor(async()=>{observed=await f.task(result.taskId);expect(captured.runs.length===1||observed.status==="failed").toBe(true);},{timeout:120000});
  expect(observed.status,observed.errorMessage).not.toBe("failed");expect(captured.runs).toHaveLength(1);
  expect(await f.render()).toEqual(result);expect(captured.runs).toHaveLength(1);expect(captured.runs[0]!.id).toBe(result.taskId);
  const state=await (captured.ai as AiService & {getTaskExecutionRuntime:(c:RequestContext,id:string)=>Promise<any>}).getTaskExecutionRuntime(f.ctx,result.taskId);
  expect(state.owner).toMatchObject({userId:f.ctx.userId,accountId:f.ctx.accountId??null});
  expect(captured.claims).toHaveLength(1);expect(captured.contexts[0]).toMatchObject({userId:state.owner.userId,accountId:state.owner.accountId});
  expect(captured.claims[0]).toEqual(captured.contexts[0]);
  if(f.ctx.groupId)expect(captured.contexts[0]).toMatchObject({groupId:state.owner.groupId,groupVersion:state.owner.groupVersion});
  else expect(captured.contexts[0]!.groupId??null).toBeNull();
  expect((await f.task(result.taskId)).manifest).toBeNull(); // executor夹具不是MP4/采纳证据。
});
it("同组平台筛选只回读原NULL任务；窄口返回真实owner，foreign读取拒绝",async()=>{
  const f=await renderOwnerFixture("null"),result=await f.render();await vi.waitFor(()=>expect(captured.runs).toHaveLength(1),{timeout:120000});
  const account=await scopedCall(f.ctx,"accounts.create",undefined,{platform:"kuaishou",accountHandle:"原组合法筛选",idempotencyKey:"frozen-owner-filter"});
  const group=await scopedCall(f.base,"accountGroups.get",{groupId:f.group.id}),filter={...f.ctx,accountId:account.id,groupVersion:group.version};
  const read=(c:RequestContext)=> (captured.ai as AiService & {getTaskExecutionRuntime:(c:RequestContext,id:string)=>Promise<any>}).getTaskExecutionRuntime(c,result.taskId);
  expect((await read(filter)).owner.accountId).toBeNull();expect(await f.render("frozen-owner-render",filter)).toEqual(result);expect(captured.runs).toHaveLength(1);
  expect((await f.task(result.taskId,filter)).id).toBe(result.taskId);
  const other=await scopedCall(f.base,"accountGroups.create",undefined,{name:"另组",idempotencyKey:"frozen-owner-foreign"});
  for(const c of [{...f.ctx,userId:"other-owner"},{...f.ctx,groupId:other.id},{...f.base,accountId:account.id}])await expect(read(c)).rejects.toMatchObject({code:"OwnershipError"});
  expect(await captured.ai!.getTaskRuntimeData(filter,result.taskId)).toHaveProperty("skillSnapshot");
  expect(await captured.ai!.getTaskRuntimeData(filter,result.taskId)).not.toHaveProperty("owner");
  expect(JSON.stringify(await f.task(result.taskId,filter))).not.toContain("skillSnapshot");
  expect(Object.values(ENDPOINTS).some(e=>String(e.id)==="ai.tasks.executionRuntime")).toBe(false);
});
const corruptSnapshotCases:Array<[string,(runtime:any)=>void]>=[
  ["missing",r=>{delete r.skillSnapshot;}],["bad-shape",r=>{r.skillSnapshot="broken";}],
  ["user",r=>{r.skillSnapshot.userId="foreign";}],["account",r=>{r.skillSnapshot.accountId="foreign";}],
  ["group",r=>{r.skillSnapshot.groupId="foreign-group";}],["no-group",r=>{delete r.skillSnapshot.groupId;}],
  ["no-group-version",r=>{delete r.skillSnapshot.groupVersion;}],["group-version",r=>{r.skillSnapshot.groupVersion+=1;}],
  ["group-version-type",r=>{r.skillSnapshot.groupVersion="1";}],["group-version-negative",r=>{r.skillSnapshot.groupVersion=-1;}],
  ["group-version-fraction",r=>{r.skillSnapshot.groupVersion=1.5;}],["no-membership-version",r=>{delete r.skillSnapshot.membershipVersion;}],
  ["membership-version",r=>{r.skillSnapshot.membershipVersion=1;}],["membership-version-type",r=>{r.skillSnapshot.membershipVersion="1";}],
];
for(const [kind,mutate] of corruptSnapshotCases)it(`公开render拒绝真实owner下的Skill腐坏 ${kind}，不执行`,async()=>{
  const f=await renderOwnerFixture("omitted");captured.mutateRuntime=mutate;
  const result=await f.render();let task:any;await vi.waitFor(async()=>{task=await f.task(result.taskId);expect(task.status).toBe("failed");},{timeout:120000});
  expect(task.errorMessage).toBeTruthy();expect(captured.runs).toEqual([]);expect(captured.claims).toEqual([]);
  expect(captured.failures).toHaveLength(1);expect(captured.failures[0]).toMatchObject({userId:f.ctx.userId,accountId:null,groupId:f.ctx.groupId});
  expect((await scopedCall(f.ctx,ENDPOINTS.getProductionEditor.id,f.params)).revision).toBe(f.saved.revision);
});
it("公开render保留模型authority变化取消门，不进入claim或executor",async()=>{
  const f=await renderOwnerFixture("null");captured.mutateRuntime=r=>{r.modelAuthorityDigest="changed-authority";};const result=await f.render();
  await vi.waitFor(async()=>expect((await f.task(result.taskId)).status).toBe("cancelled"),{timeout:120000});expect(captured.runs).toEqual([]);expect(captured.claims).toEqual([]);
});
it("legacy旧snapshot可读但真实initialgroup缺member版本仍由原admission拒绝",async()=>{
  const f=await renderOwnerFixture("legacy"),{aiTasks,eq}=await import("@creatoros/backend");
  captured.beforeRuntimeRead=async id=>{
    captured.beforeRuntimeRead=null;const [row]=await captured.db!.select().from(aiTasks).where(eq(aiTasks.id,id));
    expect(row!.groupId).toBe(`grp_legacy_${f.ctx.accountId}`);
    const runtime=structuredClone(row!.runtimeData as any);delete runtime.skillSnapshot.groupId;delete runtime.skillSnapshot.groupVersion;delete runtime.skillSnapshot.membershipVersion;
    await captured.db!.update(aiTasks).set({groupVersion:null,membershipVersion:null,runtimeData:runtime}).where(eq(aiTasks.id,id));
  };
  const result=await f.render();let task:any;await vi.waitFor(async()=>{task=await f.task(result.taskId);expect(task.status).toBe("failed");},{timeout:120000});
  const read=(captured.ai as AiService & {getTaskExecutionRuntime:(c:RequestContext,id:string)=>Promise<any>}).getTaskExecutionRuntime;
  const state=await read(f.ctx,result.taskId);expect(state.owner).toMatchObject({accountId:f.ctx.accountId,groupId:`grp_legacy_${f.ctx.accountId}`,membershipVersion:null});expect(state.runtimeData.skillSnapshot).not.toHaveProperty("groupId");
  expect(task.errorMessage).toContain("缺少冻结账号归属版本");expect(captured.claims).toHaveLength(1);expect(captured.claims[0]!.groupId??null).toBeNull();expect(captured.runs).toEqual([]);
});

it("legacy真实NULL旧行缺stamp仍按原account解释执行，snapshot不回填",async()=>{
  const f=await renderOwnerFixture("legacy"),{aiTasks,eq}=await import("@creatoros/backend");
  captured.beforeRuntimeRead=async id=>{
    captured.beforeRuntimeRead=null;const [row]=await captured.db!.select().from(aiTasks).where(eq(aiTasks.id,id));const runtime=structuredClone(row!.runtimeData as any);
    delete runtime.skillSnapshot.groupId;delete runtime.skillSnapshot.groupVersion;delete runtime.skillSnapshot.membershipVersion;
    // 明示历史协议夹具：仅隔离真实任务行，旧账号父与runtime原account不改。
    await captured.db!.update(aiTasks).set({groupId:null,groupVersion:null,membershipVersion:null,runtimeData:runtime}).where(eq(aiTasks.id,id));
  };
  const result=await f.render();await vi.waitFor(()=>expect(captured.runs).toHaveLength(1),{timeout:120000});
  expect(captured.contexts[0]).toMatchObject({accountId:f.ctx.accountId});expect(captured.contexts[0]!.groupId??null).toBeNull();expect(captured.claims[0]).toEqual(captured.contexts[0]);
  const runtime=await captured.ai!.getTaskRuntimeData(f.ctx,result.taskId);expect(runtime.skillSnapshot).not.toHaveProperty("groupId");expect(runtime.skillSnapshot).not.toHaveProperty("membershipVersion");
});
it("显式initialgroup旧snapshot缺stamp拒绝，不能使用legacy兼容",async()=>{
  const base={userId:owner.userId,requestId:"explicit-initial",source:"user" as const};
  const account=await scopedCall(base,"accounts.create",undefined,{platform:"douyin",accountHandle:"明确旧组",idempotencyKey:"explicit-initial-account"});
  const group=await scopedCall(base,"accountGroups.get",{groupId:`grp_legacy_${account.id}`}),ctx={...base,accountId:account.id,groupId:group.id,groupVersion:group.version};
  captured.mutateRuntime=r=>{delete r.skillSnapshot.groupId;delete r.skillSnapshot.groupVersion;delete r.skillSnapshot.membershipVersion;};
  const created=await scopedCall(ctx,"execution.tasks.create",undefined,{spec:{taskType:"echo.manifest",goal:"明确deterministic fixture"},attemptId:"explicit-initial-attempt"});
  let task:any;await vi.waitFor(async()=>{task=await scopedCall(ctx,"execution.tasks.get",{taskId:created.id});expect(task.status==="failed"||captured.runs.length>0).toBe(true);},{timeout:120000});
  expect(task.status).toBe("failed");expect(captured.runs).toEqual([]);expect(captured.claims).toEqual([]);
});
it("legacy已有nonNULL组stamp冲突仍拒绝，不拿原account掩盖",async()=>{
  const f=await renderOwnerFixture("legacy");captured.mutateRuntime=r=>{r.skillSnapshot.groupId="another-declared-group";};
  const result=await f.render();let task:any;await vi.waitFor(async()=>{task=await f.task(result.taskId);expect(task.status==="failed"||captured.runs.length>0).toBe(true);},{timeout:120000});
  expect(task.status).toBe("failed");expect(captured.runs).toEqual([]);expect(captured.claims).toEqual([]);
});
