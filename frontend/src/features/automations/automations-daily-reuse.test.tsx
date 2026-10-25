import { afterEach, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import type { ScheduledJobResource } from '@creatoros/contract';

const ports=vi.hoisted(()=>({list:vi.fn(),create:vi.fn(),toggle:vi.fn(),refresh:vi.fn()}));
vi.mock('next/navigation',()=>({useRouter:()=>({refresh:ports.refresh})}));
vi.mock('@/lib/contract-client',()=>({client:{listScheduledJobs:(input:unknown)=>ports.list(input),createScheduledJob:(input:unknown)=>ports.create(input),setScheduledJobEnabled:(input:unknown)=>ports.toggle(input),listJobRunsByJob:async()=>[],listTaskSteps:async()=>[],throttleStatusDouyin:async()=>({channels:[]})}}));
import { AutomationsIsland } from './automations-island';

afterEach(()=>{cleanup();vi.clearAllMocks();});
it.each([true,false])('新建弹窗发现已有每日任务enabled=%s，打开原详情并说明状态未变',async enabled=>{
 const job:ScheduledJobResource={id:'daily-existing',userId:'u',groupId:'g',accountId:null,name:'已有每日选题',prompt:'原提示',sourceKind:'topic.daily',target:{},schedule:'0 9 * * *',toolGrants:[],recipe:null,enabled,lastRunAt:null,nextRunAt:null,createdAt:'2026-10-25T00:00:00.000Z',updatedAt:'2026-10-25T00:00:00.000Z'};
 ports.list.mockResolvedValue([job]);
 render(<AutomationsIsland jobs={[]}/>);
 fireEvent.click(screen.getByText('每日自动生成选题').closest('button')!);
 fireEvent.click(screen.getByRole('button',{name:'创建任务'}));
 expect(await screen.findByText(`已打开已有每日选题任务；原任务保持${enabled?'启用':'停用'}，名称、频率和启用状态均未更改。`)).toHaveAttribute('role','status');
 expect(screen.getByRole('dialog')).toHaveTextContent('运行详情 · 已有每日选题');
 expect(ports.create).not.toHaveBeenCalled();
 expect(ports.toggle).not.toHaveBeenCalled();
 expect(job.enabled).toBe(enabled);
});
