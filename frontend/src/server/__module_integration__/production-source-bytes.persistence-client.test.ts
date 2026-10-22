import {afterEach,beforeEach,expect,it,vi} from "vitest";
import {mkdtemp,readFile,rm} from "node:fs/promises";
import {join} from "node:path";
import {tmpdir} from "node:os";
import {execFile} from "node:child_process";
import {promisify} from "node:util";
import {ENDPOINTS,type Endpoint,type RequestContext} from "@creatoros/contract";
import type {ObjectStoragePort} from "@creatoros/backend/modules/assets";
const held=vi.hoisted(()=>({storage:null as ObjectStoragePort|null,root:""}));
// 本地存储只重定向到隔离目录；原Settings、真实文件适配器/Source/探针/DB/事务不替换。
vi.mock("@creatoros/backend/modules/assets",async importOriginal=>{
 const actual=await importOriginal<typeof import("@creatoros/backend/modules/assets")>();
 return{...actual,createLocalFsObjectStorage:(...args:Parameters<typeof actual.createLocalFsObjectStorage>)=>{const storage=actual.createLocalFsObjectStorage({...args[0],rootPath:held.root},args[1]);held.storage=storage;return storage;}};
});
import {compositeTransport,__resetPersistenceForTests} from "@/server/persistence-client";
import {canonicalDataset} from "@/fixtures/canonical";
const ctx:RequestContext={userId:canonicalDataset.user.id,accountId:`acct-of-${canonicalDataset.user.id}`,source:"user",requestId:"production-public-original-bytes"};
const call=async(endpoint:Endpoint,params:unknown,body?:unknown,query?:unknown)=>compositeTransport.request(endpoint,{params,body,query} as never,ctx) as Promise<{data:any}>;
beforeEach(()=>{vi.stubEnv("CREATOROS_STORAGE","local");__resetPersistenceForTests();held.storage=null;});afterEach(()=>vi.unstubAllEnvs());
it("公共根真实探针后同事务核原字节，坏字节拒绝零保存，恢复原字节可采用并保留真实旧稿",async()=>{
 const root=await mkdtemp(join(tmpdir(),"creatoros-root-source-bytes-"));
 try{
  held.root=join(root,"storage");
  const path=join(root,"original.mp4");await promisify(execFile)((process.env.CREATOROS_FFMPEG_PATH || 'ffmpeg'),["-v","error","-f","lavfi","-i","testsrc2=size=320x180:rate=30","-f","lavfi","-i","sine=frequency=440:sample_rate=48000","-t","1","-c:v","libx264","-pix_fmt","yuv420p","-c:a","aac",path]);const bytes=await readFile(path);
  const project=(await call(ENDPOINTS.createProject,undefined,{title:"公共根真实媒体",brief:"测试字节与同事务归属"})).data;
  const output=(await call(ENDPOINTS.createOutput,{projectId:project.id},{title:"独立原片",contentType:"video"})).data;
  const upload=(await call(ENDPOINTS.createUpload,undefined,{assetType:"video",mimeType:"video/mp4",fileSize:bytes.length})).data;
  const put=(value:Uint8Array)=>held.storage!.putObject({storageKey:upload.storageKey,bytes:value,mimeType:"video/mp4",assetType:"video"});await put(bytes);
  const asset=(await call(ENDPOINTS.completeUpload,{uploadId:upload.uploadId},{name:"实际MP4原片"})).data;
  await call(ENDPOINTS.createMaterialLink,undefined,{projectId:project.id,entityType:"asset",entityId:asset.id});
  const oldPlan={unknownExtension:{preserve:true},renderProps:{meta:{title:"旧稿"},talkingHead:{file:asset.id,durationSec:1},scenes:[{id:"old-scene",title:"正文",label:"正文",startSec:0,endSec:1,cards:[]}],captions:[],broll:[]}};
  await call(ENDPOINTS.saveProductionEditor,{outputId:output.id},{expectedRevision:0,requestId:"bytes-original-save",source:"manual",plan:oldPlan});
  await call(ENDPOINTS.prepareProductionEditorSource,{outputId:output.id},{requestId:"bytes-original-source",assetId:asset.id,assetFileId:asset.currentFileId});
  let source:any;await vi.waitFor(async()=>{source=(await call(ENDPOINTS.getProductionEditorSource,{outputId:output.id,requestId:"bytes-original-source"})).data;expect(source.status).toBe("succeeded");},{timeout:15000,interval:100});
  const converted=(await call(ENDPOINTS.prepareProductionEditorConversion,{outputId:output.id},{mode:"capture-current-original",expectedRevision:1,requestId:"bytes-original-conversion",mainSourceRequestId:source.requestId})).data;
  const adopt={conversionRequestId:converted.requestId,expectedRevision:1,requestId:"bytes-original-conversion-adopt",conversionDigest:converted.conversionDigest};
  await put(new TextEncoder().encode("字节遭到替换，不能沿用原摘要"));await expect(call(ENDPOINTS.adoptProductionEditorConversion,{outputId:output.id},adopt)).rejects.toThrow();expect((await call(ENDPOINTS.getProductionEditor,{outputId:output.id})).data.revision).toBe(1);
  await put(bytes);const saved=(await call(ENDPOINTS.adoptProductionEditorConversion,{outputId:output.id},adopt)).data;expect(saved.revision).toBe(2);expect(saved.plan.legacySnapshot.unknownExtension).toEqual({preserve:true});expect(saved.plan.mainTrack.sources[0].assetFileId).toBe(asset.currentFileId);
  expect((await call(ENDPOINTS.adoptProductionEditorConversion,{outputId:output.id},adopt)).data).toEqual(saved);
 }finally{await rm(root,{recursive:true,force:true});}
},45000);
