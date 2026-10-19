import {expect,it} from "vitest";
import {createDb,publications,publicationRevisions,eq} from "@creatoros/backend";
import type {RequestContext} from "@creatoros/contract";
import {createProjectRepository,createProjectsService} from "../projects";
import {createPublicationResultsService} from "./publication-results.service";

it("小红书发布标题和简介分别生成候选；首版唯一、已有修订 CAS、跨账号与幂等",async()=>{
  const opened=await createDb();
  try{
    let seq=0;
    const nextId=(prefix:string)=>`${prefix}-${++seq}`;
    const now=()=>"2026-10-01T00:00:00.000Z";
    const projects=createProjectsService(createProjectRepository(opened.db),{now,nextId});
    const ctx=(accountId:string):RequestContext=>({userId:"pub-user",accountId,requestId:"test",source:"user"});
    const project=await projects.createProject(ctx("a"),{title:"营销项目",brief:"介绍新产品"});
    const output=await projects.createOutput(ctx("a"),project.id,{title:"小红书图文",contentType:"image",targetPlatform:"xiaohongshu"});
    const tasks=new Map<string,{taskType:string;status:string;inputData:Record<string,unknown>;
      results:Array<{resultType:string;resultData:Record<string,unknown>}>}>();
    const service=createPublicationResultsService(opened.db,{projects,now,nextId,
      submitGeneration:async(_ctx,input)=>{
        const id=nextId("task");
        const k=input.inputData.kind;
        tasks.set(id,{taskType:"publication.text",status:"awaiting_confirmation",inputData:input.inputData,
          results:[{resultType:"publication_text_candidate",resultData:{kind:k,value:k==="publish_title"?"生成标题":"生成简介"}}]});
        return {id};
      },
      readGeneration:async(_ctx,id)=>{const task=tasks.get(id);if(!task)throw new Error("missing task");return task;},
    });
    const title=await service.generate(ctx("a"),{outputId:output.id,platform:"xiaohongshu",kind:"publish_title",
      clientRequestId:"publication-generate-title"});
    expect(title.status).toBe("succeeded");
    await expect(service.candidate(ctx("b"),title.candidateId)).rejects.toThrow();
    await service.verifyFrozenGenerationInput(ctx("a"),project.id,tasks.get(title.taskId)!.inputData);
    const first=await service.adopt(ctx("a"),{candidateId:title.candidateId,kind:"publish_title",editedValue:"人工标题",
      clientRequestId:"publication-adopt-title",expected:{mode:"create",outputId:output.id,platform:"xiaohongshu",expectedAbsent:true}});
    expect((await opened.db.select().from(publicationRevisions).where(eq(publicationRevisions.id,first.revisionId)))[0])
      .toMatchObject({title:"人工标题",description:""});
    expect((await service.adopt(ctx("a"),{candidateId:title.candidateId,kind:"publish_title",editedValue:"人工标题",
      clientRequestId:"publication-adopt-title",expected:{mode:"create",outputId:output.id,platform:"xiaohongshu",expectedAbsent:true}})).revisionId)
      .toBe(first.revisionId);
    await expect(service.adopt(ctx("a"),{candidateId:title.candidateId,kind:"publish_title",editedValue:"另一标题",
      clientRequestId:"publication-adopt-title",expected:{mode:"create",outputId:output.id,platform:"xiaohongshu",expectedAbsent:true}}))
      .rejects.toMatchObject({code:"IDEMPOTENCY_CONFLICT"});
    const description=await service.generate(ctx("a"),{outputId:output.id,platform:"xiaohongshu",kind:"description",
      clientRequestId:"publication-generate-description"});
    const second=await service.adopt(ctx("a"),{candidateId:description.candidateId,kind:"description",editedValue:"人工简介",
      clientRequestId:"publication-adopt-description",expected:{mode:"existing",publicationId:first.publicationId,revisionId:first.revisionId}});
    expect((await opened.db.select().from(publicationRevisions).where(eq(publicationRevisions.id,second.revisionId)))[0])
      .toMatchObject({title:"人工标题",description:"人工简介",revisionNumber:2});
    expect((await opened.db.select().from(publications).where(eq(publications.id,first.publicationId)))[0]?.currentRevisionId)
      .toBe(second.revisionId);
    await expect(service.adopt(ctx("a"),{candidateId:description.candidateId,kind:"description",editedValue:"并发旧版",
      clientRequestId:"publication-adopt-stale",expected:{mode:"existing",publicationId:first.publicationId,revisionId:first.revisionId}}))
      .rejects.toMatchObject({code:"VERSION_CONFLICT"});
    await expect(service.adopt(ctx("b"),{candidateId:description.candidateId,kind:"description",editedValue:"跨账号",
      clientRequestId:"publication-adopt-cross",expected:{mode:"existing",publicationId:first.publicationId,revisionId:first.revisionId}}))
      .rejects.toThrow();
  }finally{await opened.client.close();}
});

it("发布封面把已确认图片的精确文件版本写入独立修订，旧版与跨号拒绝",async()=>{
  const opened=await createDb();
  try{
    let seq=0;const nextId=(prefix:string)=>`${prefix}-${++seq}`;
    const now=()=>"2026-10-01T00:00:00.000Z";
    const projects=createProjectsService(createProjectRepository(opened.db),{now,nextId});
    const ctx=(accountId:string):RequestContext=>({userId:"cover-user",accountId,requestId:"test",source:"user"});
    const project=await projects.createProject(ctx("a"),{title:"视频营销",brief:"产品展示"});
    const output=await projects.createOutput(ctx("a"),project.id,{title:"快手视频",contentType:"video",targetPlatform:"kuaishou"});
    const checked:string[]=[];
    const service=createPublicationResultsService(opened.db,{projects,now,nextId,
      submitGeneration:async()=>{throw new Error("unused");},readGeneration:async()=>{throw new Error("unused");},
      assertCoverAssetFile:async(c,assetId,fileId)=>{if(c.accountId!=="a"||assetId!=="asset-1"||fileId!=="file-1")
        throw new Error("asset unavailable");checked.push(`${assetId}/${fileId}`);},
    });
    const base=await service.readCoverBase(ctx("a"),output.id,"kuaishou");
    expect(base).toMatchObject({publicationId:null,baseRevisionId:null,outputType:"video"});
    const first=await service.adoptCover(ctx("a"),{candidateId:"task-1",outputId:output.id,platform:"kuaishou",
      assetId:"asset-1",assetFileId:"file-1",clientRequestId:"cover-adopt-1",
      expected:{mode:"create",outputId:output.id,platform:"kuaishou",expectedAbsent:true}});
    const revision=(await opened.db.select().from(publicationRevisions).where(eq(publicationRevisions.id,first.revisionId)))[0];
    expect(revision).toMatchObject({coverAssetId:"asset-1",coverAssetFileId:"file-1",revisionNumber:1});
    expect(checked).toEqual(["asset-1/file-1"]);
    await expect(service.adoptCover(ctx("a"),{candidateId:"task-2",outputId:output.id,platform:"kuaishou",
      assetId:"asset-1",assetFileId:"file-1",clientRequestId:"cover-adopt-stale",
      expected:{mode:"create",outputId:output.id,platform:"kuaishou",expectedAbsent:true}}))
      .rejects.toMatchObject({code:"VERSION_CONFLICT"});
    await expect(service.adoptCover(ctx("b"),{candidateId:"task-3",outputId:output.id,platform:"kuaishou",
      assetId:"asset-1",assetFileId:"file-1",clientRequestId:"cover-adopt-cross",
      expected:{mode:"existing",publicationId:first.publicationId,revisionId:first.revisionId}}))
      .rejects.toThrow();
  }finally{await opened.client.close();}
});
