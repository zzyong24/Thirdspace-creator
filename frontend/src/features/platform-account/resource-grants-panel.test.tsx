import {beforeEach,it,expect,vi} from 'vitest';
import {render,screen,fireEvent,waitFor,act} from '@testing-library/react';
import {StrictMode} from 'react';
import {ResourceGrantsPanel} from './resource-grants-panel';
const mock=vi.hoisted(()=>({groupId:'origin',list:vi.fn(),preview:vi.fn(),revoke:vi.fn(),deletion:vi.fn(),transport:vi.fn()}));
vi.mock('@creatoros/contract',()=>({ENDPOINTS:{},createClient:()=> ({listGroupResourceGrants:mock.list,previewGroupResourceGrantRevoke:mock.preview,revokeGroupResourceGrant:mock.revoke,previewAssetDelete:mock.deletion})}));
vi.mock('@/lib/http-transport',()=>({readCurrentGroupId:()=>mock.groupId,createHttpTransport:mock.transport}));
vi.mock('@/lib/foreground-activity',()=>({beginForegroundActivity:()=>()=>{}}));
const group={id:'origin',userId:'user',name:'原组',status:'active' as const,version:1,createdAt:'2026-10-04T00:00:00Z',updatedAt:'2026-10-04T00:00:00Z',members:[]};
const grant={id:'g',resourceType:'asset',resourceId:'a',resourceTitle:'真实封面素材',resourceStatus:'active',originGroupId:'origin',originGroupName:'原组',targetGroupId:'target',targetGroupName:'品牌二组',migrationId:'migration',createdAt:group.createdAt,revokedAt:null,originStatus:'active',targetStatus:'active',originVersion:1,targetVersion:1,resourceUpdatedAt:group.createdAt,resourceDigest:'resource-version'};
const preview={...grant,digest:'confirmed-impact',canRevoke:true,reason:null,consumers:[]};
beforeEach(()=>{mock.groupId='origin';vi.clearAllMocks();mock.transport.mockReturnValue({});mock.list.mockResolvedValue([grant]);mock.preview.mockResolvedValue(preview);mock.revoke.mockResolvedValue({...grant,revokedAt:group.createdAt});});
it('显示真实项目使用与目标组，已使用授权不允许确认撤销',async()=>{
 mock.preview.mockResolvedValue({...preview,canRevoke:false,reason:'目标组已使用此资源，请先处理引用。',consumers:[{id:'p',consumerType:'material_links',title:'正在制作的项目',groupName:'品牌二组',current:true,historical:true}]});render(<ResourceGrantsPanel group={group}/>);fireEvent.click(await screen.findByRole('button',{name:'查看影响'}));expect(await screen.findByText('正在制作的项目')).toBeInTheDocument();expect(screen.getByRole('button',{name:'确认撤销授权'})).toBeDisabled();expect(mock.revoke).not.toHaveBeenCalled();
});
it('无引用授权经过预览、确认与重新读取后才显示已撤销',async()=>{
 render(<ResourceGrantsPanel group={group}/>);fireEvent.click(await screen.findByRole('button',{name:'查看影响'}));const confirm=await screen.findByRole('button',{name:'确认撤销授权'});mock.preview.mockResolvedValue({...preview,revokedAt:group.createdAt,canRevoke:false,reason:'授权已撤销'});mock.list.mockResolvedValue([{...grant,revokedAt:group.createdAt}]);fireEvent.click(confirm);expect(await screen.findByText('授权已撤销，使用记录保留。')).toBeInTheDocument();expect(mock.revoke).toHaveBeenCalledWith({params:{grantId:'g'},query:undefined,body:{digest:'confirmed-impact',expectedOriginVersion:1,expectedTargetVersion:1}});expect(mock.preview).toHaveBeenCalledTimes(2);
});
it('版本冲突保留影响，重新预览前不能重复提交旧digest',async()=>{
 mock.revoke.mockRejectedValue(Error('资源已变化，请重新预览'));render(<ResourceGrantsPanel group={group}/>);fireEvent.click(await screen.findByRole('button',{name:'查看影响'}));fireEvent.click(await screen.findByRole('button',{name:'确认撤销授权'}));expect(await screen.findByRole('alert')).toHaveTextContent('资源已变化');expect(screen.getByRole('button',{name:'确认撤销授权'})).toBeDisabled();expect(screen.getByRole('button',{name:'重新预览影响'})).toBeEnabled();
});
it('目标组只能查看授权影响，不能触发原组的撤销',async()=>{
 mock.groupId='target';render(<ResourceGrantsPanel group={{...group,id:'target',name:'品牌二组'}}/>);fireEvent.click(await screen.findByRole('button',{name:'查看影响'}));expect(await screen.findByText(/此授权由原组管理/)).toBeInTheDocument();expect(screen.queryByRole('button',{name:'确认撤销授权'})).not.toBeInTheDocument();
});
it('读取中切组立即清空旧资源，迟到响应不会回写',async()=>{
 let finish!:(v:unknown)=>void;mock.list.mockImplementation(()=>new Promise(resolve=>{finish=resolve;}));render(<ResourceGrantsPanel group={group}/>);await waitFor(()=>expect(mock.list).toHaveBeenCalled());mock.groupId='target';fireEvent(window,new CustomEvent('creatoros:accounts-changed'));finish([grant]);await waitFor(()=>expect(screen.queryByText('真实封面素材')).not.toBeInTheDocument());expect(screen.getByRole('alert')).toHaveTextContent('账号组已切换');
});

it('每个面板请求冻结真实组并清空平台筛选，异步请求不重新取当前组',async()=>{
 render(<ResourceGrantsPanel group={group}/>);await screen.findByRole('button',{name:'查看影响'});expect(mock.transport).toHaveBeenCalledWith('/api/v1',{groupId:'origin',accountId:null});
});

it('StrictMode重挂载后完成当前读取，不永久停在加载',async()=>{
 mock.list.mockReset().mockResolvedValue([grant]);
 render(<StrictMode><ResourceGrantsPanel group={group}/></StrictMode>);
 await act(async()=>{await Promise.resolve();});
 expect(mock.list).toHaveBeenCalled();
 expect(screen.queryByText('正在读取共享资源…')).not.toBeInTheDocument();
 expect(screen.getByText('真实封面素材')).toBeInTheDocument();
 expect(screen.getByRole('button',{name:'重新读取'})).toBeEnabled();
});
it('旧读取真实完成前切组不并发，完成后只显示当前组结果',async()=>{
 mock.list.mockReset().mockResolvedValue([grant]);
 let finish!:(v:unknown)=>void;let active=0,maxActive=0;
 mock.list.mockImplementationOnce(()=>{active++;maxActive=Math.max(maxActive,active);return new Promise(resolve=>{finish=value=>{active--;resolve(value);};});}).mockImplementationOnce(async()=>{active++;maxActive=Math.max(maxActive,active);active--;return [{...grant,resourceTitle:'当前组素材'}];});
 const view=render(<ResourceGrantsPanel group={group}/>);
 await waitFor(()=>expect(mock.list).toHaveBeenCalledTimes(1),{timeout:120_000});
 mock.groupId='target';view.rerender(<ResourceGrantsPanel group={{...group,id:'target',name:'品牌二组'}}/>);
 await act(async()=>{await Promise.resolve();});
 expect(mock.list).toHaveBeenCalledTimes(1);
 await act(async()=>{finish([grant]);});
 expect(mock.list).toHaveBeenCalledTimes(2);expect(maxActive).toBe(1);
 expect(screen.queryByText('真实封面素材')).not.toBeInTheDocument();
 expect(screen.getByText('当前组素材')).toBeInTheDocument();
 expect(screen.getByRole('button',{name:'重新读取'})).toBeEnabled();
 expect(mock.transport).toHaveBeenLastCalledWith('/api/v1',{groupId:'target',accountId:null});
});
it('等待旧读取时再次切组，过期排队不发送，仅最后当前组读取',async()=>{
 mock.list.mockReset().mockResolvedValue([grant]);
 let finish!:(v:unknown)=>void;mock.list.mockImplementationOnce(()=>new Promise(resolve=>{finish=resolve;})).mockResolvedValueOnce([{...grant,resourceTitle:'最终组素材'}]);
 const view=render(<ResourceGrantsPanel group={group}/>);
 await waitFor(()=>expect(mock.list).toHaveBeenCalledTimes(1),{timeout:120_000});
 mock.groupId='target';view.rerender(<ResourceGrantsPanel group={{...group,id:'target'}}/>);
 mock.groupId='latest';view.rerender(<ResourceGrantsPanel group={{...group,id:'latest'}}/>);
 await act(async()=>{finish([grant]);});
 expect(mock.list).toHaveBeenCalledTimes(2);
 expect(screen.getByText('最终组素材')).toBeInTheDocument();
 expect(screen.queryByText('真实封面素材')).not.toBeInTheDocument();
});
it('排队后卸载不发新请求，也不回写或报卸载更新',async()=>{
 mock.list.mockReset().mockResolvedValue([grant]);
 let finish!:(v:unknown)=>void;mock.list.mockImplementationOnce(()=>new Promise(resolve=>{finish=resolve;}));
 const view=render(<ResourceGrantsPanel group={group}/>);
 await waitFor(()=>expect(mock.list).toHaveBeenCalledTimes(1),{timeout:120_000});
 mock.groupId='target';view.rerender(<ResourceGrantsPanel group={{...group,id:'target'}}/>);view.unmount();
 await act(async()=>{finish([grant]);});
 expect(mock.list).toHaveBeenCalledTimes(1);
 expect(screen.queryByText('真实封面素材')).not.toBeInTheDocument();
});
it('排队期间当前组失效，权限错误结束加载且不读取未进入的组',async()=>{
 mock.list.mockReset().mockResolvedValue([grant]);
 let finish!:(v:unknown)=>void;mock.list.mockImplementationOnce(()=>new Promise(resolve=>{finish=resolve;}));
 const view=render(<ResourceGrantsPanel group={group}/>);
 await waitFor(()=>expect(mock.list).toHaveBeenCalledTimes(1),{timeout:120_000});
 view.rerender(<ResourceGrantsPanel group={{...group,id:'target'}}/>);
 await act(async()=>{finish([grant]);});
 expect(mock.list).toHaveBeenCalledTimes(1);
 expect(screen.getByRole('alert')).toHaveTextContent('请先进入此账号组');
 expect(screen.queryByText('正在读取共享资源…')).not.toBeInTheDocument();
 expect(screen.getByRole('button',{name:'重新读取'})).toBeEnabled();
});
it('同轮次重复重读共用在途请求，结束后可继续重读',async()=>{
 mock.list.mockReset().mockResolvedValue([grant]);
 render(<ResourceGrantsPanel group={group}/>);await screen.findByRole('button',{name:'查看影响'});
 let finish!:(v:unknown)=>void;mock.list.mockImplementationOnce(()=>new Promise(resolve=>{finish=resolve;}));
 const read=screen.getByRole('button',{name:'重新读取'});
 act(()=>{fireEvent.click(read);fireEvent.click(read);});
 await waitFor(()=>expect(mock.list).toHaveBeenCalledTimes(2),{timeout:120_000});
 await act(async()=>{finish([grant]);});
 expect(read).toBeEnabled();expect(mock.list).toHaveBeenCalledTimes(2);
 fireEvent.click(read);await waitFor(()=>expect(mock.list).toHaveBeenCalledTimes(3),{timeout:120_000});
});
