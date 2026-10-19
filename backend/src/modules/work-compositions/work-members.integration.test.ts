import {it,expect} from "vitest";
import {createDb,type Db} from "@creatoros/backend";
import {createProjectsService,createProjectRepository} from "../projects";
import {createArtifactsService} from "../artifacts";
import {createArticlesService} from "../articles";
import {createGraphicPostsService} from "../graphic-posts";
import {createMomentsService} from "../moments";
import {createOutputScriptsService} from "../output-scripts";
import {createProductionService} from "../production";
import {createWorkMemberPorts} from "./work-members";
import {createWorkCompositionsService} from "./work-compositions.service";
const ctx={userId:"member-owner-user",accountId:"member-owner-account",source:"user" as const,requestId:"request"};
const unavailable=async():Promise<never>=>{throw Error("本用例不调用模型或素材写入");};
it("四类成员通过原owner创建、读正式版本、刷新及只读原请求恢复",async()=>{
 const opened=await createDb();let seq=0;const deps={now:()=>"2026-10-02T06:00:00.000Z",nextId:(p:string)=>`${p}-${++seq}`},db=opened.db;
 try{
  const ownersFor=(tx:Db=db)=>{
   const projects=createProjectsService(createProjectRepository(tx),deps),artifacts=createArtifactsService({db:tx,...deps,assertProjectOwned:(c,id)=>projects.getProject(c,id),resolveOutputProjectId:(c,id)=>projects.getProjectIdByOutput(c,id)});
   const moments=createMomentsService({db:tx,...deps,ports:{artifacts:store=>createArtifactsService({db:store,...deps}),assertProjectOwned:async(c,id,store,lock)=>createProjectsService(createProjectRepository(store),deps).getProject(c,id,lock),assertFile:unavailable,assertSource:unavailable}});
   const projectsFor=(store:Db)=>createProjectsService(createProjectRepository(store),deps),artifactsFor=(store:Db)=>createArtifactsService({db:store,...deps});
   const articles=createArticlesService(tx,{...deps,projects:projectsFor,artifacts:artifactsFor,assertAssetFile:unavailable,resolveDocumentSource:unavailable,resolveSelectedBrand:unavailable,submitGeneration:unavailable,readGeneration:unavailable});
   const graphicPosts=createGraphicPostsService(tx,{...deps,projects:projectsFor,artifacts:artifactsFor,assertAssetFile:unavailable,submitTextGeneration:unavailable,readTextGeneration:unavailable});
   const outputScripts=createOutputScriptsService({projects,artifacts,submitScriptDraft:unavailable,readTask:unavailable});
   return{projects,articles,graphicPosts,moments,outputScripts,production:createProductionService({db:tx,...deps})};
  };
  const project=await ownersFor().projects.createProject(ctx,{title:"完整组合项目",brief:"统一来源"}),ports=createWorkMemberPorts(ownersFor);
  const service=()=>createWorkCompositionsService({db,...deps,ports:{...ports,artifacts:tx=>createArtifactsService({db:tx,...deps}),assertSource:unavailable,assertRule:unavailable}});
  let composition=await service().create(ctx,{projectId:project.id,title:"四类真实成员",clientRequestId:"member-all-composition"});
  const inputs=[{kind:"video",title:"视频",targetPlatform:null,contentRole:null},{kind:"article",title:"公众号",targetPlatform:null,contentRole:null},{kind:"image",title:"图文",targetPlatform:null},{kind:"moments",document:{schemaVersion:1,text:"朋友圈",imageUses:[],sourceRefs:[]}}];
  for(const [i,memberInput]of inputs.entries()){
   const key=`member-all-create-${i}`,body={expectedRevision:composition.currentRevision,clientRequestId:key,memberInput};composition=await service().createMember(ctx,composition.compositionId,body);
   const reservation=await service().memberReservation(ctx,composition.compositionId,key);expect(reservation.status).toBe("bound");expect(await ports.findCreatedMember(ctx,project.id,memberInput,reservation.ownerCreationKey)).toEqual(reservation.target);
   const replay=await service().createMember(ctx,composition.compositionId,body);expect(replay.currentRevision).toBe(composition.currentRevision);
  }
  const refreshed=await service().get(ctx,composition.compositionId);expect(refreshed.current.members).toHaveLength(4);expect(refreshed.memberCurrent.map(m=>m.availability)).toEqual(["available","available","available","available"]);expect(refreshed.memberCurrent[0]).toMatchObject({currentVersion:{kind:"not_saved"}});
  expect(await ownersFor().projects.listOutputIdsByProject(ctx,project.id)).toHaveLength(3);expect(await ownersFor().moments.list(ctx,project.id)).toHaveLength(1);
  await expect(service().get({...ctx,accountId:"other-account"},composition.compositionId)).rejects.toThrow();
 }finally{await opened.client.close();}
});
