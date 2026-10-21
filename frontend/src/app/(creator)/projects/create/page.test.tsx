import {beforeEach,expect,it,vi} from 'vitest';
import CreateWorkPage from './page';
const mocks=vi.hoisted(()=>({session:vi.fn(),client:vi.fn(),source:vi.fn(),account:vi.fn()}));
vi.mock('@/lib/session.server',()=>({resolveSession:mocks.session}));
vi.mock('@/lib/contract-client.server',()=>({createServerClient:mocks.client}));
vi.mock('@/features/projects/quick-create-work',()=>({QuickCreateWork:()=>null}));
beforeEach(()=>{vi.clearAllMocks();mocks.session.mockResolvedValue({ctx:{userId:'u',groupId:'pure-group',accountId:null}});mocks.client.mockReturnValue({getAccount:mocks.account,getIntelligenceItem:mocks.source});});
it('纯组快速创作带来源成功预读真实ID，不依赖账号筛选',async()=>{mocks.source.mockResolvedValue({item:{id:'source',title:'真实来源',type:'article'}});const page=await CreateWorkPage({searchParams:Promise.resolve({sourceItemId:'source'})});expect(mocks.source).toHaveBeenCalledWith({params:{itemId:'source'},query:undefined,body:undefined});expect(page.props).toMatchObject({sourceItemId:'source',sourceTitle:'真实来源'});expect(mocks.account).not.toHaveBeenCalled();});
it.each(['无权读取','不存在'])('来源%s明确保留错误，不默默当作无来源',async message=>{mocks.source.mockRejectedValue(Error(message));const page=await CreateWorkPage({searchParams:Promise.resolve({sourceItemId:'bad'})});expect(page.props.sourceItemId).toBeUndefined();expect(page.props.sourceNotice).toContain(message);});
