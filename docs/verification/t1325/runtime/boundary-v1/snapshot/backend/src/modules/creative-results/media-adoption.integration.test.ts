import {describe,expect,it,vi} from "vitest";
// 新增真实隔离Db迁移与父锁IO需容纳初始化；不改产品请求deadline/取消或任何业务断言。
vi.setConfig({testTimeout:120_000});
import {accountGroups} from "../../schema/account-groups";
import {createDb,type Db} from "@creatoros/backend";
import type {RequestContext} from "@creatoros/contract";
import {createProjectRepository,createProjectsService} from "../projects";
import {createArtifactsService} from "../artifacts";
import {createGraphicPostsService} from "../graphic-posts";
import {createArticlesService} from "../articles";
import {aiTasks} from "../../schema/ai";
import {projects as projectRows} from "../../schema/projects";
import {sql,eq} from "drizzle-orm";
import {createCreativeResultsService} from "./creative-results.service";
import {creativeResults,outputMediaAttempts} from "../../schema/creative-results";
import {createGraphicPostMediaAdapter,type GraphicPostMediaPorts} from "./graphic-post-media.adapter";
import {createArticleCoverMediaAdapter,type ArticleCoverMediaPorts} from "./article-cover-media.adapter";

const ctx:RequestContext={userId:"u-media",accountId:"a-media",requestId:"r-media",source:"user"};
const now=()=>"2026-10-01T01:00:00.000Z";
const snapshot={positioningBrief:"",projectBriefHard:"",reviewScript:"冻结正文",userMaterialHardBrief:"",userMaterialRefBrief:"",knowledgeBrief:"",orientationHint:"",topic:{title:"主题",angle:""}};

for(const kind of ["graphic","article"] as const) describe(`${kind} 媒体到正式稿公共服务集成`,()=>{
  it.each([false,true])("纯组=%s：顺序合并、正式回执重放与确认后并发冲突均保留新稿",async pureGroup=>{
    const ctx:RequestContext={userId:"u-media",accountId:pureGroup?null:"a-media",...(pureGroup?{groupId:"media-group-a"}:{}),requestId:"r-media",source:"user"};
    const opened=await createDb(); let seq=0,confirmed=0,injectRace=false,archiveDuringFreeze=false,newSubmissions=0,probeCalls=0;
    const deps={now,nextId:(prefix:string)=>`${prefix}-${++seq}`};
    const projects=(db:Db)=>createProjectsService(createProjectRepository(db),deps);
    const artifacts=(db:Db)=>createArtifactsService({db,...deps,
      assertProjectOwned:(c,id)=>projects(db).getProject(c,id),resolveOutputProjectId:(c,id)=>projects(db).getProjectIdByOutput(c,id)});
    const assertAssetFile=async(c:RequestContext,asset:string,file:string)=>{
      if(c.accountId!==ctx.accountId||asset!=="generated-image"||file!=="generated-file")throw new Error("asset not owned");
    };
    const graphic=createGraphicPostsService(opened.db,{...deps,projects,artifacts,assertAssetFile});
    const article=createArticlesService(opened.db,{...deps,projects,artifacts,assertAssetFile,
      resolveDocumentSource:async()=>null,resolveSelectedBrand:async()=>null,
      submitGeneration:async()=>{throw new Error("not used");},readGeneration:async()=>{throw new Error("not used");}});
    try {
      if(pureGroup)await opened.db.insert(accountGroups).values({id:ctx.groupId!,userId:ctx.userId,name:"无平台空组",status:"active",version:1,createdAt:now(),updatedAt:now()});
      const project=await projects(opened.db).createProject(ctx,{title:"媒体集成项目"});
      const output=kind==="graphic"?await graphic.createOutput(ctx,project.id,{title:"图文",targetPlatform:"xiaohongshu",clientRequestId:"media-output-request"}):
        await article.createOutput(ctx,project.id,{title:"文章",clientRequestId:"media-output-request"});
      const get=()=>kind==="graphic"?graphic.getGraphicPost(ctx,output.id):article.getArticle(ctx,output.id);
      const save=async(expected:string,document:unknown,key:string)=>kind==="graphic"?
        graphic.createVersion(ctx,output.id,{expectedCurrentVersionId:expected,document:document as never,clientRequestId:key}):
        article.createVersion(ctx,output.id,{expectedCurrentVersionId:expected,document:document as never,clientRequestId:key});
      const initial=await get();
      const prepared=await save(initial.currentVersionId,{...initial.current,title:"确定的标题",summary:"摘要",
        ...(kind==="graphic"?{body:"确定的正文"}:{sections:[{sectionId:"section-one",order:0,heading:"第一段",body:"确定的正文",sourceRefs:[]}]})},"prepare-document");
      const base=await get();
      const task:{id:string;taskType:string;status:string;projectId:string;contentOutputId:string;inputData:Record<string,unknown>}={id:"media-task",taskType:"cover.generate",status:"awaiting_confirmation",projectId:project.id,contentOutputId:output.id,
        inputData:{projectId:project.id,outputId:output.id,contentOutputId:output.id,artifactId:base.artifactId,
          baseVersionId:prepared.versionId,kind:"cover",coverContextSnapshot:snapshot}};
      if(pureGroup)await opened.db.insert(aiTasks).values({id:task.id,userId:ctx.userId,accountId:null,groupId:ctx.groupId,groupVersion:1,membershipVersion:null,projectId:project.id,contentOutputId:output.id,taskType:task.taskType,status:task.status,inputData:task.inputData,idempotencyKey:"original-public-fixture",requestedAt:now()});
      await opened.db.insert(outputMediaAttempts).values({id:"media-binding",userId:ctx.userId,accountId:ctx.accountId,groupId:ctx.groupId??null,projectId:project.id,
        outputId:output.id,kind:"cover",taskId:task.id,candidateId:task.id,clientRequestId:"bound-request",requestDigest:"fixture",createdAt:now()});
      const advanced=await save(prepared.versionId,{...base.current,...(kind==="graphic"?{tags:["已采纳标签"]}:{factItems:[{id:"fact-1",text:"已审读事实",sourceRefs:[],reviewState:"needs_confirmation"}]})},"independent-result");
      const publicTasks=new Map<string,typeof task>();
      const ports={db:opened.db,graphicPosts:graphic,articles:article,projects:projects(opened.db),
        assets:{getAsset:async()=>({status:task.status==="succeeded"?"active":"pending",currentFileId:"generated-file"}),
          assertAssetFileOwned:assertAssetFile,getAssetFileDownloadUrl:async()=>({url:"fixture-url",fileName:"image.png"})},
        readTask:async(_c:RequestContext,id:string)=>publicTasks.get(id)??task,listResults:async()=>[{resultType:"generated_asset",assetId:"generated-image",resultData:{assetId:"generated-image",assetType:"image"}}],
        confirmTask:async()=>{confirmed++;task.status="succeeded";if(injectRace){const current=await get();await save(current.currentVersionId,{...current.current,title:"并发新标题"},"concurrent-edit");}},
        submitCover:async(_c:RequestContext,_input:{attemptId:string;projectId:string;inputData:Record<string,unknown>}):Promise<{id:string;status:string}>=>{throw new Error("not used");},submitCard:async()=>{throw new Error("not used");},
        probeCover:async()=>{probeCalls++;return {ready:false,reasonCode:"MODEL_NOT_CONFIGURED"};},probeCard:async()=>{probeCalls++;return {ready:false,reasonCode:"MODEL_NOT_CONFIGURED"};},freezeCoverContext:async()=>{if(archiveDuringFreeze)await opened.db.update(projectRows).set({archivedAt:now(),status:"archived"}).where(eq(projectRows.id,project.id));return snapshot;}};
      const adapter=kind==="graphic"?createGraphicPostMediaAdapter(ports as unknown as GraphicPostMediaPorts):
        createArticleCoverMediaAdapter(ports as unknown as ArticleCoverMediaPorts);
      const input={candidateId:task.id,kind:"cover" as const,expected:{owner:kind==="graphic"?"graphic_post":"wechat_article",versionId:advanced.versionId},
        editedValue:[{assetId:"generated-image",assetFileId:"generated-file",order:0,role:"cover" as const}],clientRequestId:"save-generated-cover"};
      // owner 与投影是原有两个事务：真实owner已提交后投影失败，原key恢复不新增owner版本。
      const resultService=createCreativeResultsService(opened.db,{projects:projects(opened.db),adapters:{[adapter.owner]:adapter},now});
      await opened.db.insert(creativeResults).values({id:"projection-recovery",userId:ctx.userId,accountId:ctx.accountId,groupId:ctx.groupId??null,projectId:project.id,outputId:output.id,outputType:kind==="graphic"?"image":"article",targetPlatform:kind==="graphic"?"xiaohongshu":null,kind:"cover",owner:adapter.owner,candidateId:task.id,taskId:task.id,baseVersionId:advanced.versionId,clientRequestId:"projection-recovery-request",requestDigest:"fixture",status:"awaiting_confirmation",createdAt:now(),updatedAt:now()});
      const projectionInput={resultId:"projection-recovery",expected:input.expected,editedValue:input.editedValue,clientRequestId:input.clientRequestId};
      const beforeProjection=(await get()).versions.length;
      await opened.db.execute(sql`CREATE FUNCTION t1062_projection_failure() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'projection test failure'; END $$`);
      await opened.db.execute(sql`CREATE TRIGGER t1062_projection_failure BEFORE UPDATE ON creative_results FOR EACH ROW EXECUTE FUNCTION t1062_projection_failure()`);
      await expect(resultService.adopt(ctx,projectionInput)).rejects.toThrow();
      expect((await get()).versions).toHaveLength(beforeProjection+1);expect(confirmed).toBe(1);
      expect((await opened.db.select().from(creativeResults).where(eq(creativeResults.id,"projection-recovery")))[0]!.adoptionReceipt).toBeNull();
      await opened.db.execute(sql`DROP TRIGGER t1062_projection_failure ON creative_results`);
      await opened.db.execute(sql`DROP FUNCTION t1062_projection_failure()`);
      const recovered=await resultService.adopt(ctx,projectionInput);
      expect(recovered).toMatchObject({status:"adopted",resultId:"projection-recovery"});
      expect((await get()).versions).toHaveLength(beforeProjection+1);expect(confirmed).toBe(1);
      expect((await resultService.list(ctx,{outputId:output.id})).items.find(row=>row.resultId==="projection-recovery")?.status).toBe("adopted");
      expect(await resultService.adopt(ctx,projectionInput)).toEqual(recovered);
      expect(probeCalls).toBe(0); // 真实媒体owner采纳/失败后原key恢复均不得重问生成readiness。
      const saved=await adapter.adopt(ctx,input);
      expect(confirmed).toBe(1);
      expect((await get()).current.title).toBe("确定的标题");
      const count=(await get()).versions.length;
      expect(await adapter.adopt(ctx,input)).toEqual(saved);
      expect((await get()).versions).toHaveLength(count);
      await expect(adapter.adopt(pureGroup?{...ctx,groupId:"foreign-group"}:{...ctx,accountId:"other-account"},input)).rejects.toThrow();
      const beforeRace=await get(); task.status="awaiting_confirmation";injectRace=true;
      const raceInput={...input,expected:{...input.expected,versionId:beforeRace.currentVersionId},clientRequestId:"confirm-then-cas-race"};
      await expect(adapter.adopt(ctx,raceInput)).rejects.toThrow();
      expect((await get()).current.title).toBe("并发新标题");
      const current=await get();
      await expect(adapter.adopt(ctx,{...raceInput,expected:{...input.expected,versionId:current.currentVersionId},clientRequestId:"confirmed-new-request"}))
        .rejects.toMatchObject({code:"VERSION_CONFLICT"});
      await expect(adapter.adopt(ctx,raceInput)).rejects.toThrow();
      expect((await get()).versions).toHaveLength(count+1);
      expect(confirmed).toBe(2);
      // 真实父在读稿/冻结语义上下文之后归档；公共新提交必须在同tx复验父，零供应商提交、零绑定。
      ports.submitCover=async(c:RequestContext,input:{attemptId:string;projectId:string;inputData:Record<string,unknown>})=>{newSubmissions++;const id=`public-media-${newSubmissions}`;const queued={...task,id,status:"queued",inputData:{...input.inputData}};publicTasks.set(id,queued);await opened.db.insert(aiTasks).values({id,userId:c.userId,accountId:c.accountId??null,groupId:c.groupId??null,groupVersion:c.groupVersion??null,membershipVersion:c.membershipVersion??null,taskType:"cover.generate",projectId:input.projectId,contentOutputId:output.id,inputData:input.inputData,status:"queued",idempotencyKey:input.attemptId,requestedAt:now()});return {id,status:"queued"};};
      const positive=await adapter.enqueue(pureGroup?{...ctx,accountId:"platform-filter-not-owner"}:ctx,{outputId:output.id,projectId:project.id,targetPlatform:kind==="graphic"?"xiaohongshu":null,kind:"cover",clientRequestId:"actual-new-media-freeze"});
      expect(positive.status).toBe("queued");expect(newSubmissions).toBe(1);
      const [frozenBinding]=await opened.db.select().from(outputMediaAttempts).where(eq(outputMediaAttempts.taskId,positive.taskId));
      const [frozenTask]=await opened.db.select().from(aiTasks).where(eq(aiTasks.id,positive.taskId));
      expect(frozenBinding).toMatchObject({accountId:pureGroup?null:ctx.accountId,groupId:ctx.groupId??null,groupVersion:pureGroup?1:null});
      expect(frozenTask).toMatchObject({accountId:pureGroup?null:ctx.accountId,groupId:ctx.groupId??null,groupVersion:pureGroup?1:null});
      newSubmissions=0;
      archiveDuringFreeze=true;
      ports.submitCover=async()=>{newSubmissions++;throw Error("unexpected paid submit");};
      await expect(adapter.enqueue(ctx,{outputId:output.id,projectId:project.id,targetPlatform:kind==="graphic"?"xiaohongshu":null,kind:"cover",clientRequestId:"archive-during-freeze"})).rejects.toThrow();
      expect(newSubmissions).toBe(0);
      expect((await opened.db.select().from(outputMediaAttempts)).filter(row=>row.clientRequestId==="archive-during-freeze")).toHaveLength(0);
    } finally {await opened.client.close();}
  });
});
