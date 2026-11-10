import {describe,expect,it,vi} from 'vitest';
import type {RequestContext} from '@creatoros/contract';
import {createDraftBundleRoot,draftBundleIdempotencyKey,type DraftBundlePorts} from './draft-bundle-root';

const ctx:RequestContext={userId:'u',groupId:'g-small',accountId:null,requestId:'r',source:'user'};
const request={schemaVersion:1 as const,scope:{groupId:'g-small',accountId:null},idea:'用AI一句话出成稿包',workKind:'article' as const,clientRequestId:'request-1'};
function harness(){
 const saved=new Map<string,unknown>();const saves:string[]=[];let id=0;
 const ports={
  now:()=>'2026-11-10T04:00:00.000Z',nextId:(p:string)=>`${p}-${++id}`,
  store:{load:vi.fn(async(_c:RequestContext,key:string)=>saved.get(key)??null),save:vi.fn(async(_c:RequestContext,r:any)=>{saved.set(r.idempotencyKey,structuredClone(r));saves.push(Object.entries(r.stages).map(([k,v]:any)=>`${k}:${v.status}`).join(','));})},
  projects:{create:vi.fn(async()=>({projectId:'p1'}))},
  titles:{generate:vi.fn(async()=>({titles:[{text:'标题甲',angle:'结果先行'},{text:'标题乙'},{text:'标题丙'}],sources:[{knowledgeId:'k1',title:'选题三问'}]}))},
  script:{draft:vi.fn(async()=>({outputId:'script-o',versionId:'script-v1',sources:[{knowledgeId:'k1',title:'选题三问'},{knowledgeId:'k2',title:'开头给结果'}]}))},
  work:{create:vi.fn(async()=>({outputId:'article-o',versionId:'article-v1'}))},
  cover:{brief:vi.fn(async()=>({headline:'封面',composition:'居中'}))},
  publication:{generate:vi.fn(async(_c:RequestContext,input:{title:string})=>({title:input.title,description:'简介',tags:['AI']}))},
 } satisfies DraftBundlePorts;
 return {ports,saved,saves,root:createDraftBundleRoot(ports)};
}
describe('第三批步骤4：成稿包编排根',()=>{
 it('按段顺序跑完到待决定；每段起止都落地；来源汇总去重；不含发布能力',async()=>{
  const {root,ports,saves}=harness();
  const result=await root.start(ctx,request);
  expect(result.status).toBe('awaiting_decision');expect(result.projectId).toBe('p1');
  expect(result.work).toEqual({kind:'article',outputId:'article-o',versionId:'article-v1'});
  expect(result.publication).toMatchObject({title:'标题甲',basedOnTitle:'标题甲'});
  expect(result.knowledgeSources.map(s=>s.knowledgeId)).toEqual(['k1','k2']);
  expect(saves.length).toBeGreaterThanOrEqual(13);expect(saves[1]).toContain('project:running');expect(saves[2]).toContain('project:done');
  expect(ports.script.draft).toHaveBeenCalledWith(ctx,expect.objectContaining({projectId:'p1',title:'标题甲'}));
  expect(Object.keys(ports)).not.toContain('publish');
 });
 it('同账号同想法（空白不同）幂等：同一包，不重复建项目',async()=>{
  const {root,ports}=harness();
  const first=await root.start(ctx,request);const second=await root.start(ctx,{...request,idea:' 用AI一句话出成稿包  ',clientRequestId:'request-2'});
  expect(second.bundleId).toBe(first.bundleId);expect(ports.projects.create).toHaveBeenCalledTimes(1);
  expect(draftBundleIdempotencyKey('u',request)).not.toBe(draftBundleIdempotencyKey('u',{...request,scope:{groupId:'g-main',accountId:null}}));
 });
 it('中途失败只标该段，已落地段保留；续跑从失败段继续',async()=>{
  const {root,ports}=harness();
  ports.work.create.mockRejectedValueOnce(new Error('成稿接口超时'));
  const failed=await root.start(ctx,request);
  expect(failed.status).toBe('failed');expect(failed.stages.work).toMatchObject({status:'failed',attempts:1,error:'成稿接口超时'});
  expect(failed.stages.script.status).toBe('done');expect(failed.script).not.toBeNull();expect(failed.cover).toBeNull();
  const resumed=await root.resume(ctx,failed.idempotencyKey);
  expect(resumed.status).toBe('awaiting_decision');expect(resumed.stages.work.attempts).toBe(2);
  expect(ports.projects.create).toHaveBeenCalledTimes(1);expect(ports.script.draft).toHaveBeenCalledTimes(1);
 });
 it('只按所选账号/组写入：上下文不一致或读回的包属于别的组都拒绝',async()=>{
  const {root,ports}=harness();
  await expect(root.start({...ctx,groupId:'g-main'},request)).rejects.toThrow('所选账号');
  expect(ports.projects.create).not.toHaveBeenCalled();
  const made=await root.start(ctx,request);
  await expect(root.read({...ctx,groupId:'g-main'},made.idempotencyKey)).rejects.toThrow('所选账号');
 });
 it('改选标题只重写发布物料，口播和成稿不动',async()=>{
  const {root,ports}=harness();
  const made=await root.start(ctx,request);
  const picked=await root.selectTitle(ctx,made.idempotencyKey,1);
  expect(picked.decisions.title).toBe('decided');expect(picked.publication).toMatchObject({title:'标题乙',basedOnTitle:'标题乙'});
  expect(ports.publication.generate).toHaveBeenCalledTimes(2);
  expect(ports.script.draft).toHaveBeenCalledTimes(1);expect(ports.work.create).toHaveBeenCalledTimes(1);expect(ports.cover.brief).toHaveBeenCalledTimes(1);
  expect(picked.script).toEqual(made.script);
 });
 it('三处决定齐全才到 READY；READY 后再改决定会退回待决定',async()=>{
  const {root}=harness();
  const made=await root.start(ctx,request);
  await expect(root.markReady(ctx,made.idempotencyKey)).rejects.toThrow('请先选标题');
  await root.selectTitle(ctx,made.idempotencyKey,0);await root.decideContent(ctx,made.idempotencyKey,'adopted');
  const ready=await root.markReady(ctx,made.idempotencyKey);
  expect(ready.status).toBe('ready');expect(ready.decisions).toEqual({title:'decided',content:'adopted',release:'ready'});
  const again=await root.decideContent(ctx,made.idempotencyKey,'rewrite');
  expect(again.status).toBe('awaiting_decision');expect(again.decisions.release).toBe('pending');
 });
});
