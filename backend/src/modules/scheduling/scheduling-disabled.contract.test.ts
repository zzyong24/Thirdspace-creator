import {afterAll,beforeAll,expect,it} from 'vitest';
import {createDb} from '@creatoros/backend';
import {createClient,ENDPOINTS,type RequestContext} from '@creatoros/contract';
import {createAccountGroupService} from '../platform-account/account-group.service';
import {createSchedulingService} from './scheduling.service';
import {createSchedulingTransport} from './scheduling.transport';

let opened:Awaited<ReturnType<typeof createDb>>;
let service:ReturnType<typeof createSchedulingService>;
let transport:ReturnType<typeof createSchedulingTransport>;
let ctx:RequestContext;
beforeAll(async()=>{
 opened=await createDb();let seq=0;
 const deps={db:opened.db,now:()=> '2026-10-25T00:00:00.000Z',nextId:(p:string)=>`${p}-${++seq}`};
 const base:RequestContext={userId:'disabled-contract-user',requestId:'disabled-contract',source:'user'};
 const group=await createAccountGroupService(deps).create(base,{name:'合成停用组',idempotencyKey:'disabled-group'});
 ctx={...base,groupId:group.id,accountId:null};
 service=createSchedulingService(deps);transport=createSchedulingTransport(()=>service);
});
afterAll(async()=>{await opened?.client.close();});

it('公开契约保留enabled=false，创建第一条停用任务，调度器真实enabled筛选排除它',async()=>{
 const body=ENDPOINTS.createScheduledJob.body.parse({name:'合成停用任务',sourceKind:'topic.daily',schedule:'0 9 * * *',enabled:false});
 expect(body).toHaveProperty('enabled',false);
 const client=createClient(ENDPOINTS,transport,ctx);
 const created=await client.createScheduledJob({params:undefined,query:undefined,body});
 expect(created).toMatchObject({name:'合成停用任务',enabled:false,accountId:null,groupId:ctx.groupId,lastRunAt:null});
 expect(await client.getScheduledJob({params:{jobId:created.id},query:undefined,body:undefined})).toEqual(created);
 expect((await service.listJobsSystem(ctx,{enabled:true,limit:100,offset:0})).rows).toEqual([]);
 expect((await service.listRunsByJob(ctx,created.id,{limit:100,offset:0})).rows).toEqual([]);
});

it('旧调用省略enabled仍沿原行为启用，但显式停用新建不能误返回已启用旧任务',async()=>{
 const client=createClient(ENDPOINTS,transport,ctx);
 const enabled=await client.createScheduledJob({params:undefined,query:undefined,body:ENDPOINTS.createScheduledJob.body.parse({name:'旧调用',sourceKind:'topic.daily',schedule:'0 9 * * *'})});
 expect(enabled.enabled).toBe(true);
 await expect(client.createScheduledJob({params:undefined,query:undefined,body:ENDPOINTS.createScheduledJob.body.parse({name:'再次停用新建',sourceKind:'topic.daily',schedule:'0 9 * * *',enabled:false})})).rejects.toThrow('已有同类任务已启用');
 expect(await client.getScheduledJob({params:{jobId:enabled.id},query:undefined,body:undefined})).toEqual(enabled);
});
