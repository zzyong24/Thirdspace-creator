import {describe,it,expect} from 'vitest';
import {draftBundleRequest,draftBundleResult,knowledgeSources,nextDraftBundleStage,draftBundlePublicationStale,DRAFT_BUNDLE_STAGES,DRAFT_BUNDLE_TITLE_CHANGE_REGENERATES} from '../src/resources/draft-bundle';
const key='a'.repeat(64);
const stages=(done:number)=>Object.fromEntries(DRAFT_BUNDLE_STAGES.map((stage,index)=>[stage,{status:index<done?'done':'pending'}]));
const base=(over:Record<string,unknown>={})=>({kind:'bundle.draft',schemaVersion:1,bundleId:'b1',idempotencyKey:key,scope:{groupId:'g',accountId:null},idea:'一句话想法',workKind:'article',stages:stages(0),decisions:{},status:'running',updatedAt:'2026-11-10T03:00:00.000Z',...over});
describe('第三批成稿包合同',()=>{
 it('请求必须选定账号或组，想法去空白后至少2字',()=>{
  expect(draftBundleRequest.safeParse({schemaVersion:1,scope:{groupId:null,accountId:null},idea:'想法想法',workKind:'article',clientRequestId:'request-1'}).success).toBe(false);
  expect(draftBundleRequest.safeParse({schemaVersion:1,scope:{groupId:null,accountId:'a'},idea:'  x ',workKind:'image',clientRequestId:'request-1'}).success).toBe(false);
  expect(draftBundleRequest.parse({schemaVersion:1,scope:{groupId:null,accountId:'a'},idea:' 想法 ',workKind:'image',clientRequestId:'request-1'}).idea).toBe('想法');
 });
 it('旧结果没有 knowledgeSources 时补空数组；来源按 knowledgeId 去重',()=>{
  const parsed=draftBundleResult.parse(base());
  expect(parsed.knowledgeSources).toEqual([]);expect(parsed.titles).toBeNull();expect(parsed.stages.project).toEqual({status:'pending',taskId:null,attempts:0,error:null});
  expect(knowledgeSources.parse([{knowledgeId:'k',title:'甲'},{knowledgeId:'k',title:'甲'}])).toHaveLength(1);
 });
 it('标题必须正好3条；未出标题不能选；没有已发布状态',()=>{
  expect(draftBundleResult.safeParse(base({titles:[{text:'一'},{text:'二'}]})).success).toBe(false);
  expect(draftBundleResult.safeParse(base({selectedTitleIndex:0})).success).toBe(false);
  expect(draftBundleResult.safeParse(base({status:'published'})).success).toBe(false);
 });
 it('三处决定未完成不能 READY；成稿类型必须与请求一致',()=>{
  const titles=[{text:'一'},{text:'二'},{text:'三'}];
  expect(draftBundleResult.safeParse(base({titles,selectedTitleIndex:0,status:'ready',decisions:{title:'decided',content:'adopted'}})).success).toBe(false);
  expect(draftBundleResult.safeParse(base({titles,selectedTitleIndex:0,status:'ready',decisions:{title:'decided',content:'adopted',release:'ready'}})).success).toBe(true);
  expect(draftBundleResult.safeParse(base({work:{kind:'image',outputId:'o',versionId:'v'}})).success).toBe(false);
 });
 it('断点续跑从第一个未完成段开始；改选标题只联动发布物料',()=>{
  expect(nextDraftBundleStage(draftBundleResult.parse(base({stages:stages(3)})).stages)).toBe('work');
  expect(nextDraftBundleStage(draftBundleResult.parse(base({stages:stages(6)})).stages)).toBeNull();
  expect(DRAFT_BUNDLE_TITLE_CHANGE_REGENERATES).toEqual(['publication']);
  const titles=[{text:'一'},{text:'二'},{text:'三'}],publication={title:'一',description:'',tags:[],basedOnTitle:'一'};
  expect(draftBundlePublicationStale({titles:titles.map(t=>({...t,angle:''})),selectedTitleIndex:0,publication})).toBe(false);
  expect(draftBundlePublicationStale({titles:titles.map(t=>({...t,angle:''})),selectedTitleIndex:1,publication})).toBe(true);
 });
});
