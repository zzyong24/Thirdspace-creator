import * as React from 'react';
import {act,cleanup,fireEvent,render,screen,waitFor} from '@testing-library/react';
import {afterEach,beforeEach,expect,it,vi} from 'vitest';
import {NativeEditorSurface} from './native-editor-surface';
import type {NativeEditorHandle,NativeEditorOptions} from './native-editor-contract';
const h=vi.hoisted(()=>({load:vi.fn(),mount:vi.fn(),request:vi.fn(),update:vi.fn(),dispose:vi.fn()}));
vi.mock('./native-editor-loader',()=>({loadNativeEditor:h.load}));
const owner={groupId:null,accountId:'account',projectId:'project',outputId:'output',sourceVersionId:'version'};
let options:NativeEditorOptions;
const props={editor:'kuaitu' as const,owner,onReady:vi.fn(),onChanged:vi.fn(),onError:vi.fn(),onImport:vi.fn(async()=>({mediaId:'real-media'}))};
beforeEach(()=>{vi.clearAllMocks();document.documentElement.classList.remove('dark');document.documentElement.style.setProperty('--creatoros-surface','#ffffff');document.documentElement.style.setProperty('--creatoros-font-sans','sans-serif');h.load.mockResolvedValue({mount:h.mount});h.mount.mockImplementation(async(container:HTMLElement,value:NativeEditorOptions)=>{options=value;container.textContent='真实挂载点（引擎夹具）';return{request:h.request,update:h.update,dispose:h.dispose};});h.dispose.mockResolvedValue(undefined);h.request.mockResolvedValue({document:{value:'original'}});});
afterEach(()=>{cleanup();vi.useRealTimers();});
async function connect(container:HTMLElement){await waitFor(()=>expect(container.querySelector('[aria-label="图片设计工作台"]')?.shadowRoot?.querySelector('link')).toBeTruthy());const element=container.querySelector('[aria-label="图片设计工作台"]')!;await act(async()=>fireEvent.load(element.shadowRoot!.querySelector('link')!));await waitFor(()=>expect(props.onReady).toHaveBeenCalled());return element;}
it('同页ShadowRoot真实挂载并直调句柄；portal与owner均归当前实例，无iframe/message桥',async()=>{
 const ref=React.createRef<NativeEditorHandle>(),view=render(<NativeEditorSurface {...props} ref={ref}/>);const host=await connect(view.container);expect(view.container.querySelector('iframe')).toBeNull();expect(options.portalContainer.getRootNode()).toBe(host.shadowRoot);expect(options.owner).toEqual(owner);expect(host.shadowRoot!.textContent).toContain('真实挂载点');
 expect(await ref.current!.request('snapshot')).toEqual({document:{value:'original'}});expect(h.request).toHaveBeenCalledWith('snapshot',undefined,expect.objectContaining({requestId:expect.any(String)}));
 options.onChanged();expect(props.onChanged).toHaveBeenCalledOnce();expect(await options.importMedia(new File(['image'],'image.png',{type:'image/png'}))).toEqual({mediaId:'real-media'});
});
it('主题与密度更新原生UI而不重建工程；不写应用body',async()=>{
 const view=render(<NativeEditorSurface {...props}/>),host=await connect(view.container),bodyStyle=document.body.getAttribute('style');
 await act(async()=>{document.documentElement.classList.add('dark');document.documentElement.dataset.density='compact';document.documentElement.style.setProperty('--creatoros-surface','#181b23');});
 await waitFor(()=>expect(host.getAttribute('data-theme')).toBe('dark'));expect(host.getAttribute('data-density')).toBe('compact');expect(h.update).toHaveBeenLastCalledWith(expect.objectContaining({theme:expect.objectContaining({mode:'dark',density:'compact',tokens:expect.objectContaining({'--creatoros-surface':'#181b23'})})}));expect(h.mount).toHaveBeenCalledOnce();expect(document.body.getAttribute('style')).toBe(bodyStyle);
});
it('换作品取消旧实例；迟到回执不返回新工程、旧导入不能采用',async()=>{
 let finish:(value:unknown)=>void=()=>{};h.request.mockImplementation(()=>new Promise(resolve=>{finish=resolve;}));const ref=React.createRef<NativeEditorHandle>(),view=render(<NativeEditorSurface {...props} ref={ref}/>);await connect(view.container);const old=options,request=ref.current!.request('snapshot');const rejected=expect(request).rejects.toThrow('已切换作品');
 view.rerender(<NativeEditorSurface {...props} owner={{...owner,outputId:'next'}} ref={ref}/>);await waitFor(()=>expect(old.signal.aborted).toBe(true));await act(async()=>finish({document:{old:true}}));await rejected;expect(h.dispose).toHaveBeenCalledOnce();await expect(old.importMedia(new File(['x'],'x.png'))).rejects.toThrow();
});
it('mount异步结束前卸载，最终句柄仍销毁且不触发ready',async()=>{
 let finish:(value:NativeEditorHandle)=>void=()=>{};h.mount.mockImplementation(()=>new Promise(resolve=>{finish=resolve;}));const view=render(<NativeEditorSurface {...props}/>);await waitFor(()=>expect(view.container.querySelector('[aria-label="图片设计工作台"]')?.shadowRoot?.querySelector('link')).toBeTruthy());await act(async()=>fireEvent.load(view.container.querySelector('[aria-label="图片设计工作台"]')!.shadowRoot!.querySelector('link')!));await waitFor(()=>expect(h.mount).toHaveBeenCalled());view.unmount();await act(async()=>finish({request:h.request,update:h.update,dispose:h.dispose}));expect(h.dispose).toHaveBeenCalledOnce();expect(props.onReady).not.toHaveBeenCalled();
});
it('实际加载失败保留真实错误和可辨识状态',async()=>{
 h.load.mockRejectedValue(new Error('模块读取失败'));render(<NativeEditorSurface {...props}/>);await waitFor(()=>expect(props.onError).toHaveBeenCalledWith('模块读取失败'));expect(screen.getByRole('status')).toHaveTextContent('当前稿件已保留');
});
it('同ID在途请求拒绝重复；超时重试后旧回执不能消费新请求',async()=>{
 const replies:Array<(value:unknown)=>void>=[];h.request.mockImplementation(()=>new Promise(resolve=>replies.push(resolve)));
 const ref=React.createRef<NativeEditorHandle>(),view=render(<NativeEditorSurface {...props} ref={ref}/>);await connect(view.container);vi.useFakeTimers();
 const first=ref.current!.request('apply-tracks',{}, {requestId:'receipt'}),failed=expect(first).rejects.toThrow('尚未确认');
 await act(async()=>{await Promise.resolve();});await expect(ref.current!.request('apply-tracks',{}, {requestId:'receipt'})).rejects.toThrow('仍在确认');
 await act(async()=>vi.advanceTimersByTime(900000));await failed;
 let secondFinished=false;const second=ref.current!.request('apply-tracks',{}, {requestId:'receipt'}).then(value=>{secondFinished=true;return value;});
 await act(async()=>{await Promise.resolve();replies[0]!({old:true});await Promise.resolve();});expect(secondFinished).toBe(false);
 await act(async()=>replies[1]!({applied:true}));expect(await second).toEqual({applied:true});
});

it('同组切平台保留原生实例与完整父根；跨组才销毁',async()=>{
 const groupOwner={groupId:'group-a',accountId:'platform-a',projectId:'project',outputId:'output',sourceVersionId:'version'};
 const view=render(<NativeEditorSurface {...props} owner={groupOwner}/>);await connect(view.container);const first=options;
 expect(options.owner).toEqual({...groupOwner,accountId:null});
 view.rerender(<NativeEditorSurface {...props} owner={{...groupOwner,accountId:'platform-b'}}/>);
 expect(h.mount).toHaveBeenCalledOnce();expect(first.signal.aborted).toBe(false);
 view.rerender(<NativeEditorSurface {...props} owner={{...groupOwner,groupId:'group-b'}}/>);
 await waitFor(()=>expect(first.signal.aborted).toBe(true));
});
it('宿主取消真实透传请求signal，而非只丢弃解码结果',async()=>{
 let nativeSignal:AbortSignal|null=null;h.request.mockImplementation((_operation,_payload,value)=>{nativeSignal=value.signal;return new Promise(()=>{});});
 const ref=React.createRef<NativeEditorHandle>(),view=render(<NativeEditorSurface {...props} ref={ref}/>);await connect(view.container);
 const controller=new AbortController(),promise=ref.current!.request('read-original-audio-range',{}, {signal:controller.signal});const rejected=expect(promise).rejects.toThrow('已停止');
 await act(async()=>{await Promise.resolve();controller.abort();});await rejected;expect((nativeSignal as AbortSignal|null)?.aborted).toBe(true);
});
