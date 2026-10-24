import {describe,expect,it,vi} from 'vitest';
import {resolveProjectRoute} from './project-route-data';

describe('项目路由读取',()=>{
  it('明确ID直接返回已验证的项目，不读取全列表',async()=>{
    const project={id:'project-101',title:'项目',brief:'真实资料'};
    const client={getProject:vi.fn().mockResolvedValue(project),listProjects:vi.fn()};
    expect(await resolveProjectRoute('project-101',client)).toBe(project);
    expect(client.getProject).toHaveBeenCalledOnce();expect(client.listProjects).not.toHaveBeenCalled();
  });
  it('旧slug分页找到后仍按真实ID重新验证，不把列表快照直接当当前项目',async()=>{
    const verified={id:'p101',title:'AI Native Browser 深度解析',brief:'最新详情'};
    const client={getProject:vi.fn().mockRejectedValueOnce(Error('not found')).mockResolvedValue(verified),listProjects:vi.fn().mockImplementation(({query})=>Promise.resolve(query.page===1?Array.from({length:100},(_,n)=>({id:'p'+n,title:'其他'})):[verified]))};
    expect(await resolveProjectRoute('ai-native-browser',client)).toBe(verified);
    expect(client.listProjects).toHaveBeenCalledTimes(2);
    expect(client.getProject).toHaveBeenLastCalledWith({params:{projectId:'p101'},query:undefined,body:undefined});
  });
  it('跨组不可见项目不能通过slug或列表兜底绕过详情校验',async()=>{
    const denied=Error('不属于当前账号组');
    const client={getProject:vi.fn().mockRejectedValue(denied),listProjects:vi.fn().mockResolvedValue([{id:'other',title:'Hidden'}])};
    await expect(resolveProjectRoute('hidden',client)).rejects.toBe(denied);
    expect(client.getProject).toHaveBeenCalledTimes(2);
  });
});
