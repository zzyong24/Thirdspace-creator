import * as React from 'react';
import {act, renderHook, render, cleanup} from '@testing-library/react';
import {afterEach, expect, it, vi} from 'vitest';
import {useLatestScriptReview} from '@/features/draft-workbench/use-latest-script-review';
import {useProjectUpgradeQueue} from '@/features/intelligence/use-project-upgrade-queue';
import {getLiveChatSession} from '@/features/copilot/live-chat-session';
import {ChatScriptDraftCard} from '@/features/copilot/chat-script-draft-card';

const calls = vi.hoisted(() => ({getLatestScriptReview: vi.fn(), getTask: vi.fn()}));
vi.mock('@/lib/contract-client', () => ({client: calls}));
vi.mock('next/navigation', () => ({useRouter: () => ({refresh: vi.fn()})}));
vi.mock('@/components/ui/button', () => ({Button: ({children, ...props}: React.PropsWithChildren<object>) => React.createElement('button', props, children)}));
afterEach(() => {cleanup(); vi.useRealTimers(); calls.getLatestScriptReview.mockReset(); calls.getTask.mockReset();});

it('真实审核 hook 在慢请求未回时重复启动请求，两个消费点放大到 8 个在途', async () => {
  vi.useFakeTimers();
  let inFlight = 0, maxInFlight = 0;
  const releases: Array<() => void> = [];
  calls.getLatestScriptReview.mockImplementation(() => {
    inFlight += 1; maxInFlight = Math.max(maxInFlight, inFlight);
    return new Promise(resolve => releases.push(() => {inFlight -= 1; resolve(null);}));
  });
  const oldReport = {id:'synthetic-review', artifactVersion:1, reviewedAt:'2026-10-07T00:00:00Z'} as never;
  const gate = renderHook(() => useLatestScriptReview('synthetic-project', oldReport, 2));
  const hint = renderHook(() => useLatestScriptReview('synthetic-project', oldReport, 2));
  await act(async () => {await vi.advanceTimersByTimeAsync(32000);});
  expect(calls.getLatestScriptReview).toHaveBeenCalledTimes(8);
  expect(maxInFlight).toBe(8);
  gate.unmount(); hint.unmount();
  await act(async () => {await vi.advanceTimersByTimeAsync(32000);});
  expect(calls.getLatestScriptReview).toHaveBeenCalledTimes(8);
  console.log(JSON.stringify({case:'slow-review',observedMs:32000,consumers:2,requests:8,maxInFlight,afterUnmountInFlight:inFlight,timersStopped:true}));
  await act(async () => {releases.forEach(release=>release());});
});

it('真实升级 hook 空队列仍然每 3 秒请求，完成任务也重复全分页', async () => {
  vi.useFakeTimers();
  const listProjectUpgrades = vi.fn().mockResolvedValue({tasks:[],total:0});
  const api = {listProjectUpgrades} as never;
  const idle = renderHook(() => useProjectUpgradeQueue({api, accountId:'synthetic-account', positioningVersionId:null, setNotice:vi.fn()}));
  await act(async () => {await vi.advanceTimersByTimeAsync(30000);});
  expect(listProjectUpgrades).toHaveBeenCalledTimes(11);
  idle.unmount();
  listProjectUpgrades.mockReset();
  const rows = Array.from({length:250}, (_,i)=>({id:`synthetic-task-${i}`, ownerId:`synthetic-item-${i}`,accountId:'synthetic-account',status:'succeeded',createdAt:'2026-10-07'}));
  listProjectUpgrades.mockImplementation(({page}:{page:number})=>Promise.resolve({tasks:rows.slice((page-1)*100,page*100),total:250}));
  const complete = renderHook(() => useProjectUpgradeQueue({api,accountId:'synthetic-account',positioningVersionId:null,setNotice:vi.fn()}));
  await act(async () => {await vi.advanceTimersByTimeAsync(30000);});
  expect(listProjectUpgrades).toHaveBeenCalledTimes(33);
  expect(complete.result.current.tasks).toHaveLength(250);
  console.log(JSON.stringify({case:'upgrade-completed-history',observedMs:30000,idleRequests:11,completedTasks:250,requests:33,pagesPerSweep:3}));
  complete.unmount();
});

it('真实 Chat 会话容器跨不同 scope 仍保留全部已结束消息', () => {
  const count=100,charsPerScope=65536;
  for(let i=0;i<count;i++){
    const session=getLiveChatSession(JSON.stringify(['synthetic-owner',`project:synthetic-${i}`]));
    session.chat.messages=[{id:`synthetic-message-${i}`,role:'assistant',parts:[{type:'text',text:`${i}:`+'x'.repeat(charsPerScope)}]}];
  }
  let retainedScopes=0,retainedChars=0;
  for(let i=0;i<count;i++){
    const session=getLiveChatSession(JSON.stringify(['synthetic-owner',`project:synthetic-${i}`]));
    if(session.chat.messages.length)retainedScopes++;
    retainedChars+=(session.chat.messages[0]?.parts[0] as {text?:string}).text?.length??0;
  }
  expect(retainedScopes).toBe(count);
  expect(retainedChars).toBeGreaterThanOrEqual(count*charsPerScope);
  console.log(JSON.stringify({case:'live-chat-retention',uniqueScopes:count,retainedScopes,retainedChars,realHeapMeasured:false}));
});

it('真实整稿卡重新挂载已成功任务仍查询 90 次且停在运行中', async () => {
  vi.useFakeTimers();
  calls.getTask.mockResolvedValue({id:'synthetic-success',status:'succeeded'});
  const view=render(React.createElement(ChatScriptDraftCard,{taskId:'synthetic-success',projectId:'synthetic-project',error:null}));
  await act(async () => {await vi.advanceTimersByTimeAsync(360000);});
  expect(calls.getTask).toHaveBeenCalledTimes(90);
  expect(view.container.querySelector('[data-slot="chat-script-draft-card"]')?.getAttribute('data-phase')).toBe('running');
  expect(view.container.querySelector('[data-slot="task-observation-paused"]')).not.toBeNull();
  console.log(JSON.stringify({case:'script-card-succeeded',observedMs:360000,requests:90,returnedStatus:'succeeded',uiPhase:'running',observationPaused:true}));
  view.unmount();
});
