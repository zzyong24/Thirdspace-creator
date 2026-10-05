import * as React from 'react';
import {act,cleanup,fireEvent,render,screen,waitFor} from '@testing-library/react';
import {afterEach,beforeEach,expect,it,vi} from 'vitest';
import type {ArticleDocument} from '@creatoros/contract';
import {DoocsArticleEditor} from './doocs-article-editor';
import {serializeArticleMarkdown} from './doocs-markdown';
const h=vi.hoisted(()=>({live:null as any,request:vi.fn(),save:vi.fn(),change:vi.fn(),getOutput:vi.fn(),upload:vi.fn(),changed:null as null|((value:unknown)=>void),importMedia:null as null|((file:File)=>Promise<{mediaId:string}>)}));
vi.mock('@/lib/contract-client',()=>({client:{getOutput:h.getOutput}}));
vi.mock('@/features/reference-editors/reference-editor-media',()=>({uploadEditorMedia:h.upload}));
// 原引擎构建独立验证；这里只验证原宿主的缓存/素材/CAS回调与隔离边界。
vi.mock('@/features/reference-editors/native-editor-surface',()=>({NativeEditorSurface:React.forwardRef(function Surface(props:any,ref:any){React.useImperativeHandle(ref,()=>({request:h.request}),[]);h.changed=(value:any)=>{h.live=value;props.onChanged(value);};h.importMedia=props.onImport;React.useEffect(()=>{props.onReady();},[]);return <div data-testid="doocs-native"/>;})}));
const document:ArticleDocument={schemaVersion:1,title:'文章',summary:'摘要',sections:[{sectionId:'section',order:0,heading:'要点',headingLevel:2,body:'原正文',sourceRefs:[]}],factItems:[],visualBriefs:[],imageUses:[]};
const props={accountId:'account',outputId:'output',sourceVersionId:'version',value:document,savedDocument:document,onChange:h.change,onSave:h.save};
const layout={schemaVersion:1,editor:'doocs-md',editorCommit:'a7c17fc4cda92e3c13aa7e24f06615cfa4219b31',themeId:'default',themeSettings:{},customCss:'',exportOptions:{useIndent:false,useJustify:false}};
beforeEach(()=>{vi.clearAllMocks();sessionStorage.clear();h.live={markdown:serializeArticleMarkdown(document.sections),layout:undefined};h.request.mockImplementation(async(op:string,payload:any)=>{if(op==='load'){h.live={markdown:payload.document.markdown,layout:payload.document.layout??undefined};return h.live;}if(op==='snapshot')return h.live;return {};});h.save.mockResolvedValue(true);h.getOutput.mockResolvedValue({projectId:'project'});h.upload.mockResolvedValue({mediaId:'registered',assetId:'asset',assetFileId:'file'});});
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
 const file=new File(['pixels'],'image.png',{type:'image/png'});expect(await h.importMedia!(file)).toEqual({mediaId:'creatoros-asset:asset:file'});expect(h.upload).toHaveBeenCalledWith('project','output',file);await act(async()=>h.changed!({markdown,layout}));expect(h.change.mock.calls[0]![0].imageUses).toEqual([{sectionId:'section',assetId:'asset',assetFileId:'file',sourceKind:'existing',reviewState:'selected'}]);
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
