import {describe,expect,it} from "vitest";
import {createDb,type Db} from "@creatoros/backend";
import type {RequestContext} from "@creatoros/contract";
import {createProjectRepository,createProjectsService} from "../projects";
import {createArtifactsService} from "../artifacts";
import {createGraphicPostsService} from "../graphic-posts";
import {createArticlesService} from "../articles";
import {outputMediaAttempts} from "../../schema/creative-results";
import {createGraphicPostMediaAdapter,type GraphicPostMediaPorts} from "./graphic-post-media.adapter";
import {createArticleCoverMediaAdapter,type ArticleCoverMediaPorts} from "./article-cover-media.adapter";

const ctx:RequestContext={userId:"u-media",accountId:"a-media",requestId:"r-media",source:"user"};
const now=()=>"2026-10-01T01:00:00.000Z";
const snapshot={positioningBrief:"",projectBriefHard:"",reviewScript:"冻结正文",userMaterialHardBrief:"",userMaterialRefBrief:"",knowledgeBrief:"",orientationHint:"",topic:{title:"主题",angle:""}};

for(const kind of ["graphic","article"] as const) describe(`${kind} 媒体到正式稿公共服务集成`,()=>{
  it("顺序合并、正式回执重放与确认后并发冲突均保留新稿",async()=>{
    const opened=await createDb(); let seq=0,confirmed=0,injectRace=false;
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
      const task={id:"media-task",taskType:"cover.generate",status:"awaiting_confirmation",projectId:project.id,contentOutputId:output.id,
        inputData:{projectId:project.id,outputId:output.id,contentOutputId:output.id,artifactId:base.artifactId,
          baseVersionId:prepared.versionId,kind:"cover",coverContextSnapshot:snapshot}};
      await opened.db.insert(outputMediaAttempts).values({id:"media-binding",userId:ctx.userId,accountId:ctx.accountId!,projectId:project.id,
        outputId:output.id,kind:"cover",taskId:task.id,candidateId:task.id,clientRequestId:"bound-request",requestDigest:"fixture",createdAt:now()});
      const advanced=await save(prepared.versionId,{...base.current,...(kind==="graphic"?{tags:["已采纳标签"]}:{factItems:[{id:"fact-1",text:"已审读事实",sourceRefs:[],reviewState:"needs_confirmation"}]})},"independent-result");
      const ports={db:opened.db,graphicPosts:graphic,articles:article,projects:projects(opened.db),
        assets:{getAsset:async()=>({status:task.status==="succeeded"?"active":"pending",currentFileId:"generated-file"}),
          assertAssetFileOwned:assertAssetFile,getAssetFileDownloadUrl:async()=>({url:"fixture-url",fileName:"image.png"})},
        readTask:async()=>task,listResults:async()=>[{resultType:"generated_asset",assetId:"generated-image",resultData:{assetId:"generated-image",assetType:"image"}}],
        confirmTask:async()=>{confirmed++;task.status="succeeded";if(injectRace){const current=await get();await save(current.currentVersionId,{...current.current,title:"并发新标题"},"concurrent-edit");}},
        submitCover:async()=>{throw new Error("not used");},submitCard:async()=>{throw new Error("not used");},
        probeCover:async()=>({ready:true}),probeCard:async()=>({ready:true}),freezeCoverContext:async()=>snapshot};
      const adapter=kind==="graphic"?createGraphicPostMediaAdapter(ports as unknown as GraphicPostMediaPorts):
        createArticleCoverMediaAdapter(ports as unknown as ArticleCoverMediaPorts);
      const input={candidateId:task.id,kind:"cover" as const,expected:{owner:kind==="graphic"?"graphic_post":"wechat_article",versionId:advanced.versionId},
        editedValue:[{assetId:"generated-image",assetFileId:"generated-file",order:0,role:"cover" as const}],clientRequestId:"save-generated-cover"};
      const saved=await adapter.adopt(ctx,input);
      expect(confirmed).toBe(1);
      expect((await get()).current.title).toBe("确定的标题");
      const count=(await get()).versions.length;
      expect(await adapter.adopt(ctx,input)).toEqual(saved);
      expect((await get()).versions).toHaveLength(count);
      await expect(adapter.adopt({...ctx,accountId:"other-account"},input)).rejects.toThrow();
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
    } finally {await opened.client.close();}
  });
});
