import { expect,it,vi } from 'vitest';
const ctx={userId:'user',groupId:'empty-group',requestId:'request'};
const api={listStatements:vi.fn().mockResolvedValue([]),getIntelligenceWorkspace:vi.fn().mockResolvedValue({collections:[],sources:[],memberships:[],health:[],pendingCount:0,blockedCount:0})};
vi.mock('@/lib/session.server',()=>({resolveSession:async()=>({ctx})}));
vi.mock('@/lib/contract-client.server',()=>({createServerClient:()=>api,requestServerListWithMeta:vi.fn().mockResolvedValue({data:[],meta:{total:0}})}));
vi.mock('@/features/intelligence/intelligence-workbench',()=>({IntelligenceWorkbench:()=>null}));
vi.mock('@/components/shell/zero-account-guidance',()=>({ZeroAccountGuidance:()=>null}));
import Page from './page';
it('空组打开实际雷达页面并读取共享工作区，不跳绑定账号提示',async()=>{
 const page=await Page();
 expect(api.getIntelligenceWorkspace).toHaveBeenCalledWith(expect.objectContaining({query:{}}));
 expect(page.props.groupId).toBe('empty-group');
 expect(page.props.accountId).toBeUndefined();
});
