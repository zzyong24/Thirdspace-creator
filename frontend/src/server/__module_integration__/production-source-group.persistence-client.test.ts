import {it,expect,vi} from 'vitest';
import {mkdtemp,readFile,rm} from 'node:fs/promises';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {createHash} from 'node:crypto';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {ENDPOINTS,type Endpoint,type RequestContext} from '@creatoros/contract';
import type {ObjectStoragePort} from '@creatoros/backend/modules/assets';
const held=vi.hoisted(()=>({root:'',storage:null as ObjectStoragePort|null}));
// 仅重定向本地存储根；真实设置/Skill/事务/任务与媒体探针不替换。
vi.mock('@creatoros/backend/modules/assets',async load=>{const actual=await load<typeof import('@creatoros/backend/modules/assets')>();return{...actual,createLocalFsObjectStorage:(...args:Parameters<typeof actual.createLocalFsObjectStorage>)=>{const storage=actual.createLocalFsObjectStorage({...args[0],rootPath:held.root},args[1]);held.storage=storage;return storage;}};});
import {compositeTransport,__resetPersistenceForTests} from '@/server/persistence-client';
import {canonicalDataset} from '@/fixtures/canonical';
it('纯账号组真实prepare事务读取运行配置、探针与同请求幂等完整公共链',async()=>{
 const root=await mkdtemp(join(tmpdir(),'creatoros-group-source-public-'));held.root=join(root,'media');
 vi.stubEnv('CREATOROS_STORAGE','local');vi.stubEnv('DATABASE_URL','');vi.stubEnv('PGLITE_DATA_DIR','');vi.stubEnv('CREATOROS_MEDIA_ROOT',held.root);vi.stubEnv('CREATOROS_WORKSPACES_ROOT',join(root,'workspaces'));vi.stubEnv('CREATOROS_DISABLE_BACKGROUND_DRIVERS','1');__resetPersistenceForTests();
 const base:RequestContext={userId:canonicalDataset.user.id,source:'user',requestId:'source-group-public'};let ctx=base;
 const call=async(endpoint:Endpoint,params?:unknown,body?:unknown,query?:unknown)=>((await compositeTransport.request(endpoint,{params,body,query} as never,ctx)) as {data:any}).data;
 try{
  const group=await call(ENDPOINTS.createAccountGroup,undefined,{name:'原片事务测试组',idempotencyKey:'source-group-create'});ctx={...base,groupId:group.id};
  const project=await call(ENDPOINTS.createProject,undefined,{title:'同组真实原片',brief:'真实3秒媒体探针，不调用模型或ASR'}),output=await call(ENDPOINTS.createOutput,{projectId:project.id},{title:'原片',contentType:'video'});
  const file=join(root,'source.mp4');await promisify(execFile)('ffmpeg',['-v','error','-f','lavfi','-i','testsrc2=size=640x360:rate=24','-f','lavfi','-i','sine=frequency=440:sample_rate=48000','-t','3','-c:v','libx264','-pix_fmt','yuv420p','-c:a','aac',file],{timeout:120000});const bytes=await readFile(file),fileDigest=createHash('sha256').update(bytes).digest('hex');
  const upload=await call(ENDPOINTS.createUpload,undefined,{assetType:'video',mimeType:'video/mp4',fileSize:bytes.length,projectId:project.id,fileName:'source.mp4'});await held.storage!.putObject({storageKey:upload.storageKey,bytes,mimeType:'video/mp4',assetType:'video'});
  const asset=await call(ENDPOINTS.completeUpload,{uploadId:upload.uploadId},{name:'同组原片'}),input={requestId:'group-source-original',assetId:asset.id,assetFileId:asset.currentFileId};
  await call(ENDPOINTS.createMaterialLink,undefined,{projectId:project.id,entityType:'asset',entityId:asset.id});
  await call(ENDPOINTS.patchPreferences,undefined,{assistantExecutionEngine:'codex'});
  const prepared=await call(ENDPOINTS.prepareProductionEditorSource,{outputId:output.id},input);expect(prepared.taskId).toBeTruthy();const originalTask=await call(ENDPOINTS.getTask,{taskId:prepared.taskId});expect(originalTask.modelKey).toBe('codex');expect(originalTask.groupId).toBe(group.id);
  await call(ENDPOINTS.patchPreferences,undefined,{assistantExecutionEngine:'pi'});
  let source:any;await vi.waitFor(async()=>{source=await call(ENDPOINTS.getProductionEditorSource,{outputId:output.id,requestId:input.requestId});expect(source.status).toBe('succeeded');},{timeout:120000,interval:250});
  expect(source.probe.fileDigest).toBe(fileDigest);expect(source.requestId).toBe(input.requestId);expect(source.taskId).toBe(prepared.taskId);
  expect(await call(ENDPOINTS.prepareProductionEditorSource,{outputId:output.id},input)).toEqual(source);expect((await call(ENDPOINTS.getTask,{taskId:prepared.taskId})).modelKey).toBe('codex');
  const saved=await call(ENDPOINTS.adoptProductionEditorSource,{outputId:output.id},{sourceRequestId:input.requestId,expectedRevision:0,requestId:'group-source-adopt',addWholeClip:true});expect(saved.plan.mainTrack.sources[0].fileDigest).toBe(fileDigest);
  await expect(call(ENDPOINTS.prepareProductionEditorSource,{outputId:output.id},{...input,assetFileId:'wrong-file'})).rejects.toThrow();
  const other=await call(ENDPOINTS.createAccountGroup,undefined,{name:'不属于原片的组',idempotencyKey:'source-group-other'});ctx={...base,groupId:other.id};await expect(call(ENDPOINTS.getProductionEditorSource,{outputId:output.id,requestId:input.requestId})).rejects.toThrow();
 }finally{await (globalThis as {__creatorosDisposePersistence?:()=>Promise<void>}).__creatorosDisposePersistence?.();__resetPersistenceForTests();vi.unstubAllEnvs();await rm(root,{recursive:true,force:true});}
},300000);
