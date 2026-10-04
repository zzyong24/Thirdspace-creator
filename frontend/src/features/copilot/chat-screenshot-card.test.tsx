import {act,cleanup,fireEvent,render,screen} from '@testing-library/react';
import {afterEach,beforeEach,expect,it,vi} from 'vitest';
const mocks=vi.hoisted(()=>({preview:vi.fn(),commit:vi.fn(),link:vi.fn(),refresh:vi.fn()}));
vi.mock('next/navigation',()=>({useRouter:()=>({refresh:mocks.refresh})}));
vi.mock('@/lib/contract-client',()=>({client:{commitPendingAsset:mocks.commit,createMaterialLink:mocks.link}}));
vi.mock('@/components/resources/asset-preview-url',()=>({resolveAssetPreviewUrl:mocks.preview,invalidateAssetPreviewUrl:vi.fn()}));
import {ChatScreenshotCard} from './chat-screenshot-card';
beforeEach(()=>{vi.clearAllMocks();mocks.preview.mockResolvedValue('/asset-preview');mocks.commit.mockResolvedValue({});});
afterEach(cleanup);
it('生成图片使用原预览与待采用服务，不生成空来源链接或自动入库',async()=>{
 render(<ChatScreenshotCard kind="generated" asset={{id:'pending-image',name:'生成图',previewUrl:null,sourceUrl:''}} error={null} projectId={null}/>);
 expect(await screen.findByAltText('生成图')).toHaveAttribute('src','/asset-preview');expect(screen.getByText(/生成图片/)).toBeInTheDocument();expect(document.querySelector('[data-slot="chat-screenshot-source-link"]')).toBeNull();expect(mocks.commit).not.toHaveBeenCalled();
 fireEvent.click(screen.getByRole('button',{name:'存入素材库'}));await screen.findByText('已存素材库');expect(mocks.commit).toHaveBeenCalledWith({params:{assetId:'pending-image'},query:undefined,body:undefined});
});
it('旧网页截图保留真实来源；卸载后迟到的图片预览不能回写',async()=>{
 const prior=render(<ChatScreenshotCard asset={{id:'web',name:'截图',previewUrl:'/web',sourceUrl:'https://example.com/page'}} error={null} projectId={null}/>);expect(document.querySelector('a')?.getAttribute('href')).toBe('https://example.com/page');prior.unmount();
 let resolve!:(url:string)=>void;mocks.preview.mockReturnValueOnce(new Promise(r=>{resolve=r;}));const next=render(<ChatScreenshotCard kind="generated" asset={{id:'new',name:'图',previewUrl:null,sourceUrl:''}} error={null} projectId={null}/>);next.unmount();await act(async()=>{resolve('/late');});expect(screen.queryByAltText('图')).toBeNull();
});
