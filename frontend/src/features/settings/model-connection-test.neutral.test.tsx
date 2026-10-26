import {render,screen,fireEvent,waitFor,cleanup} from '@testing-library/react';
import {afterEach,expect,it,vi} from 'vitest';
const api=vi.hoisted(()=>({testModelConnection:vi.fn()}));
vi.mock('@/lib/contract-client',()=>({client:api}));
vi.mock('@/lib/account-events',()=>({useAccountsChanged:()=>{}}));
vi.mock('@/lib/http-transport',()=>({readCurrentGroupId:()=> 'test-group',readCurrentAccountId:()=>null}));
import {TestConnectionButton} from './model-connection-test';
afterEach(cleanup);
it('T1406 API不适用的Codex真实返回保持中性未验证，不显示连接成功或失败',async()=>{
 api.testModelConnection.mockResolvedValue({ok:false,status:'warn',provider:'',model:'',detail:'当前选择 Codex 通路，API 连接测试不适用；此处未验证连通。'});
 render(<TestConnectionButton capability="default" slotPrefix="native-probe"/>);fireEvent.click(screen.getByRole('button',{name:'测试连接'}));
 await waitFor(()=>expect(document.querySelector('[data-slot="native-probe-test-result"]')).toHaveAttribute('data-status','warn'));
 const result=document.querySelector('[data-slot="native-probe-test-result"]')!;expect(result).toHaveAttribute('data-ok','false');expect(result).toHaveTextContent('未验证');expect(result).not.toHaveTextContent(/✓ 连通|✗ 失败/);
 expect(api.testModelConnection).toHaveBeenCalledTimes(1);
});
