import {act,cleanup,render,screen,waitFor} from '@testing-library/react';
import {afterEach,beforeEach,expect,it,vi} from 'vitest';
import {AssetMediaPreview} from './asset-media-preview';
const h=vi.hoisted(()=>({url:vi.fn(),scope:{groupId:'fixture',accountId:null}}));
vi.mock('@/lib/creation-workspace-scope',()=>{const workspace={scope:h.scope,client:{getAssetFileDownloadUrl:h.url},assertCurrent:vi.fn()};return {useCreationScope:()=>h.scope,useCreationWorkspace:()=>workspace,creationScopeKey:()=> 'group:fixture'};});
beforeEach(()=>h.url.mockReset());afterEach(cleanup);
it('精确文件版本变化立即隐藏旧图，旧下载回执不替换新版本',async()=>{
 let old!:(value:{url:string})=>void;h.url.mockImplementationOnce(()=>new Promise(r=>{old=r;})).mockResolvedValueOnce({url:'http://localhost/new-version'});
 const view=render(<AssetMediaPreview assetId="same" fileId="old" type="image"/>);
 await waitFor(()=>expect(h.url).toHaveBeenCalledTimes(1));view.rerender(<AssetMediaPreview assetId="same" fileId="new" type="image"/>);
 await waitFor(()=>expect(screen.getByRole('img')).toHaveAttribute('src','http://localhost/new-version'));
 await act(async()=>old({url:'http://localhost/old-version'}));expect(screen.getByRole('img')).toHaveAttribute('src','http://localhost/new-version');
 expect(h.url.mock.calls.map(call=>call[0].params.assetFileId)).toEqual(['old','new']);
});
it('没有精确文件ID不读另一版本，失败只显示预览不可用',async()=>{
 const view=render(<AssetMediaPreview assetId="same" type="image"/>);expect(h.url).not.toHaveBeenCalled();
 h.url.mockRejectedValueOnce(Error('原文件无法读取'));view.rerender(<AssetMediaPreview assetId="same" fileId="missing" type="image"/>);
 await waitFor(()=>expect(h.url).toHaveBeenCalledTimes(1));expect(screen.getByText('预览暂不可用')).toBeVisible();expect(screen.queryByRole('img')).toBeNull();
});
it('音频缩略图不下载文件，预听仅读取用户选择的精确版本',async()=>{
 const view=render(<AssetMediaPreview assetId="audio" fileId="one" type="audio" thumbnail/>);expect(h.url).not.toHaveBeenCalled();
 h.url.mockResolvedValue({url:'http://localhost/audio'});view.rerender(<AssetMediaPreview assetId="audio" fileId="one" type="audio"/>);
 await waitFor(()=>expect(view.container.querySelector('audio')).toHaveAttribute('src','http://localhost/audio'));expect(view.container.querySelector('audio')).toHaveAttribute('preload','none');
});
it('视频缩略图只加载媒体信息；预览才显示播放控件',async()=>{
 h.url.mockResolvedValue({url:'http://localhost/video'});const view=render(<AssetMediaPreview assetId="video" fileId="one" type="video" thumbnail/>);
 await waitFor(()=>expect(view.container.querySelector('video')).toHaveAttribute('src','http://localhost/video'));expect(view.container.querySelector('video')).toHaveAttribute('preload','metadata');expect(view.container.querySelector('video')).not.toHaveAttribute('controls');
 view.rerender(<AssetMediaPreview assetId="video" fileId="one" type="video"/>);await waitFor(()=>expect(view.container.querySelector('video')).toHaveAttribute('controls'));
});
