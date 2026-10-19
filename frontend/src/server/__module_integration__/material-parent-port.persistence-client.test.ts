// @vitest-environment node
import {expect,it,vi} from 'vitest';
import {mkdtemp,rm} from 'node:fs/promises';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {ENDPOINTS,type Endpoint,type RequestContext} from '@creatoros/contract';

// 只限制测试媒体目录；候选夹具经原AI service提交，正式采纳/项目/知识/用料服务均真实。
const held=vi.hoisted(()=>({root:''}));
vi.mock('@creatoros/backend/modules/assets',async original=>{
 const actual=await original<typeof import('@creatoros/backend/modules/assets')>();
 return {...actual,migrateStorageRoot:async()=>{throw Error('本测试禁止迁移用户媒体目录');},
  createLocalFsObjectStorage:(...args:Parameters<typeof actual.createLocalFsObjectStorage>)=>actual.createLocalFsObjectStorage({...args[0],rootPath:held.root},args[1])};
});
import {compositeTransport,getChatRuntime,__resetPersistenceForTests} from '@/server/persistence-client';
async function call<E extends Endpoint>(ctx:RequestContext,endpoint:E,params?:unknown,body?:unknown,query?:unknown):Promise<E['response']['_output']>{
 const response=await compositeTransport.request(endpoint,{params,body,query} as never,ctx) as {data:unknown};
 return endpoint.response.parse(response.data);
}
async function list<E extends Endpoint>(ctx:RequestContext,endpoint:E,query:unknown):Promise<E['response']['_output'][]> {
 const response=await compositeTransport.request(endpoint,{query} as never,ctx) as {data:unknown};
 if(!Array.isArray(response.data))throw Error('原公开列表必须返回数组');
 return response.data.map(row=>endpoint.response.parse(row));
}
it.each(['legacy','group','group-account'] as const)('原研究候选→公共confirm→真实知识/项目用料读回与幂等 scope=%s',async scope=>{
 const directory=await mkdtemp(join(tmpdir(),'creatoros-material-parent-'));held.root=join(directory,'media');
 vi.stubEnv('DATABASE_URL','');vi.stubEnv('PGLITE_DATA_DIR',join(directory,'db'));vi.stubEnv('CREATOROS_STORAGE','local');__resetPersistenceForTests();
 const user:RequestContext={userId:'material-parent-test-user',requestId:'material-parent-test',source:'user'};
 let ctx:RequestContext={...user,accountId:'material-parent-legacy-account'};
 try{
  if(scope==='legacy'){const account=await call(user,ENDPOINTS.createAccount,undefined,{platform:'douyin',accountHandle:'真实隔离旧入口',idempotencyKey:'research-parent-legacy-account'});ctx={...ctx,accountId:account.id};}
  if(scope!=='legacy'){
   const group=await call(user,ENDPOINTS.createAccountGroup,undefined,{name:'隔离研究组',idempotencyKey:'research-parent-group'});
   ctx={...user,groupId:group.id,groupVersion:group.version,accountId:null};
   if(scope==='group-account'){
    const account=await call(ctx,ENDPOINTS.createAccount,undefined,{platform:'xiaohongshu',accountHandle:'隔离研究账号',idempotencyKey:'research-parent-account'});
    ctx={...ctx,accountId:account.id};
   }
  }
  const project=await call(ctx,ENDPOINTS.createProject,undefined,{title:'研究采纳项目返回值',brief:'候选夹具，不代签真实模型'});
  const runtime=await getChatRuntime();
  const task=await runtime.ai.createTask(ctx,{taskType:'research.gather_material',inputData:{projectId:project.id,topic:'测试原用料事务'}});
  await runtime.ai.recordCandidate(ctx,task.id,{resultType:'material_list',resultData:{items:[
   {title:'明确候选A',source:'模型夹具',why_relevant:'原候选正文A'},
   {title:'明确候选B',source:'模型夹具',why_relevant:'原候选正文B'},
  ]}});
  const linkQuery={projectId:project.id,page:1,pageSize:100};
  expect(await list(ctx,ENDPOINTS.listMaterialLinks,linkQuery)).toEqual([]);
  expect(await list(ctx,ENDPOINTS.listKnowledge,{page:1,pageSize:100})).toEqual([]);
  const foreignScopes=[{...ctx,groupId:'foreign-group'}, {...ctx,userId:'foreign-user'}];
  // 同组共享任务保留group边界；旧账号入口仍要求原account。
  if(scope==='legacy')foreignScopes.push({...ctx,accountId:'foreign-account'});
  for(const foreign of foreignScopes){
   await expect(call(foreign,ENDPOINTS.confirmTask,{taskId:task.id})).rejects.toThrow();
  }
  expect((await call(ctx,ENDPOINTS.getTask,{taskId:task.id})).status).toBe('awaiting_confirmation');
  expect(await list(ctx,ENDPOINTS.listKnowledge,{page:1,pageSize:100})).toEqual([]);
  expect((await call(ctx,ENDPOINTS.confirmTask,{taskId:task.id})).status).toBe('succeeded');
  const links=await list(ctx,ENDPOINTS.listMaterialLinks,linkQuery);
  expect(links).toHaveLength(2);expect(links.every(link=>link.projectId===project.id&&link.entityType==='knowledge'&&link.addedByType==='ai')).toBe(true);
  const knowledge=await Promise.all(links.map(link=>call(ctx,ENDPOINTS.getKnowledge,{knowledgeId:link.entityId})));
  expect(knowledge.map(item=>item.title).sort()).toEqual(['明确候选A','明确候选B']);
  expect(knowledge.every(item=>item.sourceType==='ai'&&item.sourceNote==='模型生成，未联网核实')).toBe(true);
  await call(ctx,ENDPOINTS.confirmTask,{taskId:task.id});
  expect(await list(ctx,ENDPOINTS.listMaterialLinks,linkQuery)).toEqual(links);
  expect(await list(ctx,ENDPOINTS.listKnowledge,{page:1,pageSize:100})).toHaveLength(2);
  await expect(list({...ctx,groupId:'foreign-group'},ENDPOINTS.listMaterialLinks,linkQuery)).rejects.toThrow();
 }finally{
  await(globalThis as {__creatorosDisposePersistence?:()=>Promise<void>}).__creatorosDisposePersistence?.();
  __resetPersistenceForTests();vi.unstubAllEnvs();await rm(directory,{recursive:true,force:true});
 }
},180000);
