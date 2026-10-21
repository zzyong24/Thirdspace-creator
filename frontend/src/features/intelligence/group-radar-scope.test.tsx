import { act, cleanup, renderHook, waitFor } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import type { ExecutionTaskResourceV2 } from '@creatoros/contract';
import type { RadarApi } from './intelligence-workbench-types';
import { useShareImportTasks } from './use-share-import-tasks';
import { useProjectUpgradeQueue } from './use-project-upgrade-queue';
import { radarViewKey } from './radar-view-preferences';
afterEach(cleanup);
const task=(groupId:string,id:string,kind='share_import')=>({id,groupId,accountId:null,kind,ownerType:'item_import',ownerId:id,status:'queued',createdAt:'2026-10-04',updatedAt:'2026-10-04'}) as ExecutionTaskResourceV2;
it('两个空组的公开导入任务按冻结组隔离，提交保留独立 scope',async()=>{
 const own=task('group-a','own'),other=task('group-b','other');
 const api={listShareImportTasks:vi.fn().mockResolvedValue([own,other]),importDouyinShare:vi.fn().mockResolvedValue({task:own})} as unknown as RadarApi;
 const {result}=renderHook(()=>useShareImportTasks({groupId:'group-a'},api,true,vi.fn()));
 await waitFor(()=>expect(result.current.tasks.map(t=>t.id)).toEqual(['own']));
 await act(()=>result.current.submit('https://v.douyin.com/real',null));
 expect(api.importDouyinShare).toHaveBeenCalledWith(expect.objectContaining({groupId:'group-a'}));
 expect(vi.mocked(api.importDouyinShare).mock.calls[0]![0].accountId).toBeUndefined();
});
it('项目映射不能因两组账号都为空而混组，迟到ensure回执留在原组',async()=>{
 let resolve!:(value:unknown)=>void;
 const api={ensureProject:vi.fn(()=>new Promise(r=>{resolve=r;}))} as unknown as RadarApi;
 const {result,rerender}=renderHook(({groupId})=>useProjectUpgradeQueue({api,groupId,positioningVersionId:null,setNotice:vi.fn()}),{initialProps:{groupId:'group-a'}});
 let pending!:Promise<void>;act(()=>{pending=result.current.enqueue('same-item');});rerender({groupId:'group-b'});
 await act(async()=>{resolve({project:{id:'project-a'}});await pending;});expect(result.current.byItem.size).toBe(0);
 expect(api.ensureProject).toHaveBeenCalledWith(expect.objectContaining({idempotencyKey:'radar-ensure:group:group-a:same-item'}));
});
it('空组偏好键按组区分且保留旧账号键',()=>{
 expect(radarViewKey({groupId:'group-a'})).not.toBe(radarViewKey({groupId:'group-b'}));
 expect(radarViewKey('account')).toBe('creatoros:radar-view:v1:account');
});
