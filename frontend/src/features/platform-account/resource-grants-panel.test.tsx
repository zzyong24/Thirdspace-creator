import {beforeEach,it,expect,vi} from 'vitest';
import {render,screen,fireEvent,waitFor} from '@testing-library/react';
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
