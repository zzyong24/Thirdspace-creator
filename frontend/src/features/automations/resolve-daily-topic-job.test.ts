import { expect, it, vi } from 'vitest';
import { ENDPOINTS, createClient, type ScheduledJobResource, type Transport } from '@creatoros/contract';
import { resolveDailyTopicJob } from './resolve-daily-topic-job';

const job:ScheduledJobResource={id:'daily-existing',userId:'u',groupId:'g',accountId:null,name:'已有每日选题',prompt:'原提示',sourceKind:'topic.daily',target:{},schedule:'0 9 * * *',toolGrants:[],recipe:null,enabled:true,lastRunAt:null,nextRunAt:null,createdAt:'2026-10-25T00:00:00.000Z',updatedAt:'2026-10-25T00:00:00.000Z'};
const input={params:undefined,query:undefined,body:{name:'新请求',prompt:'新提示',sourceKind:'topic.daily' as const,target:{},schedule:'0 0 * * *',toolGrants:[],enabled:false}};

it.each([true,false])('查询复用既有每日任务，不改enabled=%s或原任务内容',async enabled=>{
 const existing={...job,enabled};
 const request=vi.fn<Transport['request']>(async endpoint=>{
  expect(endpoint.id).toBe('scheduledJobs.list');
  return {data:[existing],meta:{requestId:'r',page:1,pageSize:100,total:1}};
 });
 const resolved=await resolveDailyTopicJob(createClient(ENDPOINTS,{request}),input);
 expect(resolved).toEqual({job:existing,reused:true});
 expect(request).toHaveBeenCalledTimes(1);
 expect(request.mock.calls[0]![1]).toMatchObject({query:{sourceKind:'topic.daily',page:1,pageSize:100}});
});

it('真实查询为空后才提交原停用创建，返回created而非伪复用',async()=>{
 const request=vi.fn<Transport['request']>(async endpoint=>endpoint.id==='scheduledJobs.list'
  ?{data:[],meta:{requestId:'r',page:1,pageSize:100,total:0}}
  :{data:{...job,id:'new-job',enabled:false},meta:{requestId:'r'}});
 const result=await resolveDailyTopicJob(createClient(ENDPOINTS,{request}),input);
 expect(result).toMatchObject({reused:false,job:{id:'new-job',enabled:false}});
 expect(request.mock.calls.map(([endpoint])=>endpoint.id)).toEqual(['scheduledJobs.list','scheduledJobs.create']);
 expect(request.mock.calls[1]![1]).toEqual(input);
});

it('列表权限失败不创建；查询后的并发创建保护错误原样抛出且不重试',async()=>{
 const denied=new Error('工作区访问被拒绝');
 const failedList=vi.fn<Transport['request']>(async()=>{throw denied;});
 await expect(resolveDailyTopicJob(createClient(ENDPOINTS,{request:failedList}),input)).rejects.toBe(denied);
 expect(failedList).toHaveBeenCalledTimes(1);
 const race=new Error('已有同类任务已启用，未新建停用任务');
 const request=vi.fn<Transport['request']>(async endpoint=>{
  if(endpoint.id==='scheduledJobs.list')return {data:[],meta:{requestId:'r',page:1,pageSize:100,total:0}};
  throw race;
 });
 await expect(resolveDailyTopicJob(createClient(ENDPOINTS,{request}),input)).rejects.toBe(race);
 expect(request).toHaveBeenCalledTimes(2);
});
