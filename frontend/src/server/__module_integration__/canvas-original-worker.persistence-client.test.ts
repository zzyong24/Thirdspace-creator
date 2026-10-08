// @vitest-environment node
import {expect,it,vi} from 'vitest';
import {createServer} from 'node:http';
import {mkdtemp,rm} from 'node:fs/promises';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {ENDPOINTS,canvasMaterialSelectionResource,type Endpoint,type RequestContext} from '@creatoros/contract';
import type {ObjectStoragePort} from '@creatoros/backend/modules/assets';
const held=vi.hoisted(()=>({storage:null as ObjectStoragePort|null,root:''}));
// 仅隔离本地媒体目录；原Settings、密钥、DB、业务owner、worker和公共transport均真实运行。
vi.mock('@creatoros/backend/modules/assets',async original=>{const actual=await original<typeof import('@creatoros/backend/modules/assets')>();return{...actual,migrateStorageRoot:async()=>{throw Error('测试禁止迁移用户媒体目录');},createLocalFsObjectStorage:(...args:Parameters<typeof actual.createLocalFsObjectStorage>)=>{const port=actual.createLocalFsObjectStorage({...args[0],rootPath:held.root},args[1]);held.storage=port;return port;}};});
import {compositeTransport,__resetPersistenceForTests} from '@/server/persistence-client';
const png=Uint8Array.from(Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+yjX8AAAAASUVORK5CYII=','base64'));
const legacy:RequestContext={userId:'canvas-public-worker-user',accountId:'canvas-public-worker-account',source:'user',requestId:'canvas-public-worker'};
let ctx:RequestContext=legacy;
async function call<E extends Endpoint>(endpoint:E,params:unknown,body?:unknown,query?:unknown,c=ctx):Promise<E['response']['_output']>{const result=await compositeTransport.request(endpoint,{params,body,query} as never,c) as {data:unknown};return endpoint.response.parse(result.data);}
async function callList<E extends Endpoint>(endpoint:E,params:unknown,body?:unknown,query?:unknown,c=ctx):Promise<E['response']['_output'][]>{const result=await compositeTransport.request(endpoint,{params,body,query} as never,c) as {data:unknown};if(!Array.isArray(result.data))throw Error('原公共列表回包不是数组');return result.data.map(value=>endpoint.response.parse(value));}
// 本机HTTP fixture只证明原网络、Worker及owner实际调用链，不代表真实模型供应商验收。
it.each(['legacy','group','group-account'] as const)('公共Settings→原Canvas→实际worker→原confirm→WorkMaterials完整链 scope=%s',async scope=>{
 ctx={...legacy};
 const dir=await mkdtemp(join(tmpdir(),'creatoros-public-canvas-worker-'));held.root=join(dir,'media');
 const requests:{path:string;contentType:string;body:Buffer}[]=[];
 const server=createServer(async(req,res)=>{const chunks:Buffer[]=[];for await(const value of req)chunks.push(Buffer.from(value));requests.push({path:req.url??'',contentType:req.headers['content-type']??'',body:Buffer.concat(chunks)});res.writeHead(200,{'content-type':'application/json'});res.end(JSON.stringify({data:[{b64_json:Buffer.from(png).toString('base64')}]}));});
 await new Promise<void>(r=>server.listen(0,'127.0.0.1',r));const baseUrl=`http://127.0.0.1:${(server.address() as {port:number}).port}/v1`;
 vi.stubEnv('DATABASE_URL','');vi.stubEnv('PGLITE_DATA_DIR',join(dir,'db'));vi.stubEnv('CREATOROS_STORAGE','local');__resetPersistenceForTests();
 try{
  if(scope!=='legacy'){
   const user:RequestContext={userId:legacy.userId,requestId:legacy.requestId,source:'user'};
   const group=await call(ENDPOINTS.createAccountGroup,undefined,{name:'隔离组画布',idempotencyKey:'canvas-parent-group'},undefined,user);
   ctx={...user,groupId:group.id,groupVersion:group.version,accountId:null};
   if(scope==='group-account'){const account=await call(ENDPOINTS.createAccount,undefined,{platform:'xiaohongshu',accountHandle:'隔离画布账号',idempotencyKey:'canvas-parent-account'});ctx={...ctx,accountId:account.id};}
  }
  await call(ENDPOINTS.putModel,{capability:'image.generate'},{provider:'openai',modelName:'gpt-image-1',baseUrl,secret:'local-fixture-only',isDefault:false});
  await call(ENDPOINTS.putModel,{capability:'image.edit'},{provider:'openai',modelName:'gpt-image-1',baseUrl,secret:'local-fixture-only',isDefault:false});
  const project=await call(ENDPOINTS.createProject,undefined,{title:'原Canvas公共Worker验证',brief:'用户明确参考图'});
  const upload=await call(ENDPOINTS.createUpload,undefined,{assetType:'image',mimeType:'image/png',fileSize:png.length});await held.storage!.putObject({storageKey:upload.storageKey,bytes:png,mimeType:'image/png',assetType:'image'});
  const reference=await call(ENDPOINTS.completeUpload,{uploadId:upload.uploadId},{name:'实际首版参考图'});
  const canvas=await call(ENDPOINTS.createCanvas,undefined,{title:'公共原画布',projectId:project.id});
  const saved=await call(ENDPOINTS.saveCanvas,{canvasId:canvas.id},{expectedRevision:canvas.revision,document:{...canvas.document,nodes:[{id:'image-generation',type:'image_generation',position:{x:40,y:40},label:'参考图节点',mode:'image_to_image',prompt:'保留参考主体，改为明亮背景',referenceAssetId:reference.id}]}});
  const input={expectedRevision:saved.revision,attemptId:'public-canvas-original-attempt'};
  const link=await call(ENDPOINTS.generateCanvasNode,{canvasId:canvas.id,nodeId:'image-generation'},input);
  expect((await call(ENDPOINTS.generateCanvasNode,{canvasId:canvas.id,nodeId:'image-generation'},input)).taskId).toBe(link.taskId);
  await vi.waitFor(async()=>{const task=await call(ENDPOINTS.getTask,{taskId:link.taskId!});expect(task.status,JSON.stringify({task,requests:requests.map(r=>r.path)})).toBe('awaiting_confirmation');},{timeout:120000});
  expect(requests.filter(r=>r.path.endsWith('/images/edits'))).toHaveLength(1);const req=requests.find(r=>r.path.endsWith('/images/edits'))!;expect(req.contentType).toContain('multipart/form-data');expect(req.body.includes(Buffer.from(png))).toBe(true);expect(req.body.toString()).toContain('保留参考主体，改为明亮背景');
  const selected=canvasMaterialSelectionResource.parse(await call(ENDPOINTS.getCanvasGenerationMaterial,{canvasId:canvas.id,generationLinkId:link.id}));if(selected.status!=='available')throw Error(JSON.stringify(selected));expect(selected.phase).toBe('candidate');expect(selected.origin.taskId).toBe(link.taskId);
  if(scope==='legacy')await expect(call(ENDPOINTS.getCanvasGenerationMaterial,{canvasId:canvas.id,generationLinkId:link.id},undefined,undefined,{...ctx,accountId:'another-account'})).rejects.toThrow();
  else await expect(call(ENDPOINTS.getCanvasGenerationMaterial,{canvasId:canvas.id,generationLinkId:link.id},undefined,undefined,{...ctx,groupId:'foreign-group'})).rejects.toThrow();
  expect(requests.filter(r=>r.path.endsWith('/images/edits'))).toHaveLength(1);
  const foreignScopes=[{...ctx,groupId:'foreign-group'}, {...ctx,userId:'foreign-user'}];
  // 组入口的账号筛选不改变共享任务归属；只有旧账号入口叠账号边界。
  if(scope==='legacy')foreignScopes.push({...ctx,accountId:'another-account'});
  for(const foreign of foreignScopes)await expect(call(ENDPOINTS.confirmTask,{taskId:link.taskId!},undefined,undefined,foreign)).rejects.toThrow();
  await call(ENDPOINTS.confirmTask,{taskId:link.taskId!});await call(ENDPOINTS.confirmTask,{taskId:link.taskId!});
  expect((await call(ENDPOINTS.getTask,{taskId:link.taskId!})).status).toBe('succeeded');
  const links=await callList(ENDPOINTS.listMaterialLinks,undefined,undefined,{projectId:project.id,page:1,pageSize:100});expect(links.filter(item=>item.entityType==='asset'&&item.entityId===selected.file.assetId)).toHaveLength(1);
  expect(requests.filter(r=>r.path.endsWith('/images/edits'))).toHaveLength(1);
  const confirmed=canvasMaterialSelectionResource.parse(await call(ENDPOINTS.getCanvasGenerationMaterial,{canvasId:canvas.id,generationLinkId:link.id}));expect(confirmed).toMatchObject({status:'available',phase:'confirmed',file:selected.file,checksum:selected.checksum});
  const nextUpload=await call(ENDPOINTS.createUpload,undefined,{assetType:'image',mimeType:'image/png',fileSize:png.length});await held.storage!.putObject({storageKey:nextUpload.storageKey,bytes:png,mimeType:'image/png',assetType:'image'});const later=await call(ENDPOINTS.addAssetFile,{assetId:selected.file.assetId},{storageKey:nextUpload.storageKey});
  expect((await call(ENDPOINTS.getAsset,{assetId:selected.file.assetId})).currentFileId).toBe(later.id);expect(later.id).not.toBe(selected.file.assetFileId);
  expect(await call(ENDPOINTS.getCanvasGenerationMaterial,{canvasId:canvas.id,generationLinkId:link.id})).toMatchObject({file:selected.file});const download=await call(ENDPOINTS.getAssetFileDownloadUrl,{assetId:selected.file.assetId,assetFileId:selected.file.assetFileId});expect(download.fileName).toMatch(/.+\.png$/);
  let composition=(await call(ENDPOINTS.createWorkComposition,undefined,{projectId:project.id,title:'原组合',clientRequestId:'public-canvas-work-create'})).composition;
  composition=(await call(ENDPOINTS.createWorkCompositionMember,{compositionId:composition.compositionId},{expectedRevision:composition.currentRevision,clientRequestId:'public-canvas-moments-create',memberInput:{kind:'moments',document:{schemaVersion:1,text:'正文保留，不因配图改写',imageUses:[],sourceRefs:[]}}})).composition;
  const member=composition.current.members[0]!.member;if(member.kind!=='moments')throw Error('真实朋友圈成员');const draft=await call(ENDPOINTS.getMoments,{momentsId:member.momentsId});
  const body={clientRequestId:'public-canvas-exact-file-attach',member,target:{kind:'moments_images',momentsId:member.momentsId},expectedOwnerVersion:{kind:'artifact',artifactId:draft.artifactId,versionId:draft.currentVersionId},file:selected.file,source:null,position:null};
  await expect(call(ENDPOINTS.attachWorkCompositionMaterial,{compositionId:composition.compositionId},{...body,clientRequestId:'public-canvas-wrong-file',file:{assetId:selected.file.assetId,assetFileId:reference.currentFileId}})).rejects.toThrow();
  await expect(call(ENDPOINTS.attachWorkCompositionMaterial,{compositionId:composition.compositionId},body,undefined,{...ctx,groupId:'foreign-group'})).rejects.toThrow();
  const attached=await call(ENDPOINTS.attachWorkCompositionMaterial,{compositionId:composition.compositionId},body);expect(attached.association).toMatchObject({file:selected.file,source:null,status:'attached'});expect((await call(ENDPOINTS.attachWorkCompositionMaterial,{compositionId:composition.compositionId},body)).association).toEqual(attached.association);
  expect((await call(ENDPOINTS.getMoments,{momentsId:member.momentsId})).current).toMatchObject({text:'正文保留，不因配图改写',imageUses:[{...selected.file,order:0}],sourceRefs:[]});
  const dependencies=await callList(ENDPOINTS.getWorkCompositionDependencies,{compositionId:composition.compositionId},undefined,{page:1,pageSize:50});expect(dependencies).toHaveLength(1);expect(dependencies[0]).toMatchObject({files:[selected.file],sources:[],sourceRefs:[],status:'current'});
 }finally{await(globalThis as {__creatorosDisposePersistence?:()=>Promise<void>}).__creatorosDisposePersistence?.();__resetPersistenceForTests();server.closeAllConnections();await new Promise<void>(r=>server.close(()=>r()));vi.unstubAllEnvs();await rm(dir,{recursive:true,force:true});}
},180000);
