import {createPlatformAccountService} from "../platform-account/platform-account.service";
import {afterEach,beforeEach,describe,expect,it} from 'vitest';
import {createDb} from '@creatoros/backend';
import type {RequestContext} from '@creatoros/contract';
import {createAccountGroupService} from '../platform-account/account-group.service';
import {createContentCalendarService} from './content-calendar.service';
import {projects} from '../../schema/projects';
let store:Awaited<ReturnType<typeof createDb>>,service:ReturnType<typeof createContentCalendarService>,a:RequestContext,b:RequestContext;
const now=()=> '2026-10-04T00:00:00.000Z';let seq=0;const user:RequestContext={userId:'calendar-user',requestId:'calendar-request',source:'user'};
beforeEach(async()=>{store=await createDb();seq=0;const nextId=(prefix:string)=>`${prefix}-${++seq}`;
 const groups=createAccountGroupService({db:store.db,now,nextId});a={...user,groupId:(await groups.create(user,{name:'A',idempotencyKey:'a'})).id};b={...user,groupId:(await groups.create(user,{name:'B',idempotencyKey:'b'})).id};
 await store.db.insert(projects).values({id:'group-calendar-project',userId:user.userId,accountId:null,groupId:a.groupId!,title:'组内创作',source:'manual',status:'active',currentStage:'script',creationMode:'manual',startedAt:now(),createdAt:now(),updatedAt:now()});
 service=createContentCalendarService({db:store.db,now,nextId,clock:{now},platformAccounts:{getAccount:async()=>({})},publishing:{isOutputPublished:async()=>false},candidates:{exists:async()=>false},notifications:{notify:async()=>{}},identity:{getEffectiveTimezone:async()=> 'UTC'},projects:{getScheduleProject:async(ctx,id)=>{if(ctx.groupId!==a.groupId)throw new Error('OwnershipError');return {id,title:'组内创作',status:'active',source:'manual',currentStage:'script',updatedAt:now(),outputs:[]}}},schedulePublishing:{getProjectPublicationFact:async()=>null}});
});
afterEach(async()=>{await store?.client.close()});
describe('T1022 真实组日历',()=>{
 it('空组能排期，account为null，共享计划不被平台筛选改变，跨组不可访问',async()=>{
 const entry=await service.createGroupEntry(a,a.groupId!,{projectId:'group-calendar-project',plannedDate:'2026-10-05'});
 expect(entry).toMatchObject({accountId:null,groupId:a.groupId,targetStatus:'unassigned'});
 const window={from:'2026-10-01T00:00:00.000Z',to:'2026-10-31T23:59:59.000Z'},page={limit:100,offset:0};
 expect((await service.listGroupCalendar({...a,accountId:'actual-platform-filter'},a.groupId!,window,page)).rows).toHaveLength(1);
 expect((await service.listGroupCalendar(b,b.groupId!,window,page)).rows).toHaveLength(0);
 await expect(service.updateEntry(b,entry.id,{plannedDate:'2026-10-06'})).rejects.toMatchObject({code:'OwnershipError'});
 expect((await service.updateEntry(a,entry.id,{plannedDate:'2026-10-06'})).plannedDate).toBe('2026-10-06');
 });
 it('真实发布目标冻结成员版本，转组后计划留原组并要求重选；外组账号拒绝',async()=>{
  const nextId=(prefix:string)=>`${prefix}-${++seq}`,groups=createAccountGroupService({db:store.db,now,nextId});
  const accounts=createPlatformAccountService({db:store.db,now,nextId});
  const target=await accounts.createAccount(user,{platform:'wechatOfficial',accountHandle:'真实公众号'});await groups.ensureLegacyGroups(user);
  await groups.transfer(user,{...await groups.previewTransfer(user,{accountId:target.id,toGroupId:a.groupId!}),idempotencyKey:'calendar-target-into-a'});
  const entry=await service.createGroupEntry(a,a.groupId!,{projectId:'group-calendar-project',plannedDate:'2026-10-05',targetAccountId:target.id});
  expect(entry).toMatchObject({accountId:target.id,groupId:a.groupId,targetStatus:'ready',membershipVersion:2});
  await groups.transfer(user,{...await groups.previewTransfer(user,{accountId:target.id,toGroupId:b.groupId!}),idempotencyKey:'calendar-target-into-b'});
  const window={from:'2026-10-01T00:00:00.000Z',to:'2026-10-31T23:59:59.000Z'},page={limit:100,offset:0};
  expect((await service.listGroupCalendar(a,a.groupId!,window,page)).rows[0]).toMatchObject({id:entry.id,groupId:a.groupId,accountId:target.id,membershipVersion:2,targetStatus:'needs_reselection'});
  expect((await service.listGroupCalendar(b,b.groupId!,window,page)).rows).toHaveLength(0);
  await expect(service.setEntryTarget(a,entry.id,target.id)).rejects.toMatchObject({code:'ConflictError'});
  expect(await service.setEntryTarget(a,entry.id,null)).toMatchObject({accountId:null,membershipVersion:null,targetStatus:'unassigned'});
 });
 it('归档组保留日历读，不能改排期；组节奏无需平台账号',async()=>{
 const entry=await service.createGroupEntry(a,a.groupId!,{projectId:'group-calendar-project',plannedDate:'2026-10-05'});
 const cadence=await service.upsertGroupCadence(a,a.groupId!,{frequency:'weekly',preferredSlots:[]});expect(cadence).toMatchObject({groupId:a.groupId,accountId:null});
 await store.client.query("UPDATE account_groups SET status='archived' WHERE id=$1",[a.groupId!]);
 expect(await service.getGroupCadence(a,a.groupId!)).toMatchObject({id:cadence.id});
 await expect(service.updateEntry(a,entry.id,{plannedDate:'2026-10-06'})).rejects.toMatchObject({code:'OwnershipError'});
 });
});
