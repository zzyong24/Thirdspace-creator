import {afterEach,beforeEach,expect,it,vi} from "vitest";
import {mkdtemp,rm} from "node:fs/promises";
import {join} from "node:path";
import {tmpdir} from "node:os";
import {ENDPOINTS,type Endpoint,type RequestContext} from "@creatoros/contract";
import type {ObjectStoragePort} from "@creatoros/backend/modules/assets";
const held=vi.hoisted(()=>({storage:null as ObjectStoragePort|null,root:""}));
// 只重定向真实本地文件适配器的目录，原Settings/DB/owner/公共transport不替换。
vi.mock("@creatoros/backend/modules/assets",async importOriginal=>{const actual=await importOriginal<typeof import("@creatoros/backend/modules/assets")>();return {...actual,createLocalFsObjectStorage:(...args:Parameters<typeof actual.createLocalFsObjectStorage>)=>{const port=actual.createLocalFsObjectStorage({...args[0],rootPath:held.root},args[1]);held.storage=port;return port;}};});
import {compositeTransport,__resetPersistenceForTests} from "@/server/persistence-client";
import {canonicalDataset} from "@/fixtures/canonical";
let ctx:RequestContext={userId:canonicalDataset.user.id,accountId:`acct-of-${canonicalDataset.user.id}`,source:"user",requestId:"publication-cover-original-bytes"};
const call=async<E extends Endpoint>(endpoint:E,params:unknown,body?:unknown,query?:unknown)=>compositeTransport.request(endpoint,{params,body,query} as never,ctx) as Promise<{data:E["isList"] extends true ? E["response"]["_output"][] : E["response"]["_output"]}>;
beforeEach(()=>{vi.stubEnv("CREATOROS_STORAGE","local");__resetPersistenceForTests();held.storage=null;});afterEach(()=>vi.unstubAllEnvs());
it("公共作品封面绑定实际文件，原文本保存保留pair，文件不可读零保存，同请求恢复与解除闭合",async()=>{
 const root=await mkdtemp(join(tmpdir(),"creatoros-root-cover-bytes-"));try{
 held.root=join(root,"storage");
 const account=(await call(ENDPOINTS.createAccount,undefined,{platform:"xiaohongshu",accountHandle:"@t1246-cover-owner",followerBaseline:0})).data;ctx={...ctx,accountId:account.id};
 const project=(await call(ENDPOINTS.createProject,undefined,{title:"发布封面真实文件",brief:"测试实际文件与版本保存"})).data;
 let composition=(await call(ENDPOINTS.createWorkComposition,undefined,{projectId:project.id,title:"真实封面作品",clientRequestId:"cover-root-work"})).data.composition;
 composition=(await call(ENDPOINTS.createWorkCompositionMember,{compositionId:composition.compositionId},{expectedRevision:composition.currentRevision,clientRequestId:"cover-root-member",memberInput:{kind:"image",title:"封面稿件",targetPlatform:null}})).data.composition;
 const member=composition.current.members[0]!.member;if(member.kind!=="image")throw Error("测试必须为实际图文成员");
 const publication=(await call(ENDPOINTS.createPublication,{outputId:member.outputId},{platform:"xiaohongshu",accountReference:ctx.accountId})).data;
 const revision=(await call(ENDPOINTS.createPublicationRevision,{publicationId:publication.id},{title:"原发布标题",description:"原发布简介",platformTags:["真实标签"]})).data;
 const bytes=Uint8Array.from(Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+yjX8AAAAASUVORK5CYII=","base64"));
 const upload=(await call(ENDPOINTS.createUpload,undefined,{assetType:"image",mimeType:"image/png",fileSize:bytes.length})).data;
 await held.storage!.putObject({storageKey:upload.storageKey,bytes,mimeType:"image/png",assetType:"image"});
 const asset=(await call(ENDPOINTS.completeUpload,{uploadId:upload.uploadId},{name:"实际封面图片"})).data;
 await call(ENDPOINTS.createMaterialLink,undefined,{projectId:project.id,entityType:"asset",entityId:asset.id});
 const file={assetId:asset.id,assetFileId:asset.currentFileId},params={compositionId:composition.compositionId};
 const attach={clientRequestId:"cover-root-attach",member,target:{kind:"publication_cover",outputId:member.outputId,publicationId:publication.id},expectedOwnerVersion:{kind:"publication",publicationId:publication.id,revisionId:revision.id},file,source:null,position:null};
 await held.storage!.deleteObject!(upload.storageKey);await expect(call(ENDPOINTS.attachWorkCompositionMaterial,params,attach)).rejects.toThrow();
 expect((await call(ENDPOINTS.getPublication,{publicationId:publication.id})).data.currentRevisionId).toBe(revision.id);
 await held.storage!.putObject({storageKey:upload.storageKey,bytes,mimeType:"image/png",assetType:"image"});
 const attached=(await call(ENDPOINTS.attachWorkCompositionMaterial,params,attach)).data;
 expect(attached.association.file).toEqual(file);expect(attached.association.status).toBe("attached");
 expect((await call(ENDPOINTS.attachWorkCompositionMaterial,params,attach)).data).toEqual(attached);
 const text=(await call(ENDPOINTS.createPublicationRevision,{publicationId:publication.id},{title:"只修改标题",description:"新的简介",platformTags:["已改标签"]})).data;
 expect(text.coverAssetId).toBe(file.assetId);expect(text.coverAssetFileId).toBe(file.assetFileId);
 const detached=(await call(ENDPOINTS.detachWorkCompositionMaterial,params,{clientRequestId:"cover-root-detach",associationId:attached.association.associationId,expectedOwnerVersion:{kind:"publication",publicationId:publication.id,revisionId:text.id},expectedFile:file})).data;
 expect(detached.association.status).toBe("detached");const revisions=ENDPOINTS.listPublicationRevisions.response.array().parse((await call(ENDPOINTS.listPublicationRevisions,{publicationId:publication.id},undefined,{page:1,pageSize:20})).data);
 const version=detached.association.ownerVersion;if(version.kind!=="publication")throw Error("正式回执必须为发布修订");const latest=revisions.find(r=>r.id===version.revisionId);expect(latest).toMatchObject({title:"只修改标题",description:"新的简介",platformTags:["已改标签"],coverAssetId:null,coverAssetFileId:null});
 }finally{await rm(root,{recursive:true,force:true});}
},180000);
