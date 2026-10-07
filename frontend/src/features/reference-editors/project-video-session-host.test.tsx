import * as React from 'react';
import {afterEach,beforeEach,expect,it,vi} from 'vitest';
import {act,cleanup,fireEvent,render,screen,waitFor} from '@testing-library/react';
const h=vi.hoisted(()=>({pathname:'/projects/p/production',mounts:0,unmounts:0,replace:vi.fn(),dispose:vi.fn(),backup:vi.fn(),dirty:true,save:vi.fn()}));
vi.mock('next/navigation',()=>({usePathname:()=>h.pathname,useRouter:()=>({replace:h.replace})}));
vi.mock('@/app/(creator)/projects/[projectId]/stage-chat-wrapper',()=>({StageChatWrapper:({children}:any)=><div>{children}</div>}));
vi.mock('@/features/production/production-editor-entry',()=>({ProductionEditorSession:(props:any)=>{
 React.useEffect(()=>{h.mounts++;props.onLeaveControl({readState:()=>({dirty:h.dirty,busy:false,pending:false,imports:0,ready:true}),saveForLeave:h.save,recoverOriginalReceipt:vi.fn(),exportLocalBackup:h.backup,dispose:h.dispose});return()=>{h.unmounts++;props.onLeaveControl(null);};},[]);
 return <div data-testid="session">{props.outputId}</div>;
}}));
import {ProjectVideoSessionHost} from './project-video-session-host';
import {ProjectVideoSessionContext} from './project-video-session-registry';
import {CURRENT_GROUP_KEY} from '@/lib/http-transport';
const scope={groupId:'g',accountId:null};
function Entry({outputId='v',projectId='p'}:{outputId?:string;projectId?:string}){
 const context=React.useContext(ProjectVideoSessionContext)!;
 React.useEffect(()=>context.attach({projectId,projectTitle:'作品',outputId} as any,scope),[context,outputId,projectId]);return <div>路由内容</div>;
}
function View({outputId='v',projectId='p'}:{outputId?:string;projectId?:string}){return <ProjectVideoSessionHost selectedOutputId={outputId}><Entry outputId={outputId} projectId={projectId}/></ProjectVideoSessionHost>;}
beforeEach(()=>{vi.clearAllMocks();h.pathname='/projects/p/production';h.mounts=0;h.unmounts=0;h.dirty=true;localStorage.setItem(CURRENT_GROUP_KEY,'g');h.dispose.mockResolvedValue(undefined);h.backup.mockResolvedValue(undefined);h.save.mockImplementation(async()=>{h.dirty=false;return true;});});
afterEach(cleanup);
it('直接离开项目到账号页、浏览器历史返回保留同一会话；别的项目不能显示旧稿',async()=>{
 const view=render(<View/>);await screen.findByTestId('session');expect(h.mounts).toBe(1);
 h.pathname='/accounts';view.rerender(<View/>);expect(screen.getByTestId('session').closest('[data-video-session-outlet]')).toHaveAttribute('hidden');expect(h.unmounts).toBe(0);
 h.pathname='/projects/other/production';view.rerender(<View/>);expect(screen.getByTestId('session').closest('[data-video-session-outlet]')).toHaveAttribute('hidden');
 h.pathname='/projects/p/production';view.rerender(<View/>);expect(screen.getByTestId('session').closest('[data-video-session-outlet]')).not.toHaveAttribute('hidden');expect(h.mounts).toBe(1);
});
it('更换作品先保留旧会话，保存并实际释放后才挂新作品',async()=>{
 const view=render(<View/>);await screen.findByTestId('session');view.rerender(<View outputId="other"/>);await screen.findByRole('dialog');expect(screen.getByTestId('session')).toHaveTextContent('v');
 let release!:()=>void;h.dispose.mockImplementation(()=>new Promise<void>(resolve=>{release=resolve;}));
 fireEvent.click(screen.getByRole('button',{name:'保存并继续'}));await waitFor(()=>expect(h.dispose).toHaveBeenCalledTimes(1));expect(h.mounts).toBe(1);
 await act(async()=>release());await waitFor(()=>expect(screen.getByTestId('session')).toHaveTextContent('other'));expect(h.mounts).toBe(2);expect(h.unmounts).toBe(1);
});
it('外部组切换立即隐藏旧会话，不把旧工程显示到新组',async()=>{
 render(<View/>);await screen.findByTestId('session');act(()=>{localStorage.setItem(CURRENT_GROUP_KEY,'other');window.dispatchEvent(new Event('creatoros:accounts-changed'));});
 expect(screen.getByTestId('session').closest('[data-video-session-outlet]')).toHaveAttribute('hidden');expect(h.unmounts).toBe(0);
});
it('回原账号继续编辑同时恢复服务端cookie，不以新组保存旧稿',async()=>{
 localStorage.removeItem(CURRENT_GROUP_KEY);localStorage.setItem('creatoros:current-account','original-account');
 function OriginalEntry(){const context=React.useContext(ProjectVideoSessionContext)!;React.useEffect(()=>context.attach({projectId:'p',projectTitle:'原账号作品',outputId:'v'} as any,{groupId:null,accountId:'original-account'}),[context]);return null;}
 render(<ProjectVideoSessionHost selectedOutputId="v"><OriginalEntry/></ProjectVideoSessionHost>);await screen.findByTestId('session');
 act(()=>{localStorage.setItem(CURRENT_GROUP_KEY,'other');localStorage.removeItem('creatoros:current-account');window.dispatchEvent(new Event('creatoros:accounts-changed'));});
 const {requestVideoLeave}=await import('./project-video-session-registry');let leaving!:Promise<boolean>;act(()=>{leaving=requestVideoLeave({scopeKey:'group:other'});});await screen.findByRole('dialog');fireEvent.click(screen.getByRole('button',{name:'继续编辑'}));
 expect(await leaving).toBe(false);expect(localStorage.getItem('creatoros:current-account')).toBe('original-account');expect(document.cookie).toContain('creatoros_current_account=original-account');expect(h.save).not.toHaveBeenCalled();expect(h.mounts).toBe(1);
});
