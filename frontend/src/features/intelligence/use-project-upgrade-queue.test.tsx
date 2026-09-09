import {act,renderHook,waitFor,cleanup} from '@testing-library/react';
import {afterEach,describe,expect,it,vi} from 'vitest';
import type {ExecutionTaskResourceV2} from '@creatoros/contract';
import type {RadarApi} from './intelligence-workbench-types';
import {useProjectUpgradeQueue,upgradeLabel,upgradeNotice} from './use-project-upgrade-queue';

afterEach(cleanup);
const task={id:'upgrade',accountId:'account',ownerId:'item',status:'blocked',errorCode:'BOUND_ASR_RESULT_UNKNOWN',errorMessage:'提交结果未知，须同键对账',createdAt:'2026-09-09'} as ExecutionTaskResourceV2;
describe('升级未知结果处理',()=>{
 it.each([false,true])('检查真实逐字稿再决定继续，正文完整=%s',async(done)=>{
  const commandTask=vi.fn().mockResolvedValue({});const setNotice=vi.fn();
  const api={listProjectUpgrades:vi.fn().mockResolvedValue({tasks:[task],total:1}),enqueueProjectUpgrades:vi.fn(),commandTask,getItem:vi.fn().mockResolvedValue({transcript:{status:done?'done':'running',text:done?'真实逐字稿':null}})} as unknown as RadarApi;
  const {result}=renderHook(()=>useProjectUpgradeQueue({api,accountId:'account',positioningVersionId:'positioning',setNotice}));
  await waitFor(()=>expect(result.current.byItem.has('item')).toBe(true));
  await act(()=>result.current.enqueue('item'));
  expect(api.getItem).toHaveBeenCalledWith('item');
  expect(commandTask).toHaveBeenCalledTimes(done?1:0);
  expect(api.enqueueProjectUpgrades).not.toHaveBeenCalled();
  if(!done)expect(setNotice.mock.calls.at(-1)?.[0]).toContain('不会重复提交转写');
 });
 it('不把内部对账术语或普通重试展示为未知转写的处理',()=>{
  expect(upgradeLabel(task)).toBe('检查并继续升级');
  expect(upgradeNotice(task)).toContain('升级已暂停');
  expect(upgradeNotice(task)).not.toContain('同键');
 });
});
