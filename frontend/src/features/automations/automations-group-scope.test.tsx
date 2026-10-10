import {afterEach,beforeEach,expect,it,vi} from 'vitest';
import {cleanup,fireEvent,render,screen,waitFor,within} from '@testing-library/react';
import {AutomationsIsland,type AutomationAccount} from './automations-island';
import type {ScheduledJobResource} from '@creatoros/backend/modules/scheduling';
const router=vi.hoisted(()=>({refresh:vi.fn(),push:vi.fn(),replace:vi.fn()}));
vi.mock('next/navigation',()=>({useRouter:()=>router}));
vi.mock('@/lib/handshake-client',()=>({handshakeHeaders:()=>({})}));
const timestamp='2026-10-10T00:00:00.000Z';
const job=(id:string,accountId:string|null,sourceKind:ScheduledJobResource['sourceKind']='self.metrics'):ScheduledJobResource=>({id,accountId,userId:'u',groupId:'g',name:`任务${id}`,prompt:'',sourceKind,target:{},schedule:'5 */2 * * *',toolGrants:[],recipe:null,enabled:true,lastRunAt:null,nextRunAt:null,createdAt:timestamp,updatedAt:timestamp});
const accounts:AutomationAccount[]=[{id:'dy1',handle:'抖音甲',platform:'douyin',status:'active'},{id:'xhs',handle:'小红书',platform:'xiaohongshu',status:'active'},{id:'dy2',handle:'抖音乙',platform:'douyin',status:'active'}].map(a=>({...a,status:'active',readiness:{accountId:a.id,platform:a.platform as 'douyin'|'xiaohongshu',status:'active',collectAvailable:true,planEvidence:'verified'}}));
const jobs=[job('dy1job','dy1'),job('xhsjob','xhs'),job('dy2job','dy2'),job('legacyshared','dy1','topic.daily')];
let calls:{id:string;input:any;headers:Headers}[]=[];
beforeEach(()=>{calls=[];vi.clearAllMocks();vi.stubGlobal('fetch',vi.fn(async(_url,init)=>{
 const body=JSON.parse(init.body);calls.push({...body,headers:new Headers(init.headers)});
 const data=body.id==='scheduledJobs.setEnabled'?{...jobs.find(j=>j.id===body.input.params.jobId)!,enabled:body.input.body.enabled}:[];
 return new Response(JSON.stringify({data,meta:{requestId:'r',page:1,pageSize:50,total:0}}),{status:200,headers:{'content-type':'application/json'}});
}));});
afterEach(()=>{cleanup();vi.unstubAllGlobals();});
it('纯组显示两平台三账号；筛选保共享；已有模板按目标账号查重',()=>{
 const {container}=render(<AutomationsIsland jobs={jobs} accounts={accounts} groupName="验收组" scope={{groupId:'g',accountId:null}}/>);
 expect(container.querySelectorAll('[data-slot="automations-list"] li[data-job-id]')).toHaveLength(4);
 fireEvent.change(screen.getByLabelText('筛选媒体平台'),{target:{value:'xiaohongshu'}});
 expect(container.querySelectorAll('[data-slot="automations-list"] li[data-job-id]')).toHaveLength(2);
 fireEvent.change(screen.getByLabelText('筛选平台账号'),{target:{value:'xhs'}});
 const template=container.querySelector('[data-template-id="daily-self-metrics"]')!;
 expect(template).toHaveAttribute('data-existing','true');fireEvent.click(template);
 expect(calls.filter(c=>c.id==='scheduledJobs.create'||c.id==='scheduledJobs.setEnabled')).toHaveLength(0);
 expect(container.querySelector('[data-template-id="daily-topic"]')).toHaveAttribute('data-existing','true');
});
it('详情与开关逐job冻结group和account；其他号读不偷换当前号',async()=>{
 const {container}=render(<AutomationsIsland jobs={jobs} accounts={accounts} scope={{groupId:'g',accountId:'dy1'}}/>);
 await waitFor(()=>expect(calls.filter(c=>c.id==='jobRuns.listByJob')).toHaveLength(4));
 for(const j of jobs){const c=calls.find(c=>c.id==='jobRuns.listByJob'&&c.input.params.jobId===j.id)!;expect(c.headers.get('x-group-id')).toBe('g');expect(c.headers.get('x-account-id')).toBe(j.accountId);}
 const row=container.querySelector('[data-job-id="xhsjob"]')!;
 fireEvent.click(within(row as HTMLElement).getByRole('switch',{name:'任务xhsjob 启用开关'}));
 await waitFor(()=>expect(calls.some(c=>c.id==='scheduledJobs.setEnabled')).toBe(true));
 const toggle=calls.find(c=>c.id==='scheduledJobs.setEnabled')!;expect(toggle.headers.get('x-group-id')).toBe('g');expect(toggle.headers.get('x-account-id')).toBe('xhs');
 fireEvent.click(within(row as HTMLElement).getByText('任务xhsjob'));
 await waitFor(()=>expect(calls.filter(c=>c.id==='jobRuns.listByJob'&&c.input.query.pageSize===50)).toHaveLength(1));
 expect(calls.find(c=>c.id==='jobRuns.listByJob'&&c.input.query.pageSize===50)!.headers.get('x-account-id')).toBe('xhs');
});
it('未知资格仍显示已有任务；新建不授私有源，最近读取失败明确显示',async()=>{
 vi.stubGlobal('fetch',vi.fn(async()=>new Response(JSON.stringify({error:{message:'真实读取错误'}}),{status:500})));
 const {container}=render(<AutomationsIsland jobs={[jobs[1]!]} accounts={[{...accounts[1]!,readiness:undefined,readinessError:'资格读取失败'}]} scope={{groupId:'g',accountId:null}}/>);
 fireEvent.change(screen.getByLabelText('筛选平台账号'),{target:{value:'xhs'}});
 expect(container.querySelector('[data-job-id="xhsjob"]')).not.toBeNull();
 await waitFor(()=>expect(screen.getByText('最近运行记录读取失败')).toBeInTheDocument());
 fireEvent.click(screen.getByText('新建任务'));
 expect(screen.getByText('新建采集任务')).toBeInTheDocument();
 expect(document.querySelector('[data-slot="automation-field-source"]')?.textContent).toContain('每日自动选题');
});

it('归档历史只读使用原组，所有写仍保原账号身份',async()=>{
 const {container}=render(<AutomationsIsland jobs={[jobs[1]!]} accounts={[{...accounts[1]!,status:'archived'}]} scope={{groupId:'g',accountId:'dy1'}}/>);
 await waitFor(()=>expect(calls.some(c=>c.id==='jobRuns.listByJob')).toBe(true));
 expect(calls.find(c=>c.id==='jobRuns.listByJob')!.headers.get('x-account-id')).toBeNull();
 const row=container.querySelector('[data-job-id="xhsjob"]')!;
 fireEvent.click(within(row as HTMLElement).getByText('任务xhsjob'));
 await waitFor(()=>expect(calls.some(c=>c.id==='jobRuns.listByJob'&&c.input.query.pageSize===50)).toBe(true));
 expect(calls.find(c=>c.id==='jobRuns.listByJob'&&c.input.query.pageSize===50)!.headers.get('x-account-id')).toBeNull();
 fireEvent.click(screen.getByRole('button',{name:'关闭'}));
 fireEvent.click(within(row as HTMLElement).getByRole('switch',{name:'任务xhsjob 启用开关'}));
 await waitFor(()=>expect(calls.some(c=>c.id==='scheduledJobs.setEnabled')).toBe(true));
 expect(calls.find(c=>c.id==='scheduledJobs.setEnabled')!.headers.get('x-account-id')).toBe('xhs');
});
it.each([500,404])('开关HTTP %s失败显示当前行错误，保持原开关且不宣称保存成功',async status=>{
 vi.stubGlobal('fetch',vi.fn(async(_url,init)=>{
  const body=JSON.parse(init.body);calls.push({...body,headers:new Headers(init.headers)});
  return new Response(JSON.stringify(body.id==='scheduledJobs.setEnabled'?{error:{code:status===404?'OwnershipError':'InternalError',message:'任务开关保存失败'}}:{data:[],meta:{requestId:'r',page:1,pageSize:50,total:0}}),{status:body.id==='scheduledJobs.setEnabled'?status:200});
 }));
 const {container}=render(<AutomationsIsland jobs={[jobs[1]!]} accounts={accounts} scope={{groupId:'g',accountId:'dy1'}}/>);
 const row=container.querySelector('[data-job-id="xhsjob"]')!;
 const control=within(row as HTMLElement).getByRole('switch',{name:'任务xhsjob 启用开关'});
 fireEvent.click(control);
 await waitFor(()=>expect(within(row as HTMLElement).getByText(status===500?'服务开小差了,请稍后重试。':'要操作的内容已不存在,可能已被移除或删除。')).toHaveAttribute('role','alert'));
 expect(control).toHaveAttribute('aria-checked','true');expect(router.refresh).not.toHaveBeenCalled();
 fireEvent.click(control);
 await waitFor(()=>expect(calls.filter(c=>c.id==='scheduledJobs.setEnabled')).toHaveLength(2));
});

it('归档写拒绝显示明确恢复提示，不泄漏内部ID或假称历史消失',async()=>{
 vi.stubGlobal('fetch',vi.fn(async(_url,init)=>{
  const body=JSON.parse(init.body);calls.push({...body,headers:new Headers(init.headers)});
  return new Response(JSON.stringify(body.id==='scheduledJobs.setEnabled'?{error:{code:'OwnershipError',message:'OwnershipError: platform account is archived: xhs',details:{reason:'account_archived'}}}:{data:[],meta:{requestId:'r',page:1,pageSize:50,total:0}}),{status:body.id==='scheduledJobs.setEnabled'?404:200});
 }));
 const {container}=render(<AutomationsIsland jobs={[jobs[1]!]} accounts={[{...accounts[1]!,status:'archived'}]} scope={{groupId:'g',accountId:null}}/>);
 const row=container.querySelector('[data-job-id="xhsjob"]')!;
 fireEvent.click(within(row as HTMLElement).getByRole('switch'));
 await waitFor(()=>expect(within(row as HTMLElement).getByRole('alert')).toHaveTextContent('此账号已归档，可查看历史；恢复账号后再管理计划。'));
 expect(row.textContent).not.toContain('OwnershipError');expect(router.refresh).not.toHaveBeenCalled();
});
