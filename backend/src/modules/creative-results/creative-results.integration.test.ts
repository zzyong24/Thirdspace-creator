import {describe, expect, it, vi} from "vitest";
vi.setConfig({testTimeout:120000,hookTimeout:180000});
import {createDb, projects, contentOutputs, type Db} from "@creatoros/backend";
import {accountGroups} from "../../schema/account-groups";
import {ENDPOINTS} from "@creatoros/contract";
import {createCreativeResultsTransport} from "./creative-results.transport";
import type {RequestContext} from "@creatoros/contract";
import {createCreativeResultsService, type CreativeResultAdapter} from "./creative-results.service";

// T1325：这是实际adapter/owner/数据库组合；模型结果只在原生成端口受控，
// 不替代frontend新owned完整worker/真实文件主链，不mock最终adopt或probe。
it.each(["article-text","article-sections","graphic-text","graphic-cardBriefs","output-script","publication-text","publication-cover"])(
  "当前生成未配置时真实owner采纳仍可用：%s",async family=>{
    const opened=await createDb();await seedOwnedParents(opened.db);
    const {createProjectRepository,createProjectsService}=await import("../projects");
    const {createArtifactsService}=await import("../artifacts");
    const {createArticlesService}=await import("../articles");
    const {createGraphicPostsService}=await import("../graphic-posts");
    const {createArticleTextResultsService}=await import("../articles/articles.text-results");
    const {createArticleCreativeResultAdapter}=await import("../articles/articles.creative-adapter");
    const {createGraphicPostCreativeResultAdapter}=await import("../graphic-posts/graphic-posts.creative-adapter");
    const {createOutputScriptsService}=await import("../output-scripts/output-scripts.service");
    const {createOutputScriptCreativeResultAdapter}=await import("../output-scripts/output-scripts.creative-adapter");
    const {createPublicationResultsService}=await import("../publishing/publication-results.service");
    const {createPublicationCreativeResultAdapter,combinePublicationResultAdapters}=await import("../publishing/publication-results.creative-adapter");
    const {createPublicationCoverCreativeResultAdapter}=await import("../publishing/publication-cover.creative-adapter");
    const {creativeResults}=await import("../../schema/creative-results");
    const {eq}=await import("drizzle-orm");
    let seq=0,ready=true,probes=0,submits=0;const tasks=new Map<string,any>();
    const ctx=context("a"),now=()=>"2026-10-16T00:00:00.000Z",nextId=(p:string)=>`t1325-${p}-${++seq}`;
    const projects=(db:Db)=>createProjectsService(createProjectRepository(db),{now,nextId});
    const artifacts=(db:Db)=>createArtifactsService({db,now,nextId,assertProjectOwned:(c,id)=>projects(db).getProject(c,id),resolveOutputProjectId:(c,id)=>projects(db).getProjectIdByOutput(c,id)});
    const probe=async()=>{probes++;return {ready,reasonCode:ready?undefined:"MODEL_NOT_CONFIGURED"};};
    const generation=(taskType:string,resultType:string)=>async(_c:RequestContext,input:{inputData:Record<string,unknown>})=>{
      const id=nextId("task");submits++;tasks.set(id,{id,taskType,status:"awaiting_confirmation",inputData:input.inputData,
        results:[{resultType,resultData:taskType==="wechat.article-draft"?{proposal:{proposedTitle:"结构候选",proposedTitleSourceRefs:[],proposedSummary:"",proposedSummarySourceRefs:[],proposedFactItems:[],proposedSections:[{sectionId:"owned-structured-section",op:"insert",afterSectionId:null,order:0,heading:"结构段落",headingLevel:2,body:"完整结构正文",sourceRefs:input.inputData.sourceRefs??[]}],proposedVisualBriefs:[],sourceRefs:input.inputData.sourceRefs??[]}}:{kind:input.inputData.kind,value:input.inputData.kind==="cardBriefs"?[{cardId:"owned-structured-card",title:"结构图卡",body:"完整图卡正文",visualBrief:"中性插画",sourceRefs:input.inputData.sourceRefs??[]}]:"真实owner组合候选"}}]});return {id,status:"awaiting_confirmation"};};
    const read=async(_c:RequestContext,id:string)=>{const t=tasks.get(id);if(!t)throw Error("原受控任务不存在");return t;};
    const assertFile=async(_c:RequestContext,a:string,f:string)=>{if(a!=="owned-image"||f!=="owned-file")throw Error("实际文件归属拒绝");};
    const article=createArticlesService(opened.db,{now,nextId,projects,artifacts,assertAssetFile:assertFile,resolveDocumentSource:async()=>null,resolveSelectedBrand:async()=>null,submitGeneration:generation("wechat.article-draft","wechat_article_candidate"),readGeneration:read});
    let adapter:CreativeResultAdapter,outputId="",kind:any="title",expected:Record<string,unknown>={},base="",readFinal:(()=>Promise<any>)|undefined;
    try{
      if(family==="article-text"||family==="article-sections"){
        const o=await article.createOutput(ctx,output.projectId,{title:"文章owner",clientRequestId:"t1325-article-output"});outputId=o.id;
        const initial=await article.getArticle(ctx,o.id);base=initial.currentVersionId;
        const owner=createArticleTextResultsService(opened.db,{articles:article,projects:projects(opened.db),submitGeneration:generation("wechat.article-text","wechat_article_text_candidate"),readGeneration:read,now,nextId});
        adapter=createArticleCreativeResultAdapter({service:owner,articles:article,readTaskType:async(c,id)=>(await read(c,id)).taskType,probeTextGeneration:probe});kind=family==="article-sections"?"sections":"title";readFinal=()=>article.getArticle(ctx,outputId);expected={owner:adapter.owner,versionId:base};
      }else if(family==="graphic-text"||family==="graphic-cardBriefs"){
        const owner=createGraphicPostsService(opened.db,{now,projects,artifacts,assertAssetFile:assertFile,submitTextGeneration:generation("graphic.post-text","graphic_post_text_candidate"),readTextGeneration:read});
        const o=await owner.createOutput(ctx,output.projectId,{title:"图文owner",targetPlatform:"xiaohongshu",clientRequestId:"t1325-graphic-output"});outputId=o.id;base=(await owner.getGraphicPost(ctx,o.id)).currentVersionId;
        adapter=createGraphicPostCreativeResultAdapter({service:owner,probeTextGeneration:probe});kind=family==="graphic-cardBriefs"?"cardBriefs":"title";readFinal=()=>owner.getGraphicPost(ctx,outputId);expected={owner:adapter.owner,versionId:base};
      }else{
        const o=await projects(opened.db).createOutput(ctx,output.projectId,{title:"实际视频作品",contentType:"video",targetPlatform:"douyin"});outputId=o.id;
        const a=await artifacts(opened.db).createArtifact(ctx,{projectId:output.projectId,artifactType:"output_script",title:"原脚本",stage:"script",contentOutputId:o.id});
        const v=await artifacts(opened.db).createVersion(ctx,a.id,{contentText:"用户明确保存的完整中性脚本。",contentData:{},changeSummary:"用户输入"});base=v.id;
        if(family==="output-script"){
          kind="script";
          const owner=createOutputScriptsService({projects:projects(opened.db),artifacts:artifacts(opened.db),readTask:read,submitScriptDraft:async(_c,input)=>{
            const id=nextId("task");submits++;tasks.set(id,{id,taskType:"script.draft",status:"awaiting_confirmation",projectId:output.projectId,inputData:{...input,artifactId:a.id,baseVersionId:base},results:[{resultType:"artifact_version",artifactId:a.id,resultData:{body:"真实owner脚本候选",contentData:{}}}]});return {id};}});
          adapter=createOutputScriptCreativeResultAdapter({service:owner,probeScriptGeneration:probe});expected={owner:adapter.owner,versionId:base};
        }else{
          const owner=createPublicationResultsService(opened.db,{projects:projects(opened.db),submitGeneration:generation("publication.text","publication_text_candidate"),readGeneration:read,assertCoverAssetFile:assertFile,now,nextId});
          expected={owner:"publication",mode:"create",outputId,platform:"douyin",expectedAbsent:true};
          const text=createPublicationCreativeResultAdapter({service:owner,probeTextGeneration:probe});
          const cover=createPublicationCoverCreativeResultAdapter({db:opened.db,owner,probeCover:probe,now,nextId:()=>nextId("cover"),
            resolveCoverSource:async()=>({topic:"用户中性脚本",fullText:"用户明确保存的完整中性脚本。",artifactId:a.id,versionId:base}),
            freezeCoverContext:async()=>({positioningBrief:"",projectBriefHard:"",reviewScript:"用户明确保存的完整中性脚本。",userMaterialHardBrief:"",userMaterialRefBrief:"",knowledgeBrief:"",orientationHint:"",topic:{title:"中性脚本",angle:""}}),
            submitCover:async(_c,input)=>{const id=nextId("task");submits++;tasks.set(id,{id,taskType:"cover.generate",status:"awaiting_confirmation",projectId:output.projectId,contentOutputId:outputId,inputData:input.inputData});return {id};},readTask:read,
            listResults:async()=>[{resultType:"generated_asset",assetId:"owned-image",resultData:{assetId:"owned-image",assetType:"image"}}],
            confirmTask:async(_c,id)=>{tasks.get(id).status="succeeded";},
            assets:{getAsset:async()=>({currentFileId:"owned-file",status:"active"}) as never,assertAssetFileOwned:assertFile,getAssetFileDownloadUrl:async()=>({url:"controlled-owned-file"}) as never}});
          adapter=combinePublicationResultAdapters(text,cover);kind=family==="publication-cover"?"publish_cover":"publish_title";
        }
      }
      const registry:Record<string,CreativeResultAdapter>={[adapter!.owner]:adapter!,"corrupt-owner":adapter!};
      const service=createCreativeResultsService(opened.db,{projects:projects(opened.db),adapters:registry,nextId:()=>nextId("result"),now});
      const original=await service.generate(ctx,{outputId,kind,clientRequestId:"t1325-original-generation"});
      expect(original.value).not.toBeNull();const requests=submits,probeBefore=probes;ready=false;
      const editedValue=original.value;if(typeof editedValue!=="string"&&!Array.isArray(editedValue))throw Error("实际候选值类型无效");
      const request={resultId:original.resultId,expected,editedValue,clientRequestId:"t1325-original-adoption"};
      // 精确静态/权限拒绝不靠模型未配置遮住；相同合法候选随后仍可正常采纳。
      await expect(service.adopt({...ctx,userId:"foreign-user"},request)).rejects.toMatchObject({code:"OUTPUT_NOT_OWNED"});
      await expect(service.adopt(context("foreign-account"),request)).rejects.toMatchObject({code:"OUTPUT_NOT_OWNED"});
      await expect(service.adopt(ctx,{...request,expected:{...expected,owner:"wrong-owner"}})).rejects.toMatchObject({code:"OWNER_MISMATCH"});
      const [row]=await opened.db.select().from(creativeResults).where(eq(creativeResults.id,original.resultId));
      for(const patch of (family==="article-sections"||family==="graphic-cardBriefs"?[]:[{targetPlatform:"unknown-platform"},{kind:"unknown-kind"},{outputType:"unknown-output"}]) as Array<{targetPlatform?:string;kind?:string;outputType?:string}>){
        await opened.db.update(creativeResults).set(patch).where(eq(creativeResults.id,row!.id));
        await expect(service.adopt(ctx,request)).rejects.toMatchObject({code:family==="publication-cover"&&"kind" in patch?"CANDIDATE_NOT_READY":"UNSUPPORTED_DELIVERABLE"});
        await opened.db.update(creativeResults).set({targetPlatform:row!.targetPlatform,kind:row!.kind,outputType:row!.outputType}).where(eq(creativeResults.id,row!.id));
      }
      if(family==="article-sections"||family==="graphic-cardBriefs"){
        await expect(service.adopt(ctx,{...request,editedValue:"错误的结构值"})).rejects.toMatchObject({code:"UNSUPPORTED_DELIVERABLE"});
        await expect(service.adopt(ctx,{...request,expected:{...expected,versionId:"foreign-base-version"}})).rejects.toThrow();
        const changedSources=structuredClone(editedValue) as any[];
        changedSources[0].sourceRefs=[{kind:"project",id:"foreign-project",versionId:"foreign-version"}];
        if(family==="article-sections")await expect(service.adopt(ctx,{...request,editedValue:changedSources})).rejects.toThrow("编辑段落改变了原候选操作、定位或来源");
        else await expect(service.adopt(ctx,{...request,editedValue:changedSources})).rejects.toMatchObject({code:"OwnershipError"});
        expect((await readFinal!()).currentVersionId).toBe(base);
        if(family==="article-sections"){
          await expect(service.adopt(ctx,{...request,editedValue:[]})).rejects.toThrow("请选择完整段落投影进行采用");
          const sections=structuredClone(editedValue) as any[];
          sections[0].sectionId="foreign-section";
          await expect(service.adopt(ctx,{...request,editedValue:sections})).rejects.toThrow("请选择完整段落投影进行采用");
        }
      }
      const originalOwner=adapter!.owner;
      try{(adapter as {owner:string}).owner="corrupt-owner";await expect(service.adopt(ctx,request)).rejects.toMatchObject({code:"OWNER_MISMATCH"});}
      finally{(adapter as {owner:string}).owner=originalOwner;}
      await opened.db.update(creativeResults).set({owner:"corrupt-owner"}).where(eq(creativeResults.id,row!.id));
      await expect(service.adopt(ctx,{...request,expected:{...request.expected,owner:"corrupt-owner"}})).rejects.toMatchObject({code:"OWNER_MISMATCH"});
      await opened.db.update(creativeResults).set({owner:"unknown-adapter"}).where(eq(creativeResults.id,row!.id));
      await expect(service.adopt(ctx,{...request,expected:{...request.expected,owner:"unknown-adapter"}})).rejects.toMatchObject({code:"CAPABILITY_UNAVAILABLE"});
      await opened.db.update(creativeResults).set({owner:row!.owner}).where(eq(creativeResults.id,row!.id));
      const receipt=await service.adopt(ctx,request);expect(receipt.status).toBe("adopted");expect(probes).toBe(probeBefore);expect(submits).toBe(requests);
      if(readFinal&&(family==="article-sections"||family==="graphic-cardBriefs")){
        const after=await readFinal();
        if(family==="article-sections")expect(after.current.sections[0]).toMatchObject({sectionId:"owned-structured-section",body:"完整结构正文"});
        else expect(after.current.cardBriefs).toEqual(editedValue);
      }
      expect(await service.adopt(ctx,request)).toEqual(receipt);expect(submits).toBe(requests);
      await expect(service.adopt(ctx,{...request,clientRequestId:"different-body-key"})).rejects.toMatchObject({code:"IDEMPOTENCY_CONFLICT"});
      await expect(service.generate(ctx,{outputId,kind,clientRequestId:"t1325-new-unconfigured-request"})).rejects.toMatchObject({code:"CAPABILITY_UNAVAILABLE"});expect(submits).toBe(requests);
    }finally{await opened.client.close();}
  },120000);

const context = (accountId: string): RequestContext => ({userId: "u-1029", accountId, requestId: "r-1029", source: "user"});
const output = {id: "out-1029", projectId: "project-1029", contentType: "image", targetPlatform: "xiaohongshu"};

it("T1325：新的生成与冻结重试仍必须经过当前readiness，零新请求",async()=>{
  const opened=await createDb();await seedOwnedParents(opened.db);let ready=true,submits=0,retries=0,seq=0;
  const adapter:CreativeResultAdapter={owner:"graphic_post",probe:async()=>({state:ready?"supported":"known_unavailable",reasonCode:ready?null:"MODEL_NOT_CONFIGURED",lastVerifiedAt:null}),
    enqueue:async()=>{submits++;return {candidateId:"original-failed",taskId:"original-task",baseVersionId:"v1",sourceRefs:[],ruleSnapshotRef:null,appliedRules:"not_applied",status:"failed"};},
    read:async()=>({status:"failed",value:null,errorCode:"GENERATION_FAILED"}),adopt:async()=>{throw Error("本例不调用采纳owner");},
    retryFrozen:async()=>{retries++;throw Error("不得提交未配置的重试");}};
  const service=createCreativeResultsService(opened.db,{projects:{getOutput:async()=>output as never,getProject:async()=>({id:output.projectId}) as never},adapters:{graphic_post:adapter},nextId:()=>`readiness-result-${++seq}`});
  try{
    const failed=await service.generate(context("a"),{outputId:output.id,kind:"body",clientRequestId:"original-failed-request"});ready=false;
    await expect(service.generate(context("a"),{outputId:output.id,kind:"body",clientRequestId:"new-unconfigured-request"})).rejects.toMatchObject({code:"CAPABILITY_UNAVAILABLE",message:"MODEL_NOT_CONFIGURED"});
    await expect(service.retry(context("a"),failed.resultId,"new-unconfigured-retry")).rejects.toMatchObject({code:"CAPABILITY_UNAVAILABLE",message:"MODEL_NOT_CONFIGURED"});
    expect(submits).toBe(1);expect(retries).toBe(0);
  }finally{await opened.client.close();}
},120000);

async function seedOwnedParents(db:Db){
 const now='2026-10-01T00:00:00.000Z';
 await db.insert(projects).values({id:output.projectId,userId:'u-1029',accountId:'a',groupId:null,title:'原测试真实父',creationMode:'script',status:'active',currentStage:'planning',startedAt:now,createdAt:now,updatedAt:now});
 await db.insert(contentOutputs).values([{id:output.id,projectId:output.projectId,contentType:'image',title:'原图文',status:'draft',targetPlatform:'xiaohongshu',createdAt:now,updatedAt:now},{id:'article-1029',projectId:output.projectId,contentType:'article',title:'原文章',status:'draft',targetPlatform:'wechatOfficialAccount',createdAt:now,updatedAt:now}]);
}

describe("T-1029 result ownership and partial delivery", () => {
  it("persists an article image candidate's selected section across result and bundle reads", async () => {
    const opened = await createDb();await seedOwnedParents(opened.db);
    let sequence = 0;
    const articleOutput = {id: "article-1029", projectId: "project-1029", contentType: "article", targetPlatform: "wechatOfficialAccount"};
    const seen: string[] = [];
    const adapter: CreativeResultAdapter = {
      owner: "wechat_article",
      async probe() { return {state: "supported", reasonCode: null, lastVerifiedAt: "2026-10-01T00:00:00.000Z"}; },
      async enqueue(_ctx, input) {
        seen.push(input.targetSectionId ?? "missing");
        return {candidateId: `candidate-${seen.length}`, taskId: `task-${seen.length}`, baseVersionId: "v1",
          ruleSnapshotRef: null, appliedRules: "not_applied", sourceRefs: [], status: "queued"};
      },
      async read() { return {status: "queued", value: null, errorCode: null}; },
      async adopt() { return {versionId: "v2"}; },
    };
    const service = createCreativeResultsService(opened.db, {
      projects: {async getOutput() { return articleOutput as never; }, async getProject() { return {id: articleOutput.projectId} as never; }},
      adapters: {wechat_article: adapter}, now: () => "2026-10-01T00:00:00.000Z", nextId: () => `result-${++sequence}`,
    });
    try {
      const result = await service.generate(context("a"), {outputId: articleOutput.id, kind: "image_card",
        targetSectionId: "section-one", clientRequestId: "section-request-one"});
      expect(result.targetSectionId).toBe("section-one");
      expect((await service.list(context("a"), {outputId: articleOutput.id})).items[0]?.targetSectionId).toBe("section-one");
      const bundle = await service.createBundle(context("a"), {outputId: articleOutput.id,
        items: [{kind: "image_card", targetSectionId: "section-two"}], clientRequestId: "section-bundle-one"});
      expect(bundle.items[0]?.targetSectionId).toBe("section-two");
      const transport=createCreativeResultsTransport(()=>service);
      const created=await transport.request(ENDPOINTS.createBundle,{params:{outputId:articleOutput.id},body:{items:[{kind:"image_card",targetSectionId:"section-two"}],clientRequestId:"section-bundle-one"},query:undefined},context("a"));
      const read=await transport.request(ENDPOINTS.getBundle,{params:{bundleId:bundle.bundleId},body:undefined,query:undefined},context("a"));
      const list=await transport.request(ENDPOINTS.listBundles,{params:{outputId:articleOutput.id},body:undefined,query:{pageSize:20}},context("a"));
      expect(ENDPOINTS.createBundle.response.safeParse((created as {data:unknown}).data).success).toBe(true);
      expect(ENDPOINTS.getBundle.response.safeParse((read as {data:unknown}).data).success).toBe(true);
      expect(ENDPOINTS.listBundles.response.safeParse((list as {data:unknown}).data).success).toBe(true);
      expect(bundle.items[0]).not.toHaveProperty("requestId");

      expect(seen).toEqual(["section-one", "section-two"]);
      await expect(service.generate(context("a"), {outputId: articleOutput.id, kind: "image_card",
        targetSectionId: "section-other", clientRequestId: "section-request-one"})).rejects.toThrow();
    } finally { await opened.client.close(); }
  });

  it("keeps a successful item when another bundle item fails, and denies cross-account reads", async () => {
    const opened = await createDb();await seedOwnedParents(opened.db);
    let sequence = 0;
    const adapter: CreativeResultAdapter = {
      owner: "graphic_post",
      async probe() { return {state: "supported", reasonCode: null, lastVerifiedAt: "2026-10-01T00:00:00.000Z"}; },
      async enqueue(_ctx, input) {
        if (input.kind === "tags") throw Object.assign(new Error("model failed"), {code: "MODEL_UNAVAILABLE"});
        return {candidateId: `candidate-${input.kind}`, taskId: `task-${input.kind}`, baseVersionId: "v1",
          ruleSnapshotRef: "rule-v1", appliedRules: "applied" as const, sourceRefs: [], status: "succeeded" as const};
      },
      async read() { return {status: "succeeded", value: "标题候选", errorCode: null}; },
      async adopt() { return {versionId: "v2"}; },
    };
    const service = createCreativeResultsService(opened.db, {
      projects: {
        async getOutput(ctx) { if (ctx.accountId !== "a") throw Object.assign(new Error("missing"), {code: "OwnershipError"}); return output as never; },
        async getProject(ctx) { if (ctx.accountId !== "a") throw Object.assign(new Error("missing"), {code: "OwnershipError"}); return {id: output.projectId} as never; },
      },
      adapters: {graphic_post: adapter},
      now: () => "2026-10-01T00:00:00.000Z",
      nextId: () => `result-${++sequence}`,
    });
    try {
      const bundle = await service.createBundle(context("a"), {outputId: output.id,
        items: [{kind: "title"}, {kind: "tags"}], clientRequestId: "bundle-one"});
      expect(bundle.status).toBe("partial_completed");
      expect(bundle.items.map((item) => item.status)).toEqual(["succeeded", "failed"]);
      const listed = await service.list(context("a"), {outputId: output.id});
      expect(listed.items).toHaveLength(2);
      expect(listed.items.find((item) => item.kind === "title")?.value).toBe("标题候选");
      await expect(service.getBundle(context("b"), bundle.bundleId)).rejects.toThrow();
      await expect(service.list(context("b"), {outputId: output.id})).rejects.toThrow();
    } finally { await opened.client.close(); }
  });
});


describe("重试保留数据库读回的冻结来源", () => {
  it("字段顺序不影响重试，真实来源变化和跨账号仍拒绝，重复请求不新增任务", async () => {
    const opened = await createDb();await seedOwnedParents(opened.db);
    let sequence = 0, retries = 0, changeSource = false;
    const refs = [{kind: "project", id: "project-1029", versionId: "project-v1"}];
    const frozen = {baseVersionId: "v1", ruleSnapshotRef: "rule-v1", appliedRules: "applied" as const, sourceRefs: refs};
    const adapter: CreativeResultAdapter = {
      owner: "graphic_post",
      async probe() { return {state: "supported", reasonCode: null, lastVerifiedAt: null}; },
      async enqueue() { return {...frozen, candidateId: "old", taskId: "old-task", status: "failed"}; },
      async read(_ctx, id) { return {status: id === "old" ? "failed" : "queued", value: null, errorCode: null}; },
      async retryFrozen() { retries++; return {...frozen, candidateId: `new-${retries}`, taskId: `new-task-${retries}`,
        sourceRefs: [{versionId: changeSource ? "changed" : "project-v1", id: "project-1029", kind: "project"}], status: "queued"}; },
      async adopt() { return {versionId: "v2"}; },
    };
    const service = createCreativeResultsService(opened.db, {projects: {
      async getOutput() { return output as never; }, async getProject() { return {id: output.projectId} as never; }},
      adapters: {graphic_post: adapter}, nextId: () => `retry-result-${++sequence}`});
    try {
      const old = await service.generate(context("a"), {outputId: output.id, kind: "tags", clientRequestId: "first-failed-request"});
      const retried = await service.retry(context("a"), old.resultId, "retry-same-snapshot");
      expect(retried).toMatchObject({retryOf: old.resultId, status: "queued", sourceRefs: refs, baseVersionId: "v1", ruleSnapshotRef: "rule-v1"});
      expect((await service.retry(context("a"), old.resultId, "retry-same-snapshot")).resultId).toBe(retried.resultId);
      expect(retries).toBe(1);
      changeSource = true;
      await expect(service.retry(context("a"), old.resultId, "retry-changed-source")).rejects.toThrow("重试任务未保留原始资料和规则快照");
      await expect(service.retry(context("b"), old.resultId, "retry-other-account")).rejects.toThrow();
    } finally { await opened.client.close(); }
  });
});

it("转换提交丢回执仍保留原预约，并携带完整冻结意图恢复同一任务",async()=>{
 const opened=await createDb();await seedOwnedParents(opened.db);let calls=0;
 const conversion={request:{sourceOutputId:"article-source",sourceVersionId:"source-v",targetType:"image" as const,mode:"whole" as const,clientRequestId:"conversion-request-original",reuseImages:[]},
  sourceAnchor:{kind:"output_version" as const,sourceOutputId:"article-source",artifactId:"source-artifact",versionId:"source-v",sourceType:"article" as const,selectionDigest:"a".repeat(64),selection:{mode:"whole" as const}}};
 const adapter:CreativeResultAdapter={owner:"graphic_post",probe:async()=>({state:"supported",reasonCode:null,lastVerifiedAt:null}),
  enqueue:async(_ctx,input)=>{expect(input.conversion).toEqual(conversion);calls++;if(calls===1)throw Error("提交已发生但回复丢失");return {candidateId:"original-candidate",taskId:"original-task",baseVersionId:"v1",ruleSnapshotRef:null,appliedRules:"not_applied",sourceRefs:[conversion.sourceAnchor],status:"queued"};},
  read:async()=>({status:"queued",value:null,errorCode:null}),adopt:async()=>({versionId:"v2"})};
 const service=createCreativeResultsService(opened.db,{projects:{getOutput:async()=>output as never,getProject:async()=>({id:output.projectId}) as never},adapters:{graphic_post:adapter},nextId:()=>"conversion-reserved-result"});
 const input={outputId:output.id,kind:"body" as const,clientRequestId:"conversion-field-body",conversion};
 try{
  await expect(service.generate(context("a"),input)).rejects.toThrow();
  expect(await service.get(context("a"),"conversion-reserved-result")).toMatchObject({status:"queued",taskId:null,errorCode:"GENERATION_SUBMISSION_UNKNOWN"});
  expect(await service.generate(context("a"),input)).toMatchObject({resultId:"conversion-reserved-result",taskId:"original-task",status:"queued",errorCode:null});
  expect(calls).toBe(2);
  await expect(service.generate(context("a"),{...input,conversion:{...conversion,request:{...conversion.request,reuseImages:[{assetId:"changed",assetFileId:"file"}]}}})).rejects.toMatchObject({code:"IDEMPOTENCY_CONFLICT"});
 }finally{await opened.client.close();}
},120000);

it("转换所有字段先落原账本预约，随后生成恢复其原 result ID",async()=>{
 const opened=await createDb();await seedOwnedParents(opened.db);let seq=0,calls=0;
 const conversion={request:{sourceOutputId:"article-source",sourceVersionId:"v",targetType:"image" as const,mode:"whole" as const,clientRequestId:"conversion-all-fields-request",reuseImages:[]},sourceAnchor:{kind:"output_version" as const,sourceOutputId:"article-source",artifactId:"article-artifact",versionId:"v",sourceType:"article" as const,selectionDigest:"a".repeat(64),selection:{mode:"whole" as const}}};
 const {creativeResultBundles}=await import("@creatoros/backend");
 const adapter:CreativeResultAdapter={owner:"graphic_post",probe:async()=>({state:"supported",reasonCode:null,lastVerifiedAt:null}),enqueue:async(_c,input)=>{calls++;expect((await service.list(context("a"),{outputId:output.id})).items).toHaveLength(3);return {candidateId:`candidate-${input.kind}`,taskId:`task-${input.kind}`,baseVersionId:"base",ruleSnapshotRef:null,appliedRules:"not_applied",sourceRefs:[conversion.sourceAnchor],status:"queued"};},read:async()=>({status:"queued",value:null,errorCode:null}),adopt:async()=>({versionId:"saved"})};
 const service=createCreativeResultsService(opened.db,{projects:{getOutput:async()=>output as never,getProject:async()=>({id:output.projectId}) as never},adapters:{graphic_post:adapter},nextId:()=>`reserved-${++seq}`});
 try{
  await opened.db.insert(creativeResultBundles).values({id:"conversion-bundle",userId:"u-1029",accountId:"a",projectId:output.projectId,outputId:output.id,items:[],requestDigest:"durable-intent",clientRequestId:conversion.request.clientRequestId,conversionContext:conversion,targetCreationKey:"actual-target-creation",createdAt:"2026-10-02T00:00:00Z"});
  const plans=await service.reserveConversionFields(context("a"),"conversion-bundle");
  expect(plans.map(p=>p.kind)).toEqual(["title","body","cardBriefs"]);expect(calls).toBe(0);
  expect(await service.reserveConversionFields(context("a"),"conversion-bundle")).toEqual(plans);
  const result=await service.generate(context("a"),{outputId:output.id,kind:"body",targetPlatform:output.targetPlatform as "xiaohongshu",clientRequestId:plans[1]!.clientRequestId,conversion});
  expect(result.resultId).toBe(plans[1]!.resultId);expect(calls).toBe(1);
 }finally{await opened.client.close();}
},120000);

it("转换回执按持久字段映射读取真实生成与独立采用，不凭作品内容猜采用",async()=>{
 const opened=await createDb();await seedOwnedParents(opened.db);let seq=0;
 const conversion={request:{sourceOutputId:"article-source",sourceVersionId:"v",targetType:"image" as const,mode:"whole" as const,clientRequestId:"receipt-original-request",reuseImages:[]},sourceAnchor:{kind:"output_version" as const,sourceOutputId:"article-source",artifactId:"article-artifact",versionId:"v",sourceType:"article" as const,selectionDigest:"a".repeat(64),selection:{mode:"whole" as const}}};
 const {creativeResultBundles}=await import("@creatoros/backend");
 const adapter:CreativeResultAdapter={owner:"graphic_post",probe:async()=>({state:"supported",reasonCode:null,lastVerifiedAt:null}),enqueue:async(_c,input)=>({candidateId:`candidate-${input.kind}`,taskId:`task-${input.kind}`,baseVersionId:"base",ruleSnapshotRef:null,appliedRules:"not_applied",sourceRefs:[conversion.sourceAnchor],status:"succeeded"}),read:async()=>({status:"succeeded",value:"标题",errorCode:null}),adopt:async()=>({versionId:"actual-adopted-version"})};
 const service=createCreativeResultsService(opened.db,{projects:{getOutput:async()=>output as never,getProject:async()=>({id:output.projectId}) as never},adapters:{graphic_post:adapter},nextId:()=>`receipt-${++seq}`});
 try{
  await opened.db.insert(creativeResultBundles).values({id:"receipt-bundle",userId:"u-1029",accountId:"a",projectId:output.projectId,outputId:output.id,items:[],requestDigest:"intent",clientRequestId:conversion.request.clientRequestId,conversionContext:conversion,targetCreationKey:"creation-receipt",createdAt:"2026-10-02T00:00:00Z"});
  const plans=await service.reserveConversionFields(context("a"),"receipt-bundle");
  expect((await service.getConversionReceipt(context("a"),"receipt-bundle")).items.every(i=>i.taskId===null&&i.adoption.status==="not_adopted")).toBe(true);
  await service.generate(context("a"),{outputId:output.id,kind:"title",targetPlatform:"xiaohongshu",clientRequestId:plans[0]!.clientRequestId,conversion});
  await service.adopt(context("a"),{resultId:plans[0]!.resultId,expected:{owner:"graphic_post",versionId:"base"},editedValue:"人工标题",clientRequestId:"actual-field-adoption"});
  const receipt=await service.getConversionReceipt(context("a"),"receipt-bundle");
  expect(receipt.items[0]).toMatchObject({targetField:"title",taskId:"task-title",adoption:{status:"adopted",versionId:"actual-adopted-version",clientRequestId:"actual-field-adoption"}});
  expect(receipt.items.slice(1).every(i=>i.adoption.status==="not_adopted")).toBe(true);
 }finally{await opened.client.close();}
},120000);

it("转换 owner 的已知输入拒绝不能标成提交未知",async()=>{
 const opened=await createDb();await seedOwnedParents(opened.db);
 const conversion={request:{sourceOutputId:"source",sourceVersionId:"v",targetType:"image" as const,mode:"whole" as const,clientRequestId:"bad-input-conversion",reuseImages:[]},sourceAnchor:{kind:"output_version" as const,sourceOutputId:"source",artifactId:"artifact",versionId:"v",sourceType:"article" as const,selectionDigest:"a".repeat(64),selection:{mode:"whole" as const}}};
 const adapter:CreativeResultAdapter={owner:"graphic_post",probe:async()=>({state:"supported",reasonCode:null,lastVerifiedAt:null}),enqueue:async()=>{throw Object.assign(Error("原冻结来源失效"),{code:"SOURCE_SELECTION_INVALID"});},read:async()=>({status:"queued",value:null,errorCode:null}),adopt:async()=>({versionId:"v"})};
 const service=createCreativeResultsService(opened.db,{projects:{getOutput:async()=>output as never,getProject:async()=>({id:output.projectId}) as never},adapters:{graphic_post:adapter},nextId:()=>"bad-input-result"});
 try{await expect(service.generate(context("a"),{outputId:output.id,kind:"title",clientRequestId:"bad-input-field",conversion})).rejects.toMatchObject({code:"SOURCE_SELECTION_INVALID"});expect(await service.get(context("a"),"bad-input-result")).toMatchObject({status:"failed",taskId:null,errorCode:"SOURCE_SELECTION_INVALID"});}
 finally{await opened.client.close();}
},120000);

it.each(["success","error"])("迟到的转换提交%s不覆盖先完成的真实采用回执",async(late)=>{
 const opened=await createDb();await seedOwnedParents(opened.db);let calls=0;
 let resolveFirst!:()=>void,resolveSecond!:()=>void,entered!:()=>void;
 const firstGate=new Promise<void>(resolve=>{resolveFirst=resolve;}),secondGate=new Promise<void>(resolve=>{resolveSecond=resolve;}),bothEntered=new Promise<void>(resolve=>{entered=resolve;});
 const conversion={request:{sourceOutputId:"source",sourceVersionId:"v",targetType:"image" as const,mode:"whole" as const,clientRequestId:"late-submit-conversion",reuseImages:[]},sourceAnchor:{kind:"output_version" as const,sourceOutputId:"source",artifactId:"source-artifact",versionId:"v",sourceType:"article" as const,selectionDigest:"a".repeat(64),selection:{mode:"whole" as const}}};
 const adapter:CreativeResultAdapter={owner:"graphic_post",probe:async()=>({state:"supported",reasonCode:null,lastVerifiedAt:null}),enqueue:async()=>{const index=++calls;if(index===1)await firstGate;else{entered();await secondGate;if(late==="error")throw Error("迟到网络回复失败");}return {candidateId:"original-candidate",taskId:"original-task",baseVersionId:"base",ruleSnapshotRef:null,appliedRules:"not_applied",sourceRefs:[conversion.sourceAnchor],status:"succeeded"};},read:async()=>({status:"succeeded",value:"标题",errorCode:null}),adopt:async()=>({versionId:"adopted-version"})};
 const service=createCreativeResultsService(opened.db,{projects:{getOutput:async()=>output as never,getProject:async()=>({id:output.projectId}) as never},adapters:{graphic_post:adapter},nextId:()=>"late-result"});
 const input={outputId:output.id,kind:"title" as const,clientRequestId:"late-field-request",conversion};
 try{
  const first=service.generate(context("a"),input),second=service.generate(context("a"),input);
  const secondObserved=second.then(value=>({value,error:null}),error=>({value:null,error}));
  await bothEntered;resolveFirst();const one=await first;
  await service.adopt(context("a"),{resultId:one.resultId,expected:{owner:"graphic_post",versionId:"base"},editedValue:"人工标题",clientRequestId:"late-adoption-request"});
  resolveSecond();const observed=await secondObserved;
  expect(observed.error).toBeNull();expect(observed.value).toMatchObject({status:"adopted",taskId:"original-task",errorCode:null});
  expect(await service.get(context("a"),one.resultId)).toMatchObject({status:"adopted",taskId:"original-task",errorCode:null});
 }finally{resolveFirst();resolveSecond();await opened.client.close();}
},120000);
it("重试先预约套装结果，原 owner 已运行而回复丢失时恢复原请求；读取不执行",async()=>{
 const opened=await createDb();await seedOwnedParents(opened.db);let sequence=0,resumeCalls=0,status:"failed"|"running"="failed";
 const frozen={baseVersionId:"base",ruleSnapshotRef:null,sourceRefs:[],appliedRules:"not_applied" as const};
 const adapter:CreativeResultAdapter={owner:"graphic_post",probe:async()=>({state:"supported",reasonCode:null,lastVerifiedAt:null}),enqueue:async()=>({...frozen,candidateId:"original-candidate",taskId:"original-task",status:"failed"}),
  read:async()=>({status,value:null,errorCode:status==="failed"?"MODEL_FAILED":null}),adopt:async()=>({versionId:"unused"}),
  retryFrozen:async(_c,input)=>{expect(input).toEqual({candidateId:"original-candidate",clientRequestId:"pending-retry-request"});resumeCalls++;status="running";if(resumeCalls===1)throw Error("原任务恢复但回复丢失");return {...frozen,candidateId:"original-candidate",taskId:"original-task",status};}};
 const service=createCreativeResultsService(opened.db,{projects:{getOutput:async()=>output as never,getProject:async()=>({id:output.projectId}) as never},adapters:{graphic_post:adapter},nextId:()=>`pending-result-${++sequence}`});
 try{
  const bundle=await service.createBundle(context("a"),{outputId:output.id,items:[{kind:"title"}],clientRequestId:"pending-retry-bundle"});const old=bundle.items[0]!.resultId;
  await expect(service.retry(context("a"),old,"pending-retry-request")).rejects.toThrow("回复丢失");
  const afterLost=await service.getBundle(context("a"),bundle.bundleId);expect(afterLost.items[0]!.resultId).not.toBe(old);
  const pending=await service.get(context("a"),afterLost.items[0]!.resultId);expect(pending).toMatchObject({retryOf:old,taskId:null,typedCandidateRef:null,status:"queued"});expect(resumeCalls).toBe(1);
  const recovered=await service.retry(context("a"),old,"pending-retry-request");expect(recovered).toMatchObject({resultId:pending.resultId,taskId:"original-task",status:"running",retryOf:old});
  expect((await service.getBundle(context("a"),bundle.bundleId)).items[0]!.resultId).toBe(recovered.resultId);
  expect((await service.retry(context("a"),old,"pending-retry-request")).resultId).toBe(recovered.resultId);expect(resumeCalls).toBe(2);
  await expect(service.retry(context("a"),old,"another-pending-retry")).rejects.toThrow();
 }finally{await opened.client.close();}
},120000);

it("纯空组通过正式创作能力 transport，账号筛选不充当 owner，其他组拒绝",async()=>{
 const opened=await createDb();await seedOwnedParents(opened.db);const at="2026-10-05T00:00:00.000Z";
 try{await opened.db.insert(accountGroups).values({id:"creative-empty-group",userId:"u-1029",name:"真实空组",status:"active",version:1,createdAt:at,updatedAt:at});
 const unused=async():Promise<never>=>{throw new Error("本请求未选择父项");};const service=createCreativeResultsService(opened.db,{projects:{getOutput:unused,getProject:unused},adapters:{},now:()=>at});const transport=createCreativeResultsTransport(()=>service),ctx:RequestContext={userId:"u-1029",groupId:"creative-empty-group",accountId:null,source:"user",requestId:"empty-group-capabilities"};
 const request=async(c:RequestContext,query:unknown)=>ENDPOINTS.listCreativeCapabilities.response.parse((await transport.request(ENDPOINTS.listCreativeCapabilities,{params:undefined,body:undefined,query:ENDPOINTS.listCreativeCapabilities.query.parse(query)},c) as {data:unknown}).data);
 expect((await request(ctx,{})).items.length).toBeGreaterThan(0);expect((await request({...ctx,accountId:"platform-filter"},{accountId:"platform-filter"})).items).toEqual((await request(ctx,{})).items);
 await expect(request({...ctx,groupId:"foreign-group"},{})).rejects.toThrow();
 }finally{await opened.client.close();}
});


it.each(["supported","known_unavailable","unknown","missing","owner_rejected"] as const)("T1420 组图丢回执与恢复能力%s仍保留原键和成功页",async recoveryAbility=>{
 const opened=await createDb();await seedOwnedParents(opened.db);let seq=0;
 const calls:Array<{page:string;key:string}>=[];
 let ability: "supported"|"known_unavailable"|"unknown" = "supported";
 let ownerRejected=false;
 const adapter:CreativeResultAdapter={owner:"graphic_post",probe:async()=>({state:ability,reasonCode:null,lastVerifiedAt:null}),
  enqueue:async(_ctx,input)=>{
   const page=input.targetSectionId!;calls.push({page,key:input.clientRequestId});
   if(ownerRejected)throw Object.assign(Error("current source temporarily rejected"),{code:"SOURCE_VERSION_CONFLICT"});
   if(page==="page-a"&&calls.filter(call=>call.page===page).length===1)throw Error("owner submitted, ack lost");
   return {candidateId:`original-${page}`,taskId:`task-${page}`,baseVersionId:"v1",ruleSnapshotRef:null,appliedRules:"not_applied",sourceRefs:[],status:"succeeded"};
  },
  read:async()=>({status:"succeeded",value:null,errorCode:null}),adopt:async()=>({versionId:"v2"})};
 const adapters:{graphic_post?:CreativeResultAdapter}={graphic_post:adapter};
 const service=createCreativeResultsService(opened.db,{projects:{getOutput:async()=>output as never,getProject:async()=>({id:output.projectId}) as never},adapters,nextId:()=>`t1420-result-${++seq}`});
 const transport=createCreativeResultsTransport(()=>service);
 const request={params:{outputId:output.id},query:undefined,body:{items:[{kind:"image_card" as const,targetSectionId:"page-a"},{kind:"image_card" as const,targetSectionId:"page-b"}],clientRequestId:"t1420-original-page-bundle"}};
 try{
  await expect(transport.request(ENDPOINTS.createBundle,request,context("a"))).rejects.toThrow("owner submitted, ack lost");
  const before=await service.list(context("a"),{outputId:output.id});
  expect(before.items).toHaveLength(2);
  const pending=before.items.find(item=>item.targetSectionId==="page-a")!;
  expect(pending).toMatchObject({status:"queued",taskId:null,errorCode:"GENERATION_SUBMISSION_UNKNOWN"});
  expect(before.items.find(item=>item.targetSectionId==="page-b")).toMatchObject({status:"succeeded",taskId:"task-page-b"});
  if(recoveryAbility!=="supported"){
   if(recoveryAbility==="missing")delete adapters.graphic_post;
   else if(recoveryAbility==="owner_rejected")ownerRejected=true;
   else ability=recoveryAbility;
   await expect(transport.request(ENDPOINTS.createBundle,request,context("a"))).rejects.toMatchObject({code:ownerRejected?"SOURCE_VERSION_CONFLICT":"CAPABILITY_UNAVAILABLE"});
   expect(await service.get(context("a"),pending.resultId)).toMatchObject({status:"queued",taskId:null,errorCode:"GENERATION_SUBMISSION_UNKNOWN"});
   expect(calls).toHaveLength(ownerRejected?3:2);
   ability="supported";adapters.graphic_post=adapter;ownerRejected=false;
  }
  const recovered=ENDPOINTS.createBundle.response.parse((await transport.request(ENDPOINTS.createBundle,request,context("a")) as {data:unknown}).data);
  expect(recovered.items.find(item=>item.targetSectionId==="page-a")).toMatchObject({resultId:pending.resultId,status:"succeeded",errorCode:null});
  expect(await service.get(context("a"),pending.resultId)).toMatchObject({taskId:"task-page-a",typedCandidateRef:{id:"original-page-a"}});
  expect(calls).toEqual([{page:"page-a",key:"t1420-original-page-bundle:0"},{page:"page-b",key:"t1420-original-page-bundle:1"},
   ...(recoveryAbility==="owner_rejected"?[{page:"page-a",key:"t1420-original-page-bundle:0"}]:[]),{page:"page-a",key:"t1420-original-page-bundle:0"}]);
  const callCount=calls.length;await transport.request(ENDPOINTS.createBundle,request,context("a"));expect(calls).toHaveLength(callCount);
 }finally{await opened.client.close();}
},120000);

it("T1420 并发迟到的能力拒绝不能覆盖另一次原请求的未知提交", async()=>{
 const opened=await createDb();await seedOwnedParents(opened.db);let seq=0,probes=0,enqueues=0;
 let entered!:()=>void,release!:()=>void;
 const started=new Promise<void>(resolve=>{entered=resolve;});
 const gate=new Promise<void>(resolve=>{release=resolve;});
 const adapter:CreativeResultAdapter={owner:"graphic_post",
  probe:async()=>{if(++probes===1){entered();await gate;return {state:"known_unavailable",reasonCode:"TEMPORARY",lastVerifiedAt:null};}return {state:"supported",reasonCode:null,lastVerifiedAt:null};},
  enqueue:async()=>{if(++enqueues===1)throw Error("owner accepted, ack lost");return {candidateId:"original-page",taskId:"original-task",baseVersionId:"v1",ruleSnapshotRef:null,appliedRules:"not_applied",sourceRefs:[],status:"succeeded"};},
  read:async()=>({status:"succeeded",value:null,errorCode:null}),adopt:async()=>({versionId:"v2"})};
 const service=createCreativeResultsService(opened.db,{projects:{getOutput:async()=>output as never,getProject:async()=>({id:output.projectId}) as never},adapters:{graphic_post:adapter},nextId:()=>`t1420-concurrent-${++seq}`});
 const transport=createCreativeResultsTransport(()=>service);
 const request={params:{outputId:output.id},query:undefined,body:{items:[{kind:"image_card" as const,targetSectionId:"page-a"}],clientRequestId:"t1420-concurrent-original"}};
 try{
  const late=transport.request(ENDPOINTS.createBundle,request,context("a"));
  const lateRejected=expect(late).rejects.toMatchObject({code:"CAPABILITY_UNAVAILABLE"});
  await started;
  await expect(transport.request(ENDPOINTS.createBundle,request,context("a"))).rejects.toThrow("owner accepted, ack lost");
  release();await lateRejected;
  const pending=(await service.list(context("a"),{outputId:output.id})).items[0]!;
  expect(pending).toMatchObject({status:"queued",errorCode:"GENERATION_SUBMISSION_UNKNOWN"});
  await transport.request(ENDPOINTS.createBundle,request,context("a"));
  expect(await service.get(context("a"),pending.resultId)).toMatchObject({taskId:"original-task",status:"succeeded"});
  expect(enqueues).toBe(2);
 }finally{release();await opened.client.close();}
},120000);
