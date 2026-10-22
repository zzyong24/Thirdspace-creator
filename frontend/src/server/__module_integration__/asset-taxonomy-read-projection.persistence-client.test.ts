// @vitest-environment node
import {it,expect,vi} from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import {createHash,randomBytes} from 'node:crypto';
import * as React from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {ENDPOINTS,type Endpoint,type RequestContext} from '@creatoros/contract';
import {aiTasks,executionTasks,executionCalls,type Db} from '@creatoros/backend';
const owned=vi.hoisted(()=>({db:null as Db|null,network:[] as string[],children:[] as number[]}));
vi.mock('@creatoros/backend',async original=>{const a=await original<typeof import('@creatoros/backend')>();return {...a,createConfiguredDb:async(...args:Parameters<typeof a.createConfiguredDb>)=>{const result=await a.createConfiguredDb(...args);owned.db=result.db;return result;}};});
vi.mock('node:child_process',async original=>{const a=await original<typeof import('node:child_process')>();return {...a,fork:(...args:Parameters<typeof a.fork>)=>{const child=a.fork(...args);if(child.pid){owned.children.push(child.pid);const fields=a.execFileSync('/bin/ps',['-p',String(child.pid),'-o','pgid=,lstart=,comm='],{encoding:'utf8'}).trim().split(/\s+/);fs.appendFileSync(path.join(process.env.T1341_PHASE_ROOT!,'CHILDREN.ndjson'),JSON.stringify({pid:child.pid,pgid:Number(fields.shift()),identity:fields.join(' '),runId:process.env.T1341_RUN_ID})+'\n');}return child;}};});
import {compositeTransport,getIdentityService,getStorageRootForRequest,__resetPersistenceForTests} from '@/server/persistence-client';
import {buildAssetsViewModelReal,type AssetsDataClient} from '@/features/assets/assets-data';
import {createServerClient} from '@/lib/contract-client.server';
import {AssetDetailPanel} from '@/components/resources/asset-detail-panel';
const base='/Volumes/T7-MacData/CodexBuilds/t1341-asset-real-tags-20261017-b1c02e13';
const phase=process.env.T1341_PHASE!;
const sha=(bytes:Buffer)=>createHash('sha256').update(bytes).digest('hex');
const failure=(e:unknown)=>({name:e instanceof Error?e.name:'Other',message:e instanceof Error?e.message:String(e)});
type Call=(e:Endpoint,input?:any,ctx?:RequestContext)=>Promise<any>;
async function lifecycle(name:string,body:(call:Call,user:RequestContext,root:string,nonce:string,save:(name:string,value:unknown)=>void)=>Promise<void>){
 expect(['red-v1','green-v1'],'T1341_PHASE_REQUIRED').toContain(phase);expect(fs.realpathSync(base)).toBe(base);
 const root=path.join(base,phase,'cases',name);fs.mkdirSync(root,{recursive:true,mode:0o700});for(const dir of ['tmp','media','workspaces'])fs.mkdirSync(path.join(root,dir),{mode:0o700});
 const save=(n:string,v:unknown)=>fs.writeFileSync(path.join(root,n+'.json'),JSON.stringify(v,null,2)+'\n');
 const key=path.join(root,'fixture-application-key');fs.writeFileSync(key,randomBytes(32).toString('base64'),{mode:0o600,flag:'wx'});
 for(const[k,v]of Object.entries({DATABASE_URL:'',PGLITE_DATA_DIR:path.join(root,'db'),CREATOROS_MASTER_KEY:'',CREATOROS_MASTER_KEY_FILE:key,CREATOROS_MASTER_KEY_FD:'',CREATOROS_STORAGE:'local',CREATOROS_MEDIA_ROOT:path.join(root,'media'),CREATOROS_WORKSPACES_ROOT:path.join(root,'workspaces'),CREATOROS_DISABLE_BACKGROUND_DRIVERS:'1',CREATOROS_DISABLE_SCHEDULER:'1',CREATOROS_CLIENT_CONFIG_PULL_ENABLED:'0',CREATOROS_WIN_VIDEO_TUTOR_SKILL_PATH:path.join(root,'missing-owned-skill'),TMPDIR:path.join(root,'tmp'),TMP:path.join(root,'tmp'),TEMP:path.join(root,'tmp')}))vi.stubEnv(k,v);
 const nonce=randomBytes(32).toString('hex');vi.stubEnv('CREATOROS_SIDECAR_HANDSHAKE_TOKEN',nonce);vi.stubEnv('CREATOROS_HANDSHAKE_REQUIRED','1');__resetPersistenceForTests();owned.db=null;owned.network=[];owned.children=[];
 vi.stubGlobal('fetch',async(input:unknown)=>{owned.network.push(typeof input==='string'?new URL(input,'http://127.0.0.1').origin:'non-string');throw Error('T1341_NO_NETWORK_OR_MODEL');});
 const started=Date.now(),deadline=started+3600000,requests:any[]=[],cleanup:any={persistence:'NOT_CREATED'};
 let user:RequestContext={userId:'NOT_INITIALIZED',requestId:'t1341-owned',source:'user'};
 const call:Call=async(e,input={},ctx=user)=>{const left=deadline-Date.now();if(!Number.isFinite(left)||left<120000)throw Error('ORIGINAL_DEADLINE_NO_RETRY');const parsed={...input,...(e.params?{params:e.params.parse(input.params)}:{}),...(e.query?{query:e.query.parse(input.query)}:{}),...(e.body?{body:e.body.parse(input.body)}:{})};const row:any={id:e.id,scope:{userId:ctx.userId,groupId:ctx.groupId??null,accountId:ctx.accountId??null},input:e.id==='assets.uploads.create'?{...parsed}:parsed};requests.push(row);let timer:ReturnType<typeof setTimeout>|undefined;
  try{const reply:any=await Promise.race([compositeTransport.request(e,parsed,ctx),new Promise<never>((_,reject)=>{timer=setTimeout(()=>reject(Error('ORIGINAL_REQUEST_OBSERVATION_EXPIRED_NO_RETRY')),Math.min(180000,left));})]);if(e.isList)for(const item of reply.data)e.response.parse(item);else e.response.parse(reply.data);row.data=e.id==='assets.uploads.create'?{uploadId:reply.data.uploadId,assetId:reply.data.assetId,expiresAt:reply.data.expiresAt,signedUrlOmitted:true}:e.id==='assets.downloadUrl'?{fileName:reply.data.fileName,signedUrlOmitted:true}:reply.data;return reply.data;}catch(error){row.error=failure(error);throw error;}finally{if(timer)clearTimeout(timer);}};
 try{user={...await(await getIdentityService()).resolveLocalContext(),accountId:null,source:'user'};cleanup.persistence='CREATED';await body(call,user,root,nonce,save);}
 finally{try{const db=owned.db as Db|null;if(db)save('TASKS_AND_IO',{ai:await db.select().from(aiTasks),executions:await db.select().from(executionTasks),calls:await db.select().from(executionCalls),network:owned.network,children:owned.children,automaticTasksNotSuppressed:true});save('PUBLIC_REQUESTS',requests);save('BUDGET',{startedAt:new Date(started).toISOString(),originalDeadlineAt:new Date(deadline).toISOString(),caseSeconds:3600,requestMs:180000,retry:0});}
  finally{try{const dispose=(globalThis as {__creatorosDisposePersistence?:()=>Promise<void>}).__creatorosDisposePersistence;if(typeof dispose==='function'){await dispose();cleanup.persistence='DISPOSED';}else if(cleanup.persistence==='CREATED')cleanup.persistence='DISPOSE_NOT_AVAILABLE';}finally{owned.db=null;__resetPersistenceForTests();vi.unstubAllGlobals();vi.unstubAllEnvs();save('CLEANUP',cleanup);}}}
}
async function upload(call:Call,ctx:RequestContext,nonce:string,bytes:Buffer,name:string,type:'image'|'document'='image'){
 const mimeType=type==='image'?'image/png':'text/plain';const upload=await call(ENDPOINTS.createUpload,{body:{assetType:type,mimeType,fileSize:bytes.length,fileName:type==='image'?'中性图形.png':'无标签原件.txt'}},ctx),url=new URL(upload.uploadUrl,'http://127.0.0.1');expect(url.pathname.startsWith('/api/v1/blob/')).toBe(true);
 const {PUT}=await import('@/app/api/v1/blob/[...key]/route');const put=await PUT(new Request(url,{method:'PUT',headers:{...(ctx.groupId?{'x-group-id':ctx.groupId}:{}),...(ctx.accountId?{'x-account-id':ctx.accountId}:{}),'x-creatoros-handshake':nonce},body:Uint8Array.from(bytes).buffer}),{params:Promise.resolve({key:url.pathname.slice('/api/v1/blob/'.length).split('/')})});expect(put.status).toBe(200);
 const asset=await call(ENDPOINTS.completeUpload,{params:{uploadId:upload.uploadId},body:{name}},ctx);return asset;
}
function neutralImage(){const bytes=fs.readFileSync(path.resolve('../docs/verification/t1314/runs/resumed-7790/image/neutral-input.png'));expect(sha(bytes)).toBe('2a748e75ed4513a49fdf9072a549add1dcda06099286cb76be44975bc127b1df');return bytes;}
async function vm(_call:Call,ctx:RequestContext){return buildAssetsViewModelReal(createServerClient(ctx) as unknown as AssetsDataClient);}
function summaries(dto:any){return dto.tags as Array<{id:string;name:string}>|null|undefined;}
function panel(summary:any){return renderToStaticMarkup(React.createElement(AssetDetailPanel,{asset:summary,usageHistory:[]}));}
it('真实公开上传/标签挂载→list/get/search→真实selector/详情，0模型',async()=>{
 await lifecycle('projection',async(call,user,root,nonce,save)=>{
  const group=await call(ENDPOINTS.createAccountGroup,{body:{name:'T1341真实标签读取',idempotencyKey:'t1341-'+phase+'-projection'}}),ctx={...user,groupId:group.id,groupVersion:group.version,accountId:null};expect(await getStorageRootForRequest(ctx)).toBe(path.join(root,'media'));
  const bytes=neutralImage(),asset=await upload(call,ctx,nonce,bytes,'中性真实标签原图'),empty=await upload(call,ctx,nonce,Buffer.from('人工中性无标签资料；不是真实业务事实。'),'无标签资料','document');
  const one=await call(ENDPOINTS.createTag,{body:{name:'中文来源核对',kind:'asset-usage'}},ctx),two=await call(ENDPOINTS.createTag,{body:{name:'原图保真',kind:'asset-usage'}},ctx);
  const assignments=await call(ENDPOINTS.assignTags,{body:{entityType:'asset',entityId:asset.id,tagIds:[one.id,two.id]}},ctx),tags=await call(ENDPOINTS.listTagsForEntity,{query:{entityType:'asset',entityId:asset.id}},ctx);
  const direct=await call(ENDPOINTS.getAsset,{params:{assetId:asset.id}},ctx),list=await call(ENDPOINTS.listAssets,{query:{page:1,pageSize:100}},ctx),page1=await call(ENDPOINTS.listAssets,{query:{page:1,pageSize:1}},ctx),page2=await call(ENDPOINTS.listAssets,{query:{page:2,pageSize:1}},ctx),search=await call(ENDPOINTS.searchAssets,{query:{query:'中性真实标签',limit:100}},ctx),data=await vm(call,ctx);
  const all=data.state==='ready'?data.viewModel.assets:[];const selected=all.find((x:any)=>x.id===asset.id),emptySummary=all.find((x:any)=>x.id===empty.id),html=selected?panel(selected):'';
  const download=await call(ENDPOINTS.getDownloadUrl,{params:{assetId:asset.id}},ctx),downloadUrl=new URL(download.url,'http://127.0.0.1'),{GET}=await import('@/app/api/v1/blob/[...key]/route');const file=await GET(new Request(downloadUrl,{headers:{'x-group-id':ctx.groupId!,'x-creatoros-handshake':nonce}}),{params:Promise.resolve({key:downloadUrl.pathname.slice('/api/v1/blob/'.length).split('/')})});expect(file.status).toBe(200);expect(sha(Buffer.from(await file.arrayBuffer()))).toBe(sha(bytes));
  save('ACTUAL_PUBLIC_CHAIN',{ctx,asset,empty,one,two,assignments,tags,direct,list,page1,page2,search,data,detailHtml:html,download:{status:file.status,checksum:sha(bytes)},sourceMode:'真实公开人工输入；SSR详情consumer不是浏览器像素'});
  const expected=[one,two].map(({id,name})=>({id,name}));expect(tags.map((t:any)=>({id:t.id,name:t.name}))).toEqual(expected);expect.soft(summaries(direct),'get真实摘要').toEqual(expected);expect.soft(summaries(list.find((x:any)=>x.id===asset.id)),'list真实摘要').toEqual(expected);expect.soft(summaries(search.items.find((x:any)=>x.id===asset.id)),'search真实摘要').toEqual(expected);expect.soft(summaries(list.find((x:any)=>x.id===empty.id)),'真实无标签').toEqual([]);expect(page1[0].id).not.toBe(page2[0].id);expect.soft(selected?.tags,'real selector').toEqual(expected.map(t=>t.name));expect.soft(emptySummary?.tags).toEqual([]);expect.soft(html,'详情真实consumer').toContain(one.name);expect.soft(html).toContain(two.name);
  expect(owned.network).toEqual([]);expect(owned.children).toEqual([]);
 });
},3600000);
it('真实迁移共享授权→读取标签/写保护→公开撤销→目标不可读',async()=>{
 await lifecycle('shared',async(call,user,root,nonce,save)=>{
  const origin=await call(ENDPOINTS.createAccountGroup,{body:{name:'T1341资源原组',idempotencyKey:'t1341-'+phase+'-origin'}}),target=await call(ENDPOINTS.createAccountGroup,{body:{name:'T1341共享组',idempotencyKey:'t1341-'+phase+'-target'}}),other=await call(ENDPOINTS.createAccountGroup,{body:{name:'T1341无授权组',idempotencyKey:'t1341-'+phase+'-other'}});
  let a={...user,groupId:origin.id,groupVersion:origin.version,accountId:null},b={...user,groupId:target.id,groupVersion:target.version,accountId:null};const c={...user,groupId:other.id,groupVersion:other.version,accountId:null};
  const asset=await upload(call,a,nonce,neutralImage(),'共享中性PNG'),tag=await call(ENDPOINTS.createTag,{body:{name:'共享原资源标签'}},a);await call(ENDPOINTS.assignTags,{body:{entityType:'asset',entityId:asset.id,tagIds:[tag.id]}},a);
  const project=await call(ENDPOINTS.createProject,{body:{title:'迁移的真实素材引用'}},a),output=await call(ENDPOINTS.createOutput,{params:{projectId:project.id},body:{title:'人工引用稿'}},a);await call(ENDPOINTS.patchOutput,{params:{outputId:output.id},body:{primaryAssetId:asset.id}},a);
  const selection={fromGroupId:origin.id,toGroupId:target.id,projectIds:[project.id],knowledgeIds:[],conversationIds:[]},preview=await call(ENDPOINTS.previewAccountGroupMigration,{body:selection},a),migration=await call(ENDPOINTS.applyAccountGroupMigration,{body:{...selection,digest:preview.digest,idempotencyKey:'t1341-move'}},a);
  a={...a,groupVersion:(await call(ENDPOINTS.getAccountGroup,{params:{groupId:origin.id}})).version};b={...b,groupVersion:(await call(ENDPOINTS.getAccountGroup,{params:{groupId:target.id}})).version};
  const grants=await call(ENDPOINTS.listGroupResourceGrants,{},b),grant=grants.find((x:any)=>x.resourceType==='asset'&&x.resourceId===asset.id);expect(grant).toBeTruthy();
  const direct=await call(ENDPOINTS.getAsset,{params:{assetId:asset.id}},b),list=await call(ENDPOINTS.listAssets,{query:{page:1,pageSize:100}},b),tags=await call(ENDPOINTS.listTagsForEntity,{query:{entityType:'asset',entityId:asset.id}},b),data=await vm(call,b);
  await expect(call(ENDPOINTS.assignTags,{body:{entityType:'asset',entityId:asset.id,tagIds:[tag.id]}},b)).rejects.toThrow();await expect(call(ENDPOINTS.removeAssignment,{body:{entityType:'asset',entityId:asset.id,tagId:tag.id}},b)).rejects.toThrow();await expect(call(ENDPOINTS.getAsset,{params:{assetId:asset.id}},c)).rejects.toThrow();await expect(call(ENDPOINTS.getAsset,{params:{assetId:asset.id}},{...b,userId:'t1341-foreign-user'})).rejects.toThrow();
  // 原迁移引用移除后才按真实canRevoke办理；不清ledger或种grant。
  await call(ENDPOINTS.patchOutput,{params:{outputId:output.id},body:{primaryAssetId:null}},b);const revokePreview=await call(ENDPOINTS.previewGroupResourceGrantRevoke,{params:{grantId:grant.id}},a);save('REVOKE_PRECONDITION',{preview,revokePreview,migration,grants});expect(revokePreview.canRevoke).toBe(true);
  const revoked=await call(ENDPOINTS.revokeGroupResourceGrant,{params:{grantId:grant.id},body:{digest:revokePreview.digest,expectedOriginVersion:revokePreview.originVersion,expectedTargetVersion:revokePreview.targetVersion}},a),after=await call(ENDPOINTS.listAssets,{query:{page:1,pageSize:100}},b);expect(revoked.revokedAt).toBeTruthy();expect(after.some((x:any)=>x.id===asset.id)).toBe(false);await expect(call(ENDPOINTS.getAsset,{params:{assetId:asset.id}},b)).rejects.toThrow();
  save('ACTUAL_SHARED_CHAIN',{origin:a,target:b,asset,tag,preview,migration,grants,direct,list,tags,data,revoked,after});const expected=[{id:tag.id,name:tag.name}];expect(tags.map((x:any)=>({id:x.id,name:x.name}))).toEqual(expected);expect.soft(summaries(direct),'合法grant get摘要').toEqual(expected);expect.soft(summaries(list.find((x:any)=>x.id===asset.id)),'合法grant list摘要').toEqual(expected);expect.soft(data.state==='ready'?data.viewModel.assets.find((x:any)=>x.id===asset.id)?.tags:null,'合法grant real selector').toEqual([tag.name]);expect(owned.network).toEqual([]);expect(owned.children).toEqual([]);
 });
},3600000);
