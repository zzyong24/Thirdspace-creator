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
it('项目升级任务不能因两组账号都为空而混组',async()=>{
 const api={listProjectUpgrades:vi.fn().mockResolvedValue({tasks:[task('group-a','own','radar_project_upgrade'),task('group-b','other','radar_project_upgrade')],total:2})} as unknown as RadarApi;
 const {result}=renderHook(()=>useProjectUpgradeQueue({api,groupId:'group-a',positioningVersionId:null,setNotice:vi.fn()}));
 await waitFor(()=>expect(result.current.tasks.map(t=>t.id)).toEqual(['own']));
});
it('空组偏好键按组区分且保留旧账号键',()=>{
 expect(radarViewKey({groupId:'group-a'})).not.toBe(radarViewKey({groupId:'group-b'}));
 expect(radarViewKey('account')).toBe('creatoros:radar-view:v1:account');
});
