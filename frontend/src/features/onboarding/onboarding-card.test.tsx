import * as React from 'react';
import {beforeEach,afterEach,describe,it,expect,vi} from 'vitest';
import {render,screen,fireEvent,waitFor,cleanup} from '@testing-library/react';
vi.mock('next/link',()=>({default:({children,...props}:React.AnchorHTMLAttributes<HTMLAnchorElement>)=><a {...props}>{children}</a>}));
const groupCurrent=vi.hoisted(()=>vi.fn<()=>string|null>(()=>null));const saveGroupOnboarding=vi.hoisted(()=>vi.fn());
const loadState=vi.hoisted(()=>vi.fn());const saveOnboarding=vi.hoisted(()=>vi.fn());const current=vi.hoisted(()=>vi.fn<()=>string|null>(()=> 'a'));
vi.mock('./onboarding-data',()=>({loadState,saveOnboarding,saveGroupOnboarding}));
vi.mock('@/lib/http-transport',()=>({readCurrentAccountId:current,readCurrentGroupId:groupCurrent}));
import {OnboardingCard,requestOnboardingReopen} from './onboarding-card';
const keys=['import-account','confirm-origin','review-imported-projects','positioning-profile','benchmark-monitor','benchmark-topic','first-project'];
const pref=()=>({accountId:'a',origin:'existing' as const,hidden:false,collapsed:true,completedSteps:['import-account','confirm-origin'],updatedAt:'2026-09-13'});
let preferences= pref();
beforeEach(()=>{vi.clearAllMocks();groupCurrent.mockReturnValue(null);current.mockReturnValue('a');preferences=pref();loadState.mockImplementation(async()=>({accountId:current(),origin:preferences.origin,preferences,completedSteps:preferences.completedSteps,hasImportedWorks:true,hasPositioningProfile:true}));saveOnboarding.mockImplementation(async(_id,patch)=>{preferences={...preferences,...patch,completedSteps:[...new Set([...preferences.completedSteps,...(patch.completedSteps??[])])]};return preferences;});});
afterEach(cleanup);
describe('T-964 引导确认与退出',()=>{
 it('显示已完成计数，默认仅展示下一步，查看链接不冒充确认',async()=>{
  render(<OnboardingCard/>);await screen.findByText('已完成 2 / 6');expect(document.querySelectorAll('[data-slot="onboarding-step"]')).toHaveLength(1);
  const link=screen.getByRole('link',{name:'查看历史作品'});expect(link.getAttribute('href')).toBe('/projects');fireEvent.click(link);expect(saveOnboarding).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole('button',{name:'已查看，完成这一步'}));await screen.findByText('已完成 3 / 6');expect(saveOnboarding).toHaveBeenCalledWith('a',{completedSteps:['review-imported-projects']});
 });
 it('结束引导真正保存，重新挂载不再出现',async()=>{
  const view=render(<OnboardingCard/>);fireEvent.click(await screen.findByRole('button',{name:'结束引导'}));await waitFor(()=>expect(document.querySelector('[data-slot="onboarding-card"]')).toBeNull());view.unmount();render(<OnboardingCard/>);await waitFor(()=>expect(loadState).toHaveBeenCalledTimes(2));expect(screen.queryByText('上手引导')).toBeNull();expect(preferences.hidden).toBe(true);
 });
 it('关闭失败保留引导并提示，可再次尝试',async()=>{
  saveOnboarding.mockRejectedValueOnce(Error('offline'));render(<OnboardingCard/>);fireEvent.click(await screen.findByRole('button',{name:'结束引导'}));await screen.findByText('进度未保存，请再试一次。当前操作尚未完成。');expect(screen.getByText('上手引导')).toBeTruthy();fireEvent.click(screen.getByRole('button',{name:'结束引导'}));await waitFor(()=>expect(screen.queryByText('上手引导')).toBeNull());
 });
 it('完成后自动隐藏，显式重看不清掉完成记录',async()=>{
  preferences.completedSteps=[...keys];render(<OnboardingCard/>);await waitFor(()=>expect(loadState).toHaveBeenCalledTimes(1));expect(screen.queryByText('上手引导')).toBeNull();await requestOnboardingReopen();await screen.findByText('已完成全部引导，可以随时回看。');expect(preferences.completedSteps).toEqual(keys);
 });
 it('旧账号保存悬挂不锁住新账号，迟到响应不覆盖新账号',async()=>{
  let finish!:(v:unknown)=>void;saveOnboarding.mockReturnValueOnce(new Promise(r=>finish=r));
  render(<OnboardingCard/>);fireEvent.click(await screen.findByRole('button',{name:'结束引导'}));
  current.mockReturnValue('b');preferences={...pref(),accountId:'b'};window.dispatchEvent(new CustomEvent('creatoros:accounts-changed'));
  await waitFor(()=>expect(screen.getByRole('button',{name:'结束引导'}).hasAttribute('disabled')).toBe(false));
  fireEvent.click(screen.getByRole('button',{name:'结束引导'}));await waitFor(()=>expect(saveOnboarding).toHaveBeenCalledWith('b',{hidden:true}));
  finish({...pref(),hidden:false});await waitFor(()=>expect(screen.queryByText('上手引导')).toBeNull());
 });
 it('切号后旧请求晚到不能把旧引导显示在新账号',async()=>{
  let resolve!:(v:unknown)=>void;loadState.mockReturnValueOnce(new Promise(r=>resolve=r));render(<OnboardingCard/>);current.mockReturnValue('b');loadState.mockResolvedValue({accountId:'b',origin:'fresh',preferences:{...pref(),accountId:'b',hidden:true}});window.dispatchEvent(new CustomEvent('creatoros:accounts-changed'));await waitFor(()=>expect(loadState).toHaveBeenCalledTimes(2));resolve({accountId:'a',origin:'existing',preferences:pref()});await waitFor(()=>expect(screen.queryByText('上手引导')).toBeNull());
 });
});


it('T1362纯typed无导入Project组看目录后可人工确认，点击链接不自动完成',async()=>{
 groupCurrent.mockReturnValue('g');
 let record={groupId:'g',accountId:null,origin:'existing',hidden:false,collapsed:true,completedSteps:['import-account','confirm-origin'],updatedAt:'2026-10-19'};
 loadState.mockImplementation(async()=>({groupId:'g',memberCount:1,origin:'existing',hasImportedWorks:false,hasPositioningProfile:true,completedSteps:record.completedSteps,preferences:record}));
 saveGroupOnboarding.mockImplementation(async(_id,patch)=>{record={...record,...patch,completedSteps:[...new Set([...record.completedSteps,...(patch.completedSteps??[])])]};return record;});
 const view=render(<OnboardingCard/>);const link=await screen.findByRole('link',{name:'查看已采集作品'});expect(link).toHaveAttribute('href','/accounts/works');expect(saveGroupOnboarding).not.toHaveBeenCalled();
 const confirm=screen.getByRole('button',{name:'已查看，完成这一步'});expect(confirm).toBeEnabled();fireEvent.click(confirm);await screen.findByText('已完成 3 / 6');expect(saveGroupOnboarding).toHaveBeenCalledWith('g',{completedSteps:['review-imported-projects']});
 view.unmount();render(<OnboardingCard/>);await screen.findByText('已完成 3 / 6');expect(screen.queryByRole('button',{name:'已查看，完成这一步'})).toBeNull();expect(saveOnboarding).not.toHaveBeenCalled();
});

it('T1408 空组首页直接引导定位，绑定仅为可选链接且不伪造完成',async()=>{
 groupCurrent.mockReturnValue('empty-group');
 loadState.mockResolvedValue({groupId:'empty-group',accountId:null,memberCount:0,origin:null,completedSteps:[],preferences:{...pref(),accountId:null,groupId:'empty-group',origin:null,completedSteps:[]}});
 render(<OnboardingCard/>);
 expect(await screen.findByRole('link',{name:'去创建定位'})).toHaveAttribute('href','/positioning');
 expect(screen.getByText('已完成 0 / 5')).toBeTruthy();
 expect(screen.getByRole('link',{name:'连接平台账号（可选）'})).toHaveAttribute('href','/accounts');
 expect(screen.queryByRole('link',{name:'去绑定'})).toBeNull();
 expect(saveGroupOnboarding).not.toHaveBeenCalled();expect(saveOnboarding).not.toHaveBeenCalled();
});

it('T1408 无组时仍引导创建账号组，说明建组后无需登录即可定位',async()=>{
 current.mockReturnValue(null);
 loadState.mockResolvedValue({groupId:null,accountId:null,needsFirstGroup:true});
 render(<OnboardingCard/>);
 expect(await screen.findByRole('link',{name:'创建第一个账号组'})).toHaveAttribute('href','/accounts');
 expect(screen.getByText('2 开始定位')).toBeTruthy();
 expect(screen.getByText(/创建后即可开始定位，无需登录抖音/)).toBeTruthy();
 expect(screen.queryByRole('link',{name:'去创建定位'})).toBeNull();
});

it('T1408 已有资料但未选组时保持选择工作区入口',async()=>{
 current.mockReturnValue(null);
 loadState.mockResolvedValue({groupId:null,accountId:null,needsFirstGroup:false});
 render(<OnboardingCard/>);
 expect(await screen.findByRole('link',{name:'选择账号组'})).toHaveAttribute('href','/accounts');
 expect(screen.queryByRole('link',{name:'去创建定位'})).toBeNull();
});
