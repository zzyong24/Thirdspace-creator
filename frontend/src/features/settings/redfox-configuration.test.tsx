import {render,screen,fireEvent,waitFor,cleanup} from '@testing-library/react';
import {afterEach,it,expect,vi} from 'vitest';
import {RedfoxConfiguration} from './redfox-configuration';
const calls=vi.hoisted(()=>({getRedfox:vi.fn(),putRedfox:vi.fn(),deleteRedfox:vi.fn()}));
vi.mock('@/lib/contract-client',()=>({client:calls}));
afterEach(()=>{cleanup();vi.clearAllMocks();});
it('loads masked status, saves via flat contract client, clears input and removes key',async()=>{calls.getRedfox.mockResolvedValue({configured:false});calls.putRedfox.mockResolvedValue({configured:true});calls.deleteRedfox.mockResolvedValue({configured:false});render(<RedfoxConfiguration/>);await waitFor(()=>expect(calls.getRedfox).toHaveBeenCalled());fireEvent.change(screen.getByLabelText('API Key'),{target:{value:'test-secret'}});fireEvent.click(screen.getByText('保存密钥'));await waitFor(()=>expect(screen.getByText(/已保存密钥/)).toBeTruthy());expect(calls.putRedfox).toHaveBeenCalledWith({params:undefined,query:undefined,body:{secret:'test-secret'}});expect((screen.getByLabelText('API Key') as HTMLInputElement).value).toBe('');fireEvent.click(screen.getByText('移除密钥'));await waitFor(()=>expect(screen.getByText(/尚未配置/)).toBeTruthy());});
it('does not expose upstream exception content',async()=>{calls.getRedfox.mockRejectedValue(Error('private-secret'));render(<RedfoxConfiguration/>);await screen.findByRole('alert');expect(document.body.textContent).not.toContain('private-secret');});
