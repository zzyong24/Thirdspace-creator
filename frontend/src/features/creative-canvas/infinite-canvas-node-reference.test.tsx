import '@testing-library/jest-dom/vitest';
import * as React from 'react';
import {it,expect,vi,afterEach} from 'vitest';
import {render,screen,fireEvent,cleanup} from '@testing-library/react';
import {InfiniteCanvasNode} from './infinite-canvas-node';
vi.mock('@/lib/http-transport',()=>({readCurrentAccountId:()=> 'a'}));
vi.mock('@/lib/contract-client',()=>({client:{}}));
afterEach(cleanup);
function view(){const onPatch=vi.fn();render(<InfiniteCanvasNode item={{id:'node',type:'image_generation',position:{x:0,y:0},label:'页图',prompt:'画面',mode:'image_to_image',referenceAssetId:'old',referenceFileId:'old-file'}} assets={[{id:'old',name:'原图',assetType:'image',currentFileId:'old-file'},{id:'new',name:'新图',assetType:'image',currentFileId:'new-file'}]} selected busy={false} busyResult={false} projectTitle={null} onPatch={onPatch} onSelect={vi.fn()} onStartDrag={vi.fn()} onStartResize={vi.fn()} onStartConnect={vi.fn()} onGenerate={vi.fn()} onInsertResult={vi.fn()} onKeepResult={vi.fn()} onReferenceDrop={vi.fn()}/>);return onPatch;}
it('切换生成模式清掉精确参考，旧file不能残留阻断合法保存',()=>{const patch=view();fireEvent.change(screen.getByRole('combobox',{name:'生成模式'}),{target:{value:'text_to_image'}});expect(patch.mock.calls[0]?.[1]).toHaveProperty('referenceFileId',undefined);expect(patch.mock.calls[0]?.[1]).toHaveProperty('referenceAssetId',undefined);});
it('换参考资产清掉旧精确file，沿画布提交冻结新文件',()=>{const patch=view();fireEvent.change(screen.getByRole('combobox',{name:'参考图片'}),{target:{value:'new'}});expect(patch.mock.calls[0]?.[1]).toHaveProperty('referenceFileId',undefined);expect(patch.mock.calls[0]?.[1]).toHaveProperty('referenceAssetId','new');});
