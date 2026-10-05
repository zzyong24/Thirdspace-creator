import {describe,expect,it,vi} from "vitest";
import type {RequestContext} from "@creatoros/contract";
import {createVideoEditCandidatePreparer} from "./video-edit-candidate";
const ctx={userId:"user",accountId:"account",requestId:"request",source:"user"} as RequestContext;
function fixture(outputs:Array<{projectId:string;outputId:string;contentType:string}>,editorVersion?:number){
  const readProduction=vi.fn(async()=>({recordingConfig:{videoEditingPlan:{revision:1,editorVersion,renderProps:{
    meta:{title:"真实作品"},talkingHead:{file:"master",durationSec:20},scenes:[{id:"s",label:"正文",title:"正文",startSec:0,endSec:20,cards:[]}],broll:[]}}}}));
  const list=vi.fn(async(_ctx:RequestContext,input:{page:number})=>({rows:input.page===1?Array.from({length:100},(_,i)=>({entityType:"asset",entityId:`other-${i}`})):[{entityType:"asset",entityId:"chosen"}],total:101}));
  const getAsset=vi.fn(async()=>({id:"chosen"}));
  const prepare=createVideoEditCandidatePreparer({projectsService:{listOutputRefsByProjects:async()=>outputs},productionService:{readProduction},materialLinksService:{list},assetsService:{getAsset}} as never);
  return {prepare,readProduction,list,getAsset};
}
describe("T-1037 旧编导剪辑目标与素材分页",()=>{
  it("混合项目选择唯一视频，而不是第一条图文",async()=>{
    const f=fixture([{projectId:"project",outputId:"image",contentType:"image"},{projectId:"project",outputId:"video",contentType:"video"}]);
    const result=await f.prepare(ctx,{projectId:"project",instruction:"替换指定素材",replaceBroll:[{sceneIdx:0,assetId:"chosen"}]});
    expect(result.outputId).toBe("video");expect(f.readProduction).toHaveBeenCalledWith(ctx,"video");
    expect(f.list).toHaveBeenCalledTimes(2);expect(f.getAsset).toHaveBeenCalledWith(ctx,"chosen");
  });
  it("多视频未选目标，不读取或修改任意首条工程",async()=>{
    const f=fixture([{projectId:"project",outputId:"a",contentType:"video"},{projectId:"project",outputId:"b",contentType:"video"}]);
    await expect(f.prepare(ctx,{projectId:"project",instruction:"修改视频"})).rejects.toThrow("具体视频");expect(f.readProduction).not.toHaveBeenCalled();
  });
  it("新版工程不进入旧资产名批删或旧 decisions 回写",async()=>{
    const f=fixture([{projectId:"project",outputId:"video",contentType:"video"}],1);
    await expect(f.prepare(ctx,{projectId:"project",instruction:"删除素材",removeBrollAssetIds:["chosen"]})).rejects.toThrow("逐项");
    expect(f.getAsset).not.toHaveBeenCalled();
  });
});
