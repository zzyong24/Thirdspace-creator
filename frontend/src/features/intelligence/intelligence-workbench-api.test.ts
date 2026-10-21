import {afterEach,expect,it,vi} from 'vitest';
import {ENDPOINTS, intelligenceTranscriptStatus, itemTranscriptResource} from '@creatoros/contract';
import {defaultApi} from './intelligence-workbench-api';
import {CURRENT_ACCOUNT_KEY,CURRENT_GROUP_KEY} from '@/lib/http-transport';
afterEach(()=>{vi.unstubAllGlobals();localStorage.clear();});
it('真实HTTP雷达API冻结组header，共享请求省略account/group payload，collector登录仍为实际ID',async()=>{
 const calls:Array<{id:string;input:{body:Record<string,unknown>};headers:Record<string,string>}>=[];
 vi.stubGlobal('fetch',vi.fn(async (_url,init:RequestInit)=>{
  const body=JSON.parse(init.body as string);calls.push({...body,headers:init.headers as Record<string,string>});
  const data=body.id===ENDPOINTS.loginDouyin.id?{loggedIn:true}:body.id==='intelligence.collectors.list'?[]:{type:'web',title:'正文',finalUrl:'https://example.com',samples:[],loginRequired:false,parser:'reader',browserSessionRef:null};
  return new Response(JSON.stringify({data,meta:{requestId:'request',page:1,pageSize:100,total:0}}),{status:200});
 }));
 const api=defaultApi({groupId:'group-a',accountId:'platform-a'});
 localStorage.setItem(CURRENT_GROUP_KEY,'group-b');localStorage.setItem(CURRENT_ACCOUNT_KEY,'platform-b');
 await api.listCollectors({groupId:'group-a',accountId:'platform-a'});
 await api.previewWeb({groupId:'group-a',accountId:'platform-a',url:'https://example.com',instruction:''});
 expect(calls[0]!.headers['x-group-id']).toBe('group-a');expect(calls[1]!.headers['x-group-id']).toBe('group-a');
 expect(calls[0]!.headers).not.toHaveProperty('x-account-id');expect(calls[1]!.input.body).toEqual({url:'https://example.com',instruction:''});
 await api.reconnectCollector({collectorAccountId:'real-collector',sourceType:'favorites_folder'});
 expect(calls[2]!.headers).toMatchObject({'x-group-id':'group-a','x-account-id':'real-collector'});
 expect(calls[2]!.input.body.accountId).toBe('real-collector');
});

it('真实任务列表回执按group freeze过滤，两组null account不混入',async()=>{
 const task=(groupId:string,id:string)=>({id,userId:'user',groupId,accountId:null,kind:'share_import',ownerType:'item_import',ownerId:id,status:'queued',priority:1,idempotencyKey:id,checkpoint:null,leaseOwner:null,leaseExpiresAt:null,heartbeatAt:null,attempt:0,maxAttempts:3,errorCode:null,errorMessage:null,costEstimate:null,createdAt:'2026-10-04T00:00:00Z',updatedAt:'2026-10-04T00:00:00Z'});
 vi.stubGlobal('fetch',vi.fn(async()=>new Response(JSON.stringify({data:[task('group-a','own'),task('group-b','other')],meta:{requestId:'request',page:1,pageSize:100,total:2}}),{status:200})));
 const rows=await defaultApi({groupId:'group-a'}).listShareImportTasks!({groupId:'group-a'});
 expect(rows.map(row=>row.id)).toEqual(['own']);
});

it('活跃原任务经公开ownerId+kind列表完整分页，冻结scope，不误取同作品其他任务',async()=>{
 const task=(id:string,groupId='group-a')=>({id,userId:'synthetic',groupId,accountId:null,kind:'radar_project_upgrade',ownerType:'item_import',ownerId:'shared-item',status:'succeeded',priority:1,idempotencyKey:id,checkpoint:null,leaseOwner:null,leaseExpiresAt:null,heartbeatAt:null,attempt:0,maxAttempts:3,errorCode:null,errorMessage:null,costEstimate:null,createdAt:'2026-10-07T00:00:00Z',updatedAt:'2026-10-07T00:00:00Z'});
 const rows=[...Array.from({length:100},(_,i)=>task(`earlier-${i}`)),task('original-task')];
 const calls:Array<{id:string;input:{query:{ownerId:string;kind:string;page:number;pageSize:number;accountId?:string}};headers:Record<string,string>}>=[];
 vi.stubGlobal('fetch',vi.fn(async(_url,init:RequestInit)=>{
  const request=JSON.parse(init.body as string);calls.push({...request,headers:init.headers as Record<string,string>});
  const page=request.input.query.page;
  return new Response(JSON.stringify({data:rows.slice((page-1)*100,page*100),meta:{requestId:'synthetic',page,pageSize:100,total:rows.length}}),{status:200});
 }));
 const api=defaultApi({groupId:'group-a',accountId:'platform-a'});
 localStorage.setItem(CURRENT_GROUP_KEY,'group-b');localStorage.setItem(CURRENT_ACCOUNT_KEY,'platform-b');
 expect(await api.getProjectUpgrade!({id:'original-task',ownerId:'shared-item'})).toMatchObject({id:'original-task',groupId:'group-a',status:'succeeded'});
 expect(calls.map(call=>call.id)).toEqual([ENDPOINTS.listExecutionTasks.id,ENDPOINTS.listExecutionTasks.id]);
 expect(calls.map(call=>call.input.query)).toEqual([1,2].map(page=>({kind:'radar_project_upgrade',ownerId:'shared-item',page,pageSize:100})));
 for(const call of calls){expect(call.headers['x-group-id']).toBe('group-a');expect(call.headers).not.toHaveProperty('x-account-id');}
 rows.splice(0,rows.length,task('original-task','group-b'));
 await expect(api.getProjectUpgrade!({id:'original-task',ownerId:'shared-item'})).rejects.toThrow('原升级任务暂未读到');
});

const transcriptFixture = {
 itemId: "item-unknown", status: "not_requested", text: "已有正文保留", source: null,
 provider: null, model: null, language: null, executionTaskId: null,
 queuedAt: null, completedAt: null, errorCode: null,
};
it.each(intelligenceTranscriptStatus.options)("转写读取保留合法状态 %s", status => {
 expect(itemTranscriptResource.parse({...transcriptFixture,status}).status).toBe(status);
});
it.each(["future_status", "unknown", "", "constructor"])("转写读取将未知字符串 %s 规范为unknown，写入筛选枚举仍拒绝", status => {
 expect(itemTranscriptResource.parse({...transcriptFixture,status})).toMatchObject({status:"unknown",text:"已有正文保留"});
 expect(intelligenceTranscriptStatus.safeParse(status).success).toBe(false);
 expect(ENDPOINTS.listIntelligenceItems.query.safeParse({sort:"newest",transcriptStatus:status}).success).toBe(false);
});
it.each([undefined,null,123,{},[]])("转写状态非字符串 %j 仍拒绝，不能吞掉结构损坏", status => {
 expect(itemTranscriptResource.safeParse({...transcriptFixture,status}).success).toBe(false);
});
it("真实HTTP客户端解析未知转写状态，详情及正文仍可读", async () => {
 const item={id:"item-unknown",userId:"user",accountId:null,groupId:"group-a",type:"video",platform:"douyin",externalId:null,canonicalUrl:"https://example.com/work",authorId:null,authorName:"作者",title:"正常作品",summary:null,coverUrl:null,coverAssetId:null,publishedAt:null,durationMs:null,capturedAt:"2026-10-21T00:00:00Z",availability:"available"};
 vi.stubGlobal("fetch",vi.fn(async()=>new Response(JSON.stringify({data:{item,metrics:[],observations:[],snapshots:[],transcript:{...transcriptFixture,status:"provider_new_state"},transforms:[]},meta:{requestId:"unknown-status"}}),{status:200})));
 const result=await defaultApi({groupId:"group-a"}).getItem(item.id);
 expect(result.item.title).toBe("正常作品");
 expect(result.transcript).toMatchObject({status:"unknown",text:"已有正文保留"});
});
