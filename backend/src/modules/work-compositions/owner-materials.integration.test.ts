import {articleSection} from '@creatoros/contract';
import {it,expect} from "vitest";
import {createDb,assets,assetFiles,type Db} from "@creatoros/backend";
import {type RequestContext,type WorkMemberRef,type WorkMaterialTarget} from "@creatoros/contract";
import {createProjectsService,createProjectRepository} from "../projects";
import {createArtifactsService} from "../artifacts";
import {createAssetsService,createAssetRepository} from "../assets";
import {createArticlesService} from "../articles";
import {createGraphicPostsService} from "../graphic-posts";
import {createWorkCompositionsService} from "./work-compositions.service";
import {createWorkMaterialsService} from "./work-materials.service";
import {createArticleMaterialPorts} from "./article-materials";
import {createGraphicMaterialPorts} from "./graphic-materials";
const ctx:RequestContext={userId:"material-owner-user",accountId:"material-owner-account",source:"user",requestId:"http"};
const unavailable=async():Promise<never>=>{throw Error("本用例不调用模型");};
async function fixture(kind:"article"|"image"){
 const opened=await createDb(),db=opened.db;let seq=0;const deps={now:()=>"2026-10-02T07:00:00.000Z",nextId:(p:string)=>`${p}-${++seq}`};
 const projects=(tx:Db=db)=>createProjectsService(createProjectRepository(tx),deps),artifacts=(tx:Db)=>createArtifactsService({db:tx,...deps});
 const assertAssetFile=async(c:RequestContext,id:string,file:string,active:boolean,tx:Db=db)=>{await createAssetsService(createAssetRepository(tx,deps),unavailable,deps).assertAssetFileOwned(c,id,file,active);};
 const articleFor=(tx:Db=db)=>createArticlesService(tx,{...deps,projects,artifacts,assertAssetFile:(c,id,file,active)=>assertAssetFile(c,id,file,active,tx),resolveDocumentSource:async()=>null,resolveSelectedBrand:async()=>null,submitGeneration:unavailable,readGeneration:unavailable});
 const graphicFor=(tx:Db=db)=>createGraphicPostsService(tx,{...deps,projects,artifacts,assertAssetFile:(c,id,file,active)=>assertAssetFile(c,id,file,active,tx),submitTextGeneration:unavailable,readTextGeneration:unavailable});
 const project=await projects().createProject(ctx,{title:"真实稿面素材回归",brief:"手动选择"});
 const output=kind==="article"?await articleFor().createOutput(ctx,project.id,{title:"文章",clientRequestId:"article-material-create"}):await graphicFor().createOutput(ctx,project.id,{title:"图文",clientRequestId:"graphic-material-create"});
 if(kind==="article"){const current=await articleFor().getArticle(ctx,output.id);await articleFor().createVersion(ctx,output.id,{clientRequestId:"article-material-sections",expectedCurrentVersionId:current.currentVersionId,document:{...current.current,sections:[articleSection.parse({sectionId:"section-a",order:0,heading:"原标题",body:"保留正文",sourceRefs:[]})]}});}
 else{const current=await graphicFor().getGraphicPost(ctx,output.id);await graphicFor().createVersion(ctx,output.id,{clientRequestId:"graphic-material-cards",expectedCurrentVersionId:current.currentVersionId,document:{...current.current,cardBriefs:[{cardId:"card-a",title:"第一卡",body:"保留卡正文",sourceRefs:[]},{cardId:"card-b",title:"第二卡",body:"另卡正文",sourceRefs:[]}]}});}
 const member:WorkMemberRef={kind,outputId:output.id},adapter=kind==="article"?createArticleMaterialPorts(articleFor):createGraphicMaterialPorts(graphicFor);
 const compositionFor=(tx:Db=db)=>createWorkCompositionsService({db:tx,...deps,ports:{artifacts,assertProjectOwned:async(c,id,store,lock)=>{await projects(store).getProject(c,id,lock);},readMember:async(c,p,m,store=tx)=>{if(m.kind!==kind)throw Error("原成员类型");const current=kind==="article"?await articleFor(store).getArticle(c,m.outputId):await graphicFor(store).getGraphicPost(c,m.outputId);if(current.projectId!==p)throw Error("原项目");return{kind:"artifact",artifactId:current.artifactId,versionId:current.currentVersionId};},createMember:unavailable,findCreatedMember:async()=>null,assertSource:unavailable,assertRule:unavailable}});
 const composition=await compositionFor().create(ctx,{projectId:project.id,title:"作品",clientRequestId:"owner-material-composition"});await compositionFor().bindMember(ctx,composition.compositionId,{expectedRevision:0,clientRequestId:"owner-material-bind",member});
 const materials=createWorkMaterialsService({db,...deps,ports:{...adapter,assertComposition:async(c,id,tx,lock)=>{await compositionFor(tx).assertCompositionOwned(c,id,lock);},lockMember:(c,id,m,tx)=>compositionFor(tx).lockMember(c,id,m),assertFile:async(c,_p,file,tx)=>assertAssetFile(c,file.assetId,file.assetFileId,true,tx),assertSource:unavailable,sourceRules:async()=>[]}});
 for(const id of["asset-a","asset-b"]){await db.insert(assets).values({id,userId:ctx.userId,accountId:ctx.accountId!,assetType:"image",name:id,status:"active",currentFileId:`${id}-1`,createdAt:deps.now(),updatedAt:deps.now()});await db.insert(assetFiles).values({id:`${id}-1`,assetId:id,versionNumber:1,storageKey:`${id}.png`,mimeType:"image/png",fileSize:68,checksum:"real-file-row",createdAt:deps.now()});}
 const file=(id:string)=>({assetId:id,assetFileId:`${id}-1`}),current=async()=>{const item=kind==="article"?await articleFor().getArticle(ctx,output.id):await graphicFor().getGraphicPost(ctx,output.id);return{kind:"artifact" as const,artifactId:item.artifactId,versionId:item.currentVersionId};};
 return{opened,db,output,composition,member,materials,articleFor,graphicFor,file,current,adapter};
}
// 包含独立 createDb 迁移与多次公开父锁/CAS写入；测试IO时限不改变产品取消、任务deadline或断言。
it.each(["article","image"] as const)("%s 封面和单段/单卡保存真实回执，解除封面不影响正文配图",async kind=>{
 const f=await fixture(kind);try{const cover:WorkMaterialTarget=kind==="article"?{kind:"article_cover",outputId:f.output.id}:{kind:"image_cover",outputId:f.output.id},body:WorkMaterialTarget=kind==="article"?{kind:"article_image",outputId:f.output.id,sectionId:"section-a"}:{kind:"image_card",outputId:f.output.id,cardId:"card-a"};
 const a=await f.materials.attach(ctx,f.composition.compositionId,{clientRequestId:"owner-cover-attach",member:f.member,target:cover,expectedOwnerVersion:await f.current(),file:f.file("asset-a"),source:null,position:null});
 await f.materials.attach(ctx,f.composition.compositionId,{clientRequestId:"owner-body-attach",member:f.member,target:body,expectedOwnerVersion:await f.current(),file:f.file("asset-a"),source:null,position:null});
 await f.materials.detach(ctx,f.composition.compositionId,{clientRequestId:"owner-cover-detach",associationId:a.association.associationId,expectedOwnerVersion:await f.current(),expectedFile:f.file("asset-a")});
 expect((await f.adapter.readTarget(ctx,f.member,cover,f.db)).files).toEqual([]);expect((await f.adapter.readTarget(ctx,f.member,body,f.db)).files).toEqual([f.file("asset-a")]);
 const dependencies=await f.materials.dependencies(ctx,f.composition.compositionId);expect(dependencies.filter(item=>item.status==="current")).toHaveLength(2);expect(dependencies.every(item=>item.commitReceipt?.kind==="manual_save")).toBe(true);
 if(kind==="article")expect((await f.articleFor().getArticle(ctx,f.output.id)).current.sections[0]!.body).toBe("保留正文");else expect((await f.graphicFor().getGraphicPost(ctx,f.output.id)).current.cardBriefs![0]!.body).toBe("保留卡正文");
 const unknown:WorkMaterialTarget=kind==="article"?{kind:"article_image",outputId:f.output.id,sectionId:"unknown-section"}:{kind:"image_card",outputId:f.output.id,cardId:"unknown-card"};const before=await f.current();await expect(f.materials.attach(ctx,f.composition.compositionId,{clientRequestId:"owner-unknown-target",member:f.member,target:unknown,expectedOwnerVersion:before,file:f.file("asset-b"),source:null,position:null})).rejects.toThrow();expect(await f.current()).toEqual(before);
 }finally{await f.opened.client.close();}
},30000);
it("图卡绑定按真实cardId，重排别卡不使单卡失效，已绑定卡删除必须明确解除",async()=>{
 const f=await fixture("image");try{const target:WorkMaterialTarget={kind:"image_card",outputId:f.output.id,cardId:"card-a"};await f.materials.attach(ctx,f.composition.compositionId,{clientRequestId:"card-identity-attach",member:f.member,target,expectedOwnerVersion:await f.current(),file:f.file("asset-a"),source:null,position:null});const before=await f.adapter.readTarget(ctx,f.member,target,f.db),original=await f.graphicFor().getGraphicPost(ctx,f.output.id);
 await f.graphicFor().createVersion(ctx,f.output.id,{clientRequestId:"card-other-insert",expectedCurrentVersionId:original.currentVersionId,document:{...original.current,imageUses:[{...f.file("asset-b"),role:"card",cardId:"card-b",order:0},...original.current.imageUses.map(image=>({...image,order:image.order+1}))]}});
 expect((await f.adapter.readTarget(ctx,f.member,target,f.db)).value).toEqual(before.value);expect((await f.materials.dependencies(ctx,f.composition.compositionId)).at(-1)!.status).toBe("current");const current=await f.graphicFor().getGraphicPost(ctx,f.output.id);
 await expect(f.graphicFor().createVersion(ctx,f.output.id,{clientRequestId:"card-delete-bound",expectedCurrentVersionId:current.currentVersionId,document:{...current.current,cardBriefs:(current.current.cardBriefs??[]).filter(card=>card.cardId!=="card-a")}})).rejects.toThrow();expect((await f.graphicFor().getGraphicPost(ctx,f.output.id)).currentVersionId).toBe(current.currentVersionId);
 }finally{await f.opened.client.close();}
});
