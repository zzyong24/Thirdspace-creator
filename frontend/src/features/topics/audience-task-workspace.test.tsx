import * as React from 'react';
import { act,cleanup,fireEvent,render,screen,waitFor } from '@testing-library/react';
import { afterEach,beforeEach,expect,it,vi } from 'vitest';
import { emptyTopicWorkspaceConfig } from '@creatoros/contract';
import { notifyAccountsChanged } from '@/lib/account-events';
const api=vi.hoisted(()=>({getTopicWorkspace:vi.fn(),saveTopicWorkspace:vi.fn()}));
vi.mock('@/lib/contract-client',()=>({client:api}));
vi.mock('@/components/ai/adopt-candidate-card',()=>({AdoptCandidateCard:()=>null}));
import { AudienceTaskWorkspace } from './audience-task-workspace';
const record=(audience='账号甲')=>({version:0,updatedAt:null,config:{...emptyTopicWorkspaceConfig(),audience}});
beforeEach(()=>{vi.resetAllMocks();api.getTopicWorkspace.mockResolvedValue(record());});
afterEach(cleanup);
async function open(){fireEvent.click(screen.getByText('观众任务与双九宫格（按需设置，可留空）'));await waitFor(()=>expect(api.getTopicWorkspace).toHaveBeenCalled());await screen.findByLabelText('观众',{exact:true});}
it('折叠区按需读取，账号切换后的旧响应不回写',async()=>{
 let finish!:(v:ReturnType<typeof record>)=>void;api.getTopicWorkspace.mockImplementationOnce(()=>new Promise(r=>finish=r));render(<AudienceTaskWorkspace/>);
 expect(api.getTopicWorkspace).not.toHaveBeenCalled();fireEvent.click(screen.getByText('观众任务与双九宫格（按需设置，可留空）'));await waitFor(()=>expect(api.getTopicWorkspace).toHaveBeenCalledTimes(1));
 act(()=>notifyAccountsChanged());await act(async()=>finish(record('迟到旧账号')));await open();expect(screen.getByLabelText('观众',{exact:true})).toHaveValue('账号甲');
});
it('未知保存结果重试复用幂等键，加载失败不覆盖配置',async()=>{
 api.saveTopicWorkspace.mockRejectedValueOnce(new Error('response lost')).mockImplementationOnce(async({body})=>({version:1,updatedAt:'2026-10-02T00:00:00.000Z',config:body.config}));render(<AudienceTaskWorkspace/>);await open();
 fireEvent.click(screen.getByRole('button',{name:'保存观众任务设置'}));await screen.findByRole('alert');fireEvent.click(screen.getByRole('button',{name:'保存观众任务设置'}));await waitFor(()=>expect(api.saveTopicWorkspace).toHaveBeenCalledTimes(2));expect(api.saveTopicWorkspace.mock.calls[0]![0].body.idempotencyKey).toBe(api.saveTopicWorkspace.mock.calls[1]![0].body.idempotencyKey);
});
