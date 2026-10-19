import {afterEach,expect,it,vi} from 'vitest';
import {publishVideoSession,clearVideoSession,readVideoSession,requestVideoLeave,isSameVideoWorkspace,subscribeVideoSession} from './project-video-session-registry';
const identity={scopeKey:'group:one',projectId:'project one',outputId:'video-one',generation:2};
afterEach(()=>publishVideoSession(null,null));
it('旧会话卸载不能清除较新的工程或导航守卫',async()=>{
 const guard=vi.fn(async()=>false),listener=vi.fn(),unsubscribe=subscribeVideoSession(listener);publishVideoSession(identity,guard);clearVideoSession(1);
 expect(readVideoSession()).toEqual(identity);expect(await requestVideoLeave({scopeKey:'group:two'})).toBe(false);expect(guard).toHaveBeenCalledWith({scopeKey:'group:two'});expect(listener).toHaveBeenCalledTimes(1);unsubscribe();
 clearVideoSession(2);expect(readVideoSession()).toBeNull();expect(await requestVideoLeave({scopeKey:'group:two'})).toBe(true);
});
it('同作品Tab与编码项目ID可返回，其他作品或组必须走离开检查',()=>{
 expect(isSameVideoWorkspace(identity,{href:'/projects/project%20one/article'})).toBe(true);
 expect(isSameVideoWorkspace(identity,{href:'/projects/project%20one/production?outputId=video-one'})).toBe(true);
 expect(isSameVideoWorkspace(identity,{href:'/projects/project%20one/production?outputId=video-two'})).toBe(false);
 expect(isSameVideoWorkspace(identity,{href:'/projects/other/production'})).toBe(false);
 expect(isSameVideoWorkspace(identity,{scopeKey:'group:two'})).toBe(false);
});
