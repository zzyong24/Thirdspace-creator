import {beforeEach,expect,it} from "vitest";
import {type Endpoint,type RequestContext} from "@creatoros/contract";
import {compositeTransport,__resetPersistenceForTests} from "@/server/persistence-client";
import {canonicalDataset} from "@/fixtures/canonical";
const owner:RequestContext={userId:canonicalDataset.user.id,accountId:`acct-of-${canonicalDataset.user.id}`,requestId:"work-root",source:"user"};
const ep=(id:string)=>({id} as Endpoint);
async function call(id:string,params:unknown,body?:unknown,query?:unknown){return compositeTransport.request(ep(id),{params,body,query} as never,owner) as Promise<{data:any}>;}
beforeEach(()=>__resetPersistenceForTests());
it("公开组合根创建真实四类成员、刷新恢复，16种选择不删除稿件，原素材附加回执闭合",async()=>{
 const project=(await call("projects.create",undefined,{title:"四类表达根装配",brief:"完整保留原稿"})).data;
 let composition=(await call("workCompositions.create",undefined,{projectId:project.id,title:"作品组合",clientRequestId:"work-root-create"})).data.composition;
 const id=composition.compositionId;
 for(const kind of ["video","article","image","moments"] as const){const memberInput=kind==="moments"?{kind,document:{schemaVersion:1,text:"明确手工朋友圈",imageUses:[],sourceRefs:[]}}:{kind,title:`真实${kind}`,targetPlatform:null,...(kind==="image"?{}:{contentRole:null})};
  const body={expectedRevision:composition.currentRevision,clientRequestId:`work-root-member-${kind}`,memberInput};const saved=(await call("workCompositions.members.create",{compositionId:id},body)).data;composition=saved.composition;expect(saved.request.memberReservation.status).toBe("bound");expect(saved.request.memberReservation.target.kind).toBe(kind);expect((await call("workCompositions.members.create",{compositionId:id},body)).data.request).toEqual(saved.request);
 }
 expect(composition.current.members).toHaveLength(4);expect(composition.memberCurrent).toHaveLength(4);
 const kinds=["video","article","image","moments"];
 for(let bits=0;bits<16;bits++){const selection=kinds.filter((_kind,index)=>Boolean(bits&(1<<index)));composition=(await call("workCompositions.selection.save",{compositionId:id},{clientRequestId:`work-root-selection-${bits}`,expectedRevision:composition.currentRevision,selection})).data.composition;expect(composition.current.selection).toEqual(selection);expect(composition.current.members).toHaveLength(4);}
 expect((await call("workCompositions.get",{compositionId:id})).data).toEqual(composition);
 const moments=composition.current.members.find((binding:any)=>binding.member.kind==="moments").member,original=(await call("moments.get",{momentsId:moments.momentsId})).data;
 const upload=(await call("assets.uploads.create",undefined,{assetType:"image",mimeType:"image/png",fileSize:68})).data,asset=(await call("assets.uploads.complete",{uploadId:upload.uploadId},{name:"根装配配图"})).data;await call("materialLinks.create",undefined,{projectId:project.id,entityType:"asset",entityId:asset.id});
 const attached=(await call("workCompositions.materials.attach",{compositionId:id},{clientRequestId:"work-root-material-attach",member:moments,target:{kind:"moments_images",momentsId:moments.momentsId},expectedOwnerVersion:{kind:"artifact",artifactId:original.artifactId,versionId:original.currentVersionId},file:{assetId:asset.id,assetFileId:asset.currentFileId},source:null,position:null})).data;
 expect(attached.association.status).toBe("attached");expect((await call("moments.get",{momentsId:moments.momentsId})).data.current.imageUses).toMatchObject([{assetId:asset.id,assetFileId:asset.currentFileId}]);expect((await call("workCompositions.dependencies.get",{compositionId:id},undefined,{page:1,pageSize:20})).data[0].commitReceipt.kind).toBe("manual_save");
 const savedMoments=(await call("moments.get",{momentsId:moments.momentsId})).data;
 const source=(await call("work.sources.select",undefined,{projectId:project.id,pick:{kind:"moments_version",momentsId:moments.momentsId,versionId:savedMoments.currentVersionId,selection:{mode:"selected",fields:["text"],textRanges:[]}}})).data.source;
 expect(source).toMatchObject({kind:"moments_version",versionId:savedMoments.currentVersionId,selection:{mode:"selected",fields:["text"]}});
 await call("positioning.profile.upsert",undefined,{persona:"验收创作者",field:"内容创作",audience:"读者",differentiation:"真实事实",capabilities:[]});
 const rule=(await call("positioning.statements.create",undefined,{oneLiner:"明确的验收定位规则",keywords:["事实","表达","一致"]})).data;
 const currentBasis=(await call("workCompositions.basis.versions.get",{compositionId:id,versionId:composition.current.basisVersionId})).data;
 composition=(await call("workCompositions.basis.save",{compositionId:id},{clientRequestId:"work-root-explicit-source",expectedRevision:composition.currentRevision,document:{...currentBasis.document,sourceRefs:[source],ruleRefs:[{versionId:rule.id}]}})).data.composition;
 expect((await call("workCompositions.basis.versions.get",{compositionId:id,versionId:composition.current.basisVersionId})).data.document.sourceRefs).toEqual([source]);
 const pickedBasis=(await call("work.sources.select",undefined,{projectId:project.id,pick:{kind:"work_basis_version",compositionId:id,versionId:composition.current.basisVersionId,selection:{mode:"whole"}}})).data.source;expect(pickedBasis.versionId).toBe(composition.current.basisVersionId);
 const articleMember=composition.current.members.find((binding:any)=>binding.member.kind==="article").member,article=(await call("articles.get",{outputId:articleMember.outputId})).data;
 const articleSaved=(await call("articles.versions.create",{outputId:articleMember.outputId},{clientRequestId:"work-root-real-article-title",expectedCurrentVersionId:article.currentVersionId,document:{...article.current,title:"明确保存的文章标题"}})).data;
 expect((await call("work.sources.select",undefined,{projectId:project.id,pick:{kind:"output_version",sourceOutputId:articleMember.outputId,versionId:articleSaved.versionId,selection:{mode:"selected",sourceFields:["title"],sourceSectionIds:[],textRanges:[]}}})).data.source).toMatchObject({sourceType:"article",versionId:articleSaved.versionId});
 const scope={kind:"field",compositionId:id,member:moments,target:{kind:"moments_field",momentsId:moments.momentsId,field:"text"}};
 const beforeReview=(await call("workReviews.status",undefined,{scope})).data;expect(beforeReview.state).toBe("not_reviewed");
 const confirmed=(await call("workReviews.confirm",undefined,{mode:"manual",clientRequestId:"work-root-manual-review",scope,expectedFingerprint:beforeReview.currentFingerprint,historicalBasis:[]})).data;expect(confirmed.status.state).toBe("confirmed_current");
 await call("moments.versions.create",{momentsId:moments.momentsId},{clientRequestId:"work-root-edit-after-review",expectedCurrentVersionId:savedMoments.currentVersionId,document:{...savedMoments.current,text:"复核后明确修改的正文"}});
 expect((await call("workReviews.status",undefined,{scope})).data.state).toBe("basis_updated");
 await expect(compositeTransport.request(ep("workCompositions.get"),{params:{compositionId:id}} as never,{...owner,accountId:"wrong-account"})).rejects.toThrow();
},40000);
