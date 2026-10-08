import {beforeEach,afterEach,describe,it,expect} from 'vitest';
import {readFileSync} from 'node:fs';
import {createDb,type RequestContext} from '@creatoros/backend';
import {createBenchmarkService} from './benchmark.service';
import {createTrendSourcesService} from '../trend-sources/trend-sources.service';
import {createFavoritesService} from '../favorites/favorites.service';
import {createTopicAttributionService} from '../topic-attribution/topic-attribution.service';
import {createMembershipLockService} from '../platform-account/membership-lock.service';
const NOW='2026-10-04T00:00:00.000Z',page={page:1,pageSize:100};
const a:RequestContext={userId:'owner',groupId:'ga',accountId:null,requestId:'research',source:'user'};
let store:Awaited<ReturnType<typeof createDb>>,n=0;
function services(){
 const deps={db:store.db,now:()=>NOW,nextId:(prefix:string)=>`${prefix}-${++n}`,membership:createMembershipLockService(store.db),assertCollectionAccount:async(ctx:RequestContext)=>{const q=await store.client.query('SELECT id FROM platform_accounts WHERE id=$1 AND user_id=$2 AND platform=$3',[ctx.accountId,ctx.userId,'douyin']);if(!q.rows.length)throw new Error('真实抖音账号不存在');},resolvePublication:async(ctx:RequestContext,id:string)=>{const q=await store.client.query('SELECT account_id AS "accountId",group_id AS "groupId" FROM publications WHERE id=$1 AND user_id=$2 AND group_id=$3',[id,ctx.userId,ctx.groupId]);return q.rows[0]??null;}};
 return {benchmark:createBenchmarkService(deps as any),trend:createTrendSourcesService(deps),favorites:createFavoritesService(deps as any),attribution:createTopicAttributionService(deps as any)};
}
beforeEach(async()=>{
 store=await createDb();n=0;
 // 未注册本子任务 SQL 时可运行真正 RED；GREEN 时读专属 SQL，不改全局 journal。
 const sql=new URL('../../../drizzle/0113_group_research_sources.sql',import.meta.url);
 try{await store.client.exec(readFileSync(sql,'utf8'));}catch(e){if((e as NodeJS.ErrnoException).code!=='ENOENT')throw e;}
 await store.client.exec(`INSERT INTO account_groups(id,user_id,name,created_at,updated_at) VALUES('ga','owner','甲','${NOW}','${NOW}'),('gb','owner','乙','${NOW}','${NOW}');
 INSERT INTO platform_accounts(id,user_id,platform,account_handle,created_at,updated_at) VALUES('aa','owner','douyin','甲号','${NOW}','${NOW}'),('ab','owner','douyin','乙号','${NOW}','${NOW}');
 INSERT INTO account_group_memberships(id,user_id,group_id,platform_account_id,joined_at) VALUES('ma','owner','ga','aa','${NOW}'),('mb','owner','ga','ab','${NOW}');
 INSERT INTO publications(id,user_id,group_id,account_id,content_output_id,platform,account_reference,status,created_at,updated_at) VALUES('pub','owner','ga','aa','output','douyin','甲号','published','${NOW}','${NOW}');`);
});
afterEach(async()=>store.client.close());
describe('T-1022 组内研究资料',()=>{
 it('空组可登记网页信源与对标，同组切实际账号不隐藏或重复资料',async()=>{
  const {trend,benchmark}=services();
  const x=await trend.createSource(a,{url:'https://example.org/news'});
  const y=await trend.createSource({...a,accountId:'aa'},{url:'https://example.org/news'});
  expect(y.id).toBe(x.id);expect(x.accountId).toBeNull();
  expect((await trend.listSources({...a,accountId:'ab'},page)).total).toBe(1);
  const source=await benchmark.createSource(a,{externalAccountId:'external-author'});
  expect((await benchmark.listSources({...a,accountId:'ab'},page)).rows[0]?.id).toBe(source.id);
 });
 it('跨组/用户不能修改资料；归档组只读',async()=>{
  const {trend}=services(),source=await trend.createSource(a,{url:'https://example.org/news'});
  await expect(trend.toggleSource({...a,groupId:'gb'},source.id,false)).rejects.toMatchObject({name:'OwnershipError'});
  await expect(trend.removeSource({...a,userId:'foreign'},source.id)).rejects.toMatchObject({name:'OwnershipError'});
  await store.client.exec("UPDATE account_groups SET status='archived' WHERE id='ga'");
  expect((await trend.listSources(a,page)).total).toBe(1);
  await expect(trend.createSource(a,{url:'https://example.org/other'})).rejects.toThrow();
 });
 it('对标作品由已验证信源继承组，跨组父ID拒绝',async()=>{
  const {benchmark}=services(),source=await benchmark.createSource(a,{externalAccountId:'author'});
  const input={sourceId:source.id,sourceExternalAccountId:'author',awemeId:'video',diggCount:10,isViral:false,capturedAt:NOW};
  await benchmark.recordWork(a,input);
  expect((await benchmark.listWorks({...a,accountId:'ab'},{limit:100,offset:0})).total).toBe(1);
  await expect(benchmark.recordWork({...a,groupId:'gb'},input)).rejects.toMatchObject({name:'OwnershipError'});
 });
 it('收藏登记必须选真实账号；组内共享内容不允许采集器借另一个账号访问收藏',async()=>{
  const {favorites}=services();await expect(favorites.createFolder(a,{name:'选题库'})).rejects.toThrow();
  const target={...a,accountId:'aa'},folder=await favorites.createFolder(target,{name:'选题库'});
  await favorites.recordItems(target,folder.id,[{awemeId:'favorite',title:'素材',authorNickname:'作者',url:'https://douyin.com/video/favorite'}]);
  expect((await favorites.listFolders(a,page)).total).toBe(1);
  expect(await favorites.listPendingItems({...a,accountId:'ab'},20)).toHaveLength(1);
  expect(await favorites.listItemsForDistill({...a,accountId:'ab'},20,{collectorAccountOnly:true})).toHaveLength(0);
  expect(await favorites.listItemsForDistill(a,20)).toHaveLength(1);
  await expect(favorites.recordItems({...a,accountId:'ab'},folder.id,[{awemeId:'wrong',title:'',authorNickname:'',url:''}])).rejects.toThrow();
 });
 it('归因保存校验冻结发布组及真实账号，组内切平台读共享',async()=>{
  const {attribution}=services();const input={publicationId:'pub',performanceTier:'normal',topicType:'教程',hookType:'反差',structureFormula:'三步教程'};
  await attribution.saveAttribution(a,input);
  expect((await attribution.listAttributions({...a,accountId:'ab'},page)).total).toBe(1);
  await expect(attribution.saveAttribution({...a,groupId:'gb'},input)).rejects.toMatchObject({name:'OwnershipError'});
 });
 it('legacy 初始化组注册保留真实来源账号，触发器回填后重复注册与组读取仍幂等',async()=>{
  await store.client.exec(`INSERT INTO account_groups(id,user_id,name,created_at,updated_at) VALUES('grp_legacy_aa','owner','旧入口','${NOW}','${NOW}'); UPDATE account_group_memberships SET group_id='grp_legacy_aa' WHERE id='ma';
  DROP TRIGGER IF EXISTS legacy_shared_group_stamp ON trend_sources;
  CREATE TRIGGER legacy_shared_group_stamp BEFORE INSERT ON trend_sources FOR EACH ROW EXECUTE FUNCTION creatoros_stamp_legacy_shared_group();`);
  const {trend}=services(),legacy={...a,groupId:undefined,accountId:'aa'};
  const first=await trend.createSource(legacy,{url:'https://example.org/legacy'}),again=await trend.createSource(legacy,{url:'https://example.org/legacy',name:'更新名称'});
  expect(again.id).toBe(first.id);expect(first.accountId).toBe('aa');
  expect((await trend.listSources({...a,groupId:'grp_legacy_aa'},page)).rows).toHaveLength(1);
 });
 it('收藏采集重验成员版本；0113 重复应用不迁移冻结内容',async()=>{
  const {favorites}=services(),target={...a,accountId:'aa'},folder=await favorites.createFolder(target,{name:'组内收藏'});
  await favorites.recordItems(target,folder.id,[{awemeId:'fixed',title:'',authorNickname:'',url:''}]);
  await store.client.exec("UPDATE account_group_memberships SET group_id='gb',version=2 WHERE id='ma'");
  await expect(favorites.recordItems(target,folder.id,[{awemeId:'later',title:'',authorNickname:'',url:''}])).rejects.toThrow();
  const sql=readFileSync(new URL('../../../drizzle/0113_group_research_sources.sql',import.meta.url),'utf8');await store.client.exec(sql);await store.client.exec(sql);
  expect(await favorites.listPendingItems(a,20)).toHaveLength(1);
  expect(await favorites.listPendingItems({...a,groupId:'gb'},20)).toHaveLength(0);
 });

});
