import {expect,it,vi} from "vitest";
import type {RequestContext} from "@creatoros/contract";
import {createPublicationCoverCreativeResultAdapter,type PublicationCoverPorts} from "./publication-cover.creative-adapter";

const ctx={userId:"u",accountId:"a",requestId:"r",source:"user"} as RequestContext;
const snapshot={positioningBrief:"定位",projectBriefHard:"项目",reviewScript:"正文",userMaterialHardBrief:"",
  userMaterialRefBrief:"",knowledgeBrief:"",orientationHint:"竖屏",topic:{title:"作品",angle:""}};
function fixture(currentRevisionId:string|null,status="awaiting_confirmation"){
  const rows:unknown[][]=[];
  const db={select:()=>({from:()=>({where:async()=>rows.shift()??[]})}),
    insert:()=>({values:()=>({onConflictDoNothing:async()=>undefined})})};
  const readCoverBase=vi.fn(async()=>({projectId:"p",outputId:"o",platform:"kuaishou",outputType:"video",outputTitle:"作品",
    publicationId:currentRevisionId?"pub":null,baseRevisionId:currentRevisionId,current:{title:"",description:""}}));
  const adoptCover=vi.fn(async()=>({publicationId:"pub",revisionId:"rev-new"}));
  const confirmTask=vi.fn(async()=>undefined);
  const task={id:"task",taskType:"cover.generate",status,projectId:"p",contentOutputId:"o",
    inputData:{projectId:"p",outputId:"o",contentOutputId:"o",kind:"publish_cover",targetPlatform:"kuaishou",
      publicationId:"pub",baseRevisionId:"rev-old",coverContextSnapshot:snapshot,scriptSnapshot:{fullText:"正文"}}};
  const binding={id:"binding",userId:"u",accountId:"a",projectId:"p",outputId:"o",kind:"publish_cover",
    taskId:"task",assetId:"asset",assetFileId:"file",clientRequestId:"request"};
  const rawPorts={db,owner:{readCoverBase,verifyCoverBinding:vi.fn(async()=>undefined),adoptCover},
    assets:{getAsset:vi.fn(async()=>({status:"pending",currentFileId:"file"})),
      assertAssetFileOwned:vi.fn(async()=>undefined),getAssetFileDownloadUrl:vi.fn(async()=>({url:"signed"}))},
    readTask:vi.fn(async(_c:RequestContext,id:string)=>id==="task-new"?{...task,id,status:"queued"}:task),
    listResults:vi.fn(async()=>[{resultType:"generated_asset",assetId:"asset",
      resultData:{assetId:"asset",assetType:"image"}}]),confirmTask,
    resolveCoverSource:vi.fn(),freezeCoverContext:vi.fn(),submitCover:vi.fn(async()=>({id:"task-new"})),probeCover:vi.fn()};
  const ports=rawPorts as unknown as PublicationCoverPorts;
  return {adapter:createPublicationCoverCreativeResultAdapter(ports),rows,binding,readCoverBase,adoptCover,confirmTask,ports};
}

it("发布封面无账号任务绑定即拒绝读取",async()=>{
  const f=fixture("rev-old");f.rows.push([]);
  await expect(f.adapter.read(ctx,"task")).rejects.toMatchObject({code:"MEDIA_CANDIDATE_NOT_FOUND"});
  expect(f.ports.readTask).not.toHaveBeenCalled();
});

it("失败发布封面只复制旧冻结输入重试，不重读实时正文",async()=>{
  const f=fixture("rev-old","failed");
  f.rows.push([f.binding],[],[{...f.binding,id:"new-binding",taskId:"task-new",assetId:null,assetFileId:null}]);
  const retry=await f.adapter.retryFrozen!(ctx,{candidateId:"task",clientRequestId:"retry-cover"});
  expect(retry.taskId).toBe("task-new");
  expect(f.ports.submitCover).toHaveBeenCalledWith(ctx,expect.objectContaining({
    projectId:"p",inputData:expect.objectContaining({coverContextSnapshot:snapshot,baseRevisionId:"rev-old"})}));
  expect(f.ports.resolveCoverSource).not.toHaveBeenCalled();
  expect(f.ports.freezeCoverContext).not.toHaveBeenCalled();
});

it("跨账号不能重试另一账号的发布封面",async()=>{
  const f=fixture("rev-old","failed");f.rows.push([]);
  await expect(f.adapter.retryFrozen!({...ctx,accountId:"other"},
    {candidateId:"task",clientRequestId:"cross-retry"})).rejects.toMatchObject({code:"MEDIA_CANDIDATE_NOT_FOUND"});
  expect(f.ports.submitCover).not.toHaveBeenCalled();
});

it("发布修订已变化时先拒绝采纳，不确认候选 Asset",async()=>{
  const f=fixture("rev-new");f.rows.push([f.binding]);
  await expect(f.adapter.adopt(ctx,{candidateId:"task",kind:"publish_cover",
    expected:{owner:"publication",mode:"existing",publicationId:"pub",revisionId:"rev-old"},
    editedValue:[{assetId:"asset",assetFileId:"file",order:0,role:"cover"}],clientRequestId:"adopt"}))
    .rejects.toMatchObject({code:"VERSION_CONFLICT"});
  expect(f.confirmTask).not.toHaveBeenCalled();
  expect(f.adoptCover).not.toHaveBeenCalled();
});

it("真实图片候选经确认后交给 Publishing owner CAS 写精确文件",async()=>{
  const f=fixture("rev-old");f.rows.push([f.binding]);
  const result=await f.adapter.adopt(ctx,{candidateId:"task",kind:"publish_cover",
    expected:{owner:"publication",mode:"existing",publicationId:"pub",revisionId:"rev-old"},
    editedValue:[{assetId:"asset",assetFileId:"file",order:0,role:"cover"}],clientRequestId:"adopt"});
  expect(result).toEqual({publicationId:"pub",revisionId:"rev-new"});
  expect(f.confirmTask).toHaveBeenCalledWith(ctx,"task");
  expect(f.adoptCover).toHaveBeenCalledWith(ctx,expect.objectContaining({assetId:"asset",assetFileId:"file",
    expected:{mode:"existing",publicationId:"pub",revisionId:"rev-old"}}));
});
