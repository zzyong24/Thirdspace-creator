import * as React from 'react';
import {act,cleanup,fireEvent,render,screen,waitFor} from '@testing-library/react';
import {afterEach,beforeEach,expect,it,vi} from 'vitest';
import type {ArticleDocument} from '@creatoros/contract';
import {DoocsArticleEditor} from './doocs-article-editor';
import {unzipSync,strFromU8} from 'fflate';
import {serializeArticleMarkdown} from './doocs-markdown';
const h=vi.hoisted(()=>({live:null as any,readyError:null as string|null,request:vi.fn(),save:vi.fn(),change:vi.fn(),getOutput:vi.fn(),upload:vi.fn(),changed:null as null|((value:unknown)=>void),importMedia:null as null|((file:File)=>Promise<{mediaId:string}>)}));
vi.mock('@/lib/contract-client',()=>({client:{getOutput:h.getOutput}}));
vi.mock('@/features/reference-editors/reference-editor-media',()=>({uploadEditorMedia:h.upload}));
// 原引擎构建独立验证；这里只验证原宿主的缓存/素材/CAS回调与隔离边界。
vi.mock('@/features/reference-editors/native-editor-surface',()=>({NativeEditorSurface:React.forwardRef(function Surface(props:any,ref:any){React.useImperativeHandle(ref,()=>({request:h.request}),[]);h.changed=(value:any)=>{h.live=value;props.onChanged(value);};h.importMedia=props.onImport;React.useEffect(()=>{if(h.readyError){const message=h.readyError;h.readyError=null;props.onError(message);}else props.onReady();},[]);return <div data-testid="doocs-native"/>;})}));
vi.mock('@/lib/creation-workspace-scope',async importOriginal=>{const actual=await importOriginal<any>(),{client:scopeClient}=await import('@/lib/contract-client');return {...actual,useCreationWorkspace:(scope:any)=>{const workspace=actual.useCreationWorkspace(scope);return {...workspace,client:scopeClient,capture:()=>Object.freeze({...workspace.capture(),client:scopeClient})};}};});

const document:ArticleDocument={schemaVersion:1,title:'文章',summary:'摘要',sections:[{sectionId:'section',order:0,heading:'要点',headingLevel:2,body:'原正文',sourceRefs:[]}],factItems:[],visualBriefs:[],imageUses:[]};
const props={projectId:'project',accountId:'account',outputId:'output',sourceVersionId:'version',value:document,savedDocument:document,onChange:h.change,onSave:h.save};
const layout={schemaVersion:1,editor:'doocs-md',editorCommit:'a7c17fc4cda92e3c13aa7e24f06615cfa4219b31',themeId:'default',themeSettings:{},customCss:'',exportOptions:{useIndent:false,useJustify:false}};
beforeEach(()=>{localStorage.removeItem("creatoros:current-group");localStorage.setItem("creatoros:current-account","account");vi.clearAllMocks();h.readyError=null;sessionStorage.clear();h.live={markdown:serializeArticleMarkdown(document.sections),layout:undefined};h.request.mockImplementation(async(op:string,payload:any)=>{if(op==='load'){h.live={markdown:payload.document.markdown,layout:payload.document.layout??undefined};return h.live;}if(op==='snapshot')return h.live;return {};});h.save.mockResolvedValue(true);h.getOutput.mockResolvedValue({projectId:'project'});h.upload.mockResolvedValue({mediaId:'registered',assetId:'asset',assetFileId:'file'});});
afterEach(cleanup);
it('同页原生修改段落保留稳定ID和正式保存回调，没有iframe',async()=>{
 const view=render(<DoocsArticleEditor {...props}/>);await waitFor(()=>expect(h.request).toHaveBeenCalledWith('load',expect.objectContaining({document:expect.objectContaining({title:'文章'})}),expect.objectContaining({signal:expect.any(AbortSignal)})));expect(view.container.querySelector('iframe')).toBeNull();
 const markdown=serializeArticleMarkdown([{...document.sections[0]!,body:'编辑后正文'}]);await act(async()=>h.changed!({markdown,layout}));expect(h.change.mock.calls[0]![0].sections[0]).toEqual({...document.sections[0],body:'编辑后正文'});
 fireEvent.click(screen.getByRole('button',{name:'保存正文与排版'}));await waitFor(()=>expect(h.save).toHaveBeenCalled());expect(h.save.mock.calls[0]![0].nativeLayout).toEqual(layout);expect(h.save.mock.calls[0]![0].sections[0].sectionId).toBe('section');
});
it('旧版本草稿只读且不会被500ms缓存覆盖；相同版本可明确恢复',async()=>{
 const old={...document,title:'未保存的文章'};const cache={accountId:'account',outputId:'output',sourceVersionId:'old',updatedAt:Date.now(),document:old,markdown:serializeArticleMarkdown(old.sections)};sessionStorage.setItem('creatoros:article:draft:account:output',JSON.stringify(cache));
 const view=render(<DoocsArticleEditor {...props}/>);expect(await screen.findByRole('status')).toHaveTextContent('旧版本草稿');expect(screen.queryByRole('button',{name:'恢复未保存草稿'})).toBeNull();await new Promise(resolve=>setTimeout(resolve,550));expect(JSON.parse(sessionStorage.getItem('creatoros:article:draft:account:output')!).document.title).toBe('未保存的文章');
 view.unmount();sessionStorage.setItem('creatoros:article:draft:account:output',JSON.stringify({...cache,sourceVersionId:'version'}));render(<DoocsArticleEditor {...props}/>);fireEvent.click(await screen.findByRole('button',{name:'恢复未保存草稿'}));expect(h.change).toHaveBeenCalledWith(old);expect(h.request).toHaveBeenLastCalledWith('load',expect.objectContaining({document:expect.objectContaining({title:'未保存的文章'})}),expect.objectContaining({signal:expect.any(AbortSignal)}));
});
it('未知图片不能采用；File先经原真实上传端口，再按精确素材引用接回同一段',async()=>{
 render(<DoocsArticleEditor {...props}/>);await waitFor(()=>expect(h.request).toHaveBeenCalled());const markdown=serializeArticleMarkdown([{...document.sections[0]!,body:'正文\n\n<img src="creatoros-asset:asset:file" alt="配图" />'}]);await act(async()=>h.changed!({markdown,layout}));expect(h.change).not.toHaveBeenCalled();expect(await screen.findByRole('alert')).toHaveTextContent('素材');
 const file=new File(['pixels'],'image.png',{type:'image/png'});expect(await h.importMedia!(file)).toEqual({mediaId:'creatoros-asset:asset:file'});expect(h.upload).toHaveBeenCalledTimes(1);const operation=h.upload.mock.calls[0]![3];expect(h.upload.mock.calls[0]!.slice(0,3)).toEqual(['project','output',file]);expect(operation).toEqual(expect.objectContaining({scope:{groupId:null,accountId:'account'},epoch:0,signal:expect.any(AbortSignal),assertCurrent:expect.any(Function),client:expect.any(Object)}));expect(Object.isFrozen(operation)).toBe(true);expect(operation.signal.aborted).toBe(false);expect(()=>operation.assertCurrent()).not.toThrow();await act(async()=>h.changed!({markdown,layout}));expect(h.change.mock.calls[0]![0].imageUses).toEqual([{sectionId:'section',assetId:'asset',assetFileId:'file',sourceKind:'existing',reviewState:'selected'}]);
});
it('切换作品后旧回调不落新稿；未保存稿不能导出正式物料',async()=>{
 const view=render(<DoocsArticleEditor {...props}/>);await waitFor(()=>expect(h.request).toHaveBeenCalled());const old=h.changed!;view.rerender(<DoocsArticleEditor {...props} outputId="next" value={{...document,title:'修改稿'}}/>);await waitFor(()=>expect(screen.getByTestId('doocs-native')).toBeInTheDocument());await act(async()=>old({markdown:serializeArticleMarkdown([{...document.sections[0]!,body:'迟到旧稿'}]),layout}));expect(h.change).not.toHaveBeenCalled();expect(screen.getByRole('button',{name:'导出 HTML + 图片 ZIP'})).toBeDisabled();
});

it('同owner外部正文/标题/版式变化同步原编辑器，采纳回显保留撤销不重复load',async()=>{
 const view=render(<DoocsArticleEditor {...props}/>);await waitFor(()=>expect(screen.getByRole('button',{name:'保存正文与排版'})).not.toBeDisabled());
 const changed={...document,title:'外部标题',sections:[{...document.sections[0]!,body:'外部正文'}],nativeLayout:{...layout,themeId:'改变主题'}} as ArticleDocument;
 view.rerender(<DoocsArticleEditor {...props} value={changed}/>);await waitFor(()=>expect(screen.getByRole('button',{name:'保存正文与排版'})).not.toBeDisabled());fireEvent.click(screen.getByRole('button',{name:'保存正文与排版'}));await waitFor(()=>expect(h.save).toHaveBeenCalled());expect(h.save.mock.calls[0][0].sections[0].body).toBe('外部正文');expect(h.save.mock.calls[0][0].nativeLayout.themeId).toBe('改变主题');
 const native={...changed,sections:[{...changed.sections[0]!,body:'原生编辑'}]};const loads=h.request.mock.calls.filter(call=>call[0]==='load').length;await act(async()=>h.changed!({markdown:serializeArticleMarkdown(native.sections),layout:native.nativeLayout}));view.rerender(<DoocsArticleEditor {...props} value={native}/>);await waitFor(()=>expect(screen.getByRole('button',{name:'保存正文与排版'})).not.toBeDisabled());expect(h.request.mock.calls.filter(call=>call[0]==='load')).toHaveLength(loads);
});
it('保存读取实时snapshot，300ms未通知的新输入也保存；导出拒绝未通知的新正文',async()=>{
 render(<DoocsArticleEditor {...props}/>);await waitFor(()=>expect(screen.getByRole('button',{name:'保存正文与排版'})).not.toBeDisabled());h.live={markdown:serializeArticleMarkdown([{...document.sections[0]!,body:'还未触发通知的正文'}]),layout};fireEvent.click(screen.getByRole('button',{name:'导出 HTML + 图片 ZIP'}));expect(await screen.findByRole('alert')).toHaveTextContent('尚未保存');expect(h.request.mock.calls.some(call=>call[0]==='export-html')).toBe(false);fireEvent.click(screen.getByRole('button',{name:'保存正文与排版'}));await waitFor(()=>expect(h.save).toHaveBeenCalled());expect(h.save.mock.calls[0][0].sections[0].body).toBe('还未触发通知的正文');expect(h.request.mock.calls.filter(call=>call[0]==='snapshot')).toHaveLength(2);
});

it('精简交付读取保存回执的新版本，ZIP清单不会标成旧版本，也不提供第二文字入口',async()=>{
 const prepared=vi.fn(async()=>({versionId:'saved-v2',document}));let archive:Blob|null=null;
 vi.spyOn(URL,'createObjectURL').mockImplementation(blob=>{archive=blob as Blob;return 'blob:zip';});vi.spyOn(HTMLAnchorElement.prototype,'click').mockImplementation(()=>{});
 const original=h.request.getMockImplementation()!;h.request.mockImplementation((op:string,payload:any)=>op==='export-html'?Promise.resolve({html:'<p>原正文</p>',bindings:[]}):original(op,payload));
 render(<DoocsArticleEditor {...props} deliveryOnly prepareDelivery={prepared}/>);expect(screen.queryByRole('button',{name:'保存正文与排版'})).toBeNull();
 expect(screen.queryByTestId('doocs-native')).toBeNull();expect(h.request).not.toHaveBeenCalled();
 const button=screen.getByRole('button',{name:'导出 HTML + 图片 ZIP'});await waitFor(()=>expect(button).toBeEnabled());fireEvent.click(button);await waitFor(()=>expect(archive).not.toBeNull());
 const bytes=await new Promise<ArrayBuffer>((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(reader.result as ArrayBuffer);reader.onerror=reject;reader.readAsArrayBuffer(archive!);});
 const files=unzipSync(new Uint8Array(bytes));expect(JSON.parse(strFromU8(files['manifest.json']!))).toMatchObject({versionId:'saved-v2',outputId:'output'});expect(strFromU8(files['index.html']!)).toContain('原正文');expect(prepared).toHaveBeenCalledOnce();expect(h.change).not.toHaveBeenCalled();
});

it('隐藏导出准备失败可重试，一次点击等待保存及原生加载后交付',async()=>{
 const prepare=vi.fn().mockRejectedValueOnce(new Error('保存失败，请重试')).mockResolvedValue({versionId:'v2',document});
 const click=vi.spyOn(HTMLAnchorElement.prototype,'click').mockImplementation(()=>{});vi.spyOn(URL,'createObjectURL').mockReturnValue('blob:zip');
 const original=h.request.getMockImplementation()!;h.request.mockImplementation((op:string,payload:any)=>op==='export-html'?Promise.resolve({html:'<p>原正文</p>',bindings:[]}):original(op,payload));
 render(<DoocsArticleEditor {...props} deliveryOnly prepareDelivery={prepare}/>);
 fireEvent.click(screen.getByRole('button',{name:'导出 HTML + 图片 ZIP'}));expect(await screen.findByRole('alert')).toHaveTextContent('保存失败');expect(screen.queryByTestId('doocs-native')).toBeNull();
 fireEvent.click(screen.getByRole('button',{name:'导出 HTML + 图片 ZIP'}));await waitFor(()=>expect(click).toHaveBeenCalledOnce());expect(prepare).toHaveBeenCalledTimes(2);
});

it('隐藏导出等待保存期间改稿或切scope，旧回执不启动编辑器或交付',async()=>{
 let finish!:(value:any)=>void;const prepare=vi.fn(()=>new Promise<any>(resolve=>{finish=resolve;}));const click=vi.spyOn(HTMLAnchorElement.prototype,'click').mockImplementation(()=>{});
 const view=render(<DoocsArticleEditor {...props} deliveryOnly prepareDelivery={prepare}/>);fireEvent.click(screen.getByRole('button',{name:'导出 HTML + 图片 ZIP'}));
 view.rerender(<DoocsArticleEditor {...props} value={{...document,title:'已改稿'}} deliveryOnly prepareDelivery={prepare}/>);await act(async()=>finish({versionId:'v2',document}));expect(await screen.findByRole('alert')).toHaveTextContent('稿件已改变');expect(screen.queryByTestId('doocs-native')).toBeNull();expect(click).not.toHaveBeenCalled();
 fireEvent.click(screen.getByRole('button',{name:'导出 HTML + 图片 ZIP'}));view.rerender(<DoocsArticleEditor {...props} outputId="next" deliveryOnly prepareDelivery={prepare}/>);await act(async()=>finish({versionId:'v2',document}));expect(screen.queryByTestId('doocs-native')).toBeNull();expect(click).not.toHaveBeenCalled();
});

it('隐藏原生编辑器加载失败后点击可重开，加载中的重复点击不会重复保存',async()=>{
 const prepare=vi.fn(async()=>({versionId:'v2',document}));h.readyError='编辑器样式读取失败';const click=vi.spyOn(HTMLAnchorElement.prototype,'click').mockImplementation(()=>{});vi.spyOn(URL,'createObjectURL').mockReturnValue('blob:zip');
 let finish!:(value:any)=>void;const original=h.request.getMockImplementation()!;h.request.mockImplementation((op:string,payload:any)=>op==='load'?new Promise(resolve=>{finish=resolve;}):op==='export-html'?Promise.resolve({html:'<p>原正文</p>',bindings:[]}):original(op,payload));
 render(<DoocsArticleEditor {...props} deliveryOnly prepareDelivery={prepare}/>);fireEvent.click(screen.getByRole('button',{name:'导出 HTML + 图片 ZIP'}));expect(await screen.findByRole('alert')).toHaveTextContent('编辑器样式读取失败');expect(screen.queryByTestId('doocs-native')).toBeNull();
 const button=screen.getByRole('button',{name:'导出 HTML + 图片 ZIP'});fireEvent.click(button);await waitFor(()=>expect(h.request).toHaveBeenCalledWith('load',expect.anything(),expect.anything()));expect(screen.getByRole('status')).toHaveTextContent('正在准备导出');fireEvent.click(button);expect(prepare).toHaveBeenCalledTimes(2);
 await act(async()=>finish(h.live));await waitFor(()=>expect(click).toHaveBeenCalledOnce());
});

it('隐藏导出原生load期间改稿，晚回执不触发snapshot或交付',async()=>{
 let finish!:(value:any)=>void;h.request.mockImplementation((op:string)=>op==='load'?new Promise(resolve=>{finish=resolve;}):Promise.resolve({}));
 const prepare=vi.fn(async()=>({versionId:'v2',document}));const view=render(<DoocsArticleEditor {...props} deliveryOnly prepareDelivery={prepare}/>);fireEvent.click(screen.getByRole('button',{name:'导出 HTML + 图片 ZIP'}));await waitFor(()=>expect(h.request).toHaveBeenCalled());
 view.rerender(<DoocsArticleEditor {...props} value={{...document,title:'新稿'}} deliveryOnly prepareDelivery={prepare}/>);await act(async()=>finish(h.live));expect(await screen.findByRole('alert')).toHaveTextContent('稿件已改变');expect(h.request.mock.calls.map(([op])=>op)).toEqual(['load']);
});

it('旧版式稿只读呈现原引擎输出，保留暂存草稿恢复且不暴露编辑表单',async()=>{
 const original=h.request.getMockImplementation()!;h.request.mockImplementation((op:string,payload:any)=>op==='export-html'?Promise.resolve({html:'<p style="color:rgb(100, 0, 0)">原主题正文</p><script>bad()</script>',bindings:[]}):original(op,payload));
 const old={...document,title:'暂存原稿',nativeLayout:layout} as ArticleDocument;sessionStorage.setItem('creatoros:article:draft:account:output',JSON.stringify({accountId:'account',outputId:'output',sourceVersionId:'version',updatedAt:Date.now(),document:old,markdown:serializeArticleMarkdown(old.sections),layout}));
 render(<DoocsArticleEditor {...props} value={{...document,nativeLayout:layout} as ArticleDocument} deliveryOnly showPreview prepareDelivery={async()=>({versionId:'version',document})}/>);
 expect(await screen.findByText('原主题正文')).toHaveStyle({color:'rgb(100, 0, 0)'});expect(screen.getByLabelText('原版式成稿预览').querySelector('script')).toBeNull();expect(screen.queryAllByRole('textbox')).toHaveLength(0);fireEvent.click(screen.getByRole('button',{name:'恢复未保存草稿'}));expect(h.change).toHaveBeenCalledWith(old);
});

it('旧版式成稿可展开原排版并保存主题，隐藏交付仍不接受修改',async()=>{
 const original=h.request.getMockImplementation()!;h.request.mockImplementation((op:string,payload:any)=>op==='export-html'?Promise.resolve({html:'<p>原正文</p>',bindings:[]}):original(op,payload));
 render(<DoocsArticleEditor {...props} deliveryOnly showPreview prepareDelivery={async()=>({versionId:'v2',document})}/>);
 await waitFor(()=>expect(screen.getByRole('button',{name:'复制公众号文章'})).not.toBeDisabled());
 fireEvent.click(screen.getByRole('button',{name:'调整排版'}));expect(screen.getByTestId('doocs-native').parentElement).not.toHaveAttribute('inert');
 await act(async()=>h.changed!({markdown:serializeArticleMarkdown(document.sections),layout:{...layout,themeId:'new-theme'}}));expect(h.change.mock.calls.at(-1)?.[0].nativeLayout.themeId).toBe('new-theme');
 fireEvent.click(screen.getByRole('button',{name:'保存正文与排版'}));await waitFor(()=>expect(h.save).toHaveBeenCalledOnce());expect(h.save.mock.calls[0][0].sections).toEqual(document.sections);expect(screen.queryByText('开源来源与许可')).toBeNull();
});

it('排版输入尚未通知时立即收起，刷新仍可恢复最后正文和风格',async()=>{
 const original=h.request.getMockImplementation()!;h.request.mockImplementation((op:string,payload:any)=>op==='export-html'?Promise.resolve({html:'<p>最新正文</p>',bindings:[]}):original(op,payload));
 const view=render(<DoocsArticleEditor {...props} deliveryOnly showPreview/>);
 fireEvent.click(await screen.findByRole('button',{name:'调整排版'}));
 await waitFor(()=>expect(screen.getByRole('button',{name:'收起排版'})).toBeEnabled());
 const markdown=serializeArticleMarkdown([{...document.sections[0]!,body:'未满300ms的最后输入'}]);
 h.live={markdown,layout:{...layout,themeId:'last-theme'}};
 fireEvent.click(screen.getByRole('button',{name:'收起排版'}));
 await waitFor(()=>expect(screen.getByRole('button',{name:'调整排版'})).toBeEnabled());
 const checkpoint=JSON.parse(sessionStorage.getItem('creatoros:article:draft:account:output')!);
 expect(checkpoint.document.sections[0].body).toBe('未满300ms的最后输入');expect(checkpoint.document.nativeLayout.themeId).toBe('last-theme');
 expect(h.save).not.toHaveBeenCalled();view.unmount();h.change.mockClear();
 render(<DoocsArticleEditor {...props} deliveryOnly showPreview/>);
 fireEvent.click(await screen.findByRole('button',{name:'恢复未保存草稿'}));
 expect(h.change).toHaveBeenCalledWith(expect.objectContaining({sections:expect.arrayContaining([expect.objectContaining({body:'未满300ms的最后输入'})]),nativeLayout:expect.objectContaining({themeId:'last-theme'})}));
});
