import {beforeEach,expect,it,vi} from 'vitest';
const m=vi.hoisted(()=>({session:vi.fn(),client:vi.fn(),getProject:vi.fn(),getOutput:vi.fn()}));
vi.mock('next/navigation',()=>({redirect:(href:string)=>{throw Error('REDIRECT:'+href);},notFound:()=>{throw Error('NOT_FOUND');}}));
vi.mock('@/lib/session.server',()=>({resolveSession:m.session}));
vi.mock('@/lib/contract-client.server',()=>({createServerClient:(ctx:unknown)=>{m.client(ctx);return {getProject:m.getProject,getOutput:m.getOutput};}}));
import Page from './page';
const request=()=>({params:Promise.resolve({projectId:'p',outputId:'v'})});
beforeEach(()=>{vi.clearAllMocks();m.session.mockResolvedValue({ctx:{userId:'u',groupId:'g',accountId:'a'}});m.getProject.mockResolvedValue({id:'p'});m.getOutput.mockResolvedValue({id:'v',projectId:'p',contentType:'video'});});
it('旧视频稿面只核验归属后回项目脚本，不挂制作组件',async()=>{
 await expect(Page(request())).rejects.toThrow('REDIRECT:/projects/p');expect(m.client).toHaveBeenCalledWith({userId:'u',groupId:'g',accountId:null});expect(m.getProject).toHaveBeenCalledOnce();expect(m.getOutput).toHaveBeenCalledOnce();
});
it.each([{projectId:'other',contentType:'video'},{projectId:'p',contentType:'image'}])('不匹配的原项目或作品类型拒绝跳转 %o',async row=>{
 m.getOutput.mockResolvedValue({id:'v',...row});await expect(Page(request())).rejects.toThrow('NOT_FOUND');
});
it('无权读取作品或未登录不暴露制作页',async()=>{
 m.getOutput.mockRejectedValue(Error('禁止'));await expect(Page(request())).rejects.toThrow('NOT_FOUND');m.session.mockResolvedValue(null);m.getProject.mockClear();await expect(Page(request())).rejects.toThrow('NOT_FOUND');expect(m.getProject).not.toHaveBeenCalled();
});
