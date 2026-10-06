import * as React from 'react';
import {afterEach,beforeEach,expect,it,vi} from 'vitest';
import {cleanup,fireEvent,render,screen,waitFor} from '@testing-library/react';
const h=vi.hoisted(()=>({request:vi.fn(),upload:vi.fn(),download:vi.fn(),options:null as any}));
vi.mock('./native-editor-surface',()=>({NativeEditorSurface:React.forwardRef(function Surface(props:any,ref:any){h.options=props;React.useImperativeHandle(ref,()=>({request:h.request}),[]);React.useEffect(()=>{props.onReady();},[]);return <div>实际画布的宿主边界</div>;})}));
vi.mock('./reference-editor-media',async importOriginal=>({...await importOriginal<any>(),hydrateGraphicDocument:vi.fn(async(value:any)=>({document:value.nativeDocument,revoke:()=>{}})),uploadEditorMedia:h.upload,downloadEditorExport:h.download}));
vi.mock('@/components/ui/dialog',()=>({Dialog:({children}:any)=><div>{children}</div>,DialogContent:({children}:any)=><div>{children}</div>,DialogTitle:({children}:any)=><h1>{children}</h1>}));
import {GraphicDesignWorkbench} from './graphic-design-workbench';
vi.mock('@/lib/creation-workspace-scope',async importOriginal=>{const actual=await importOriginal<any>(),{client:scopeClient}=await import('@/lib/contract-client');return {...actual,useCreationWorkspace:(scope:any)=>{const workspace=actual.useCreationWorkspace(scope);return {...workspace,client:scopeClient,capture:()=>({...workspace.capture(),client:scopeClient})};}};});

const document={editor:'kuaitu' as const,revision:'b3bdcfb0bd6d8f98e7483cf561ac03ba56c0d889',mediaRefs:[],nativeDocument:{objects:[{type:'textbox',text:'同一份图层'}]}};
const props={accountId:'account',sourceVersionId:'v1',projectId:'project',outputId:'output',title:'单页设计',design:{target:{kind:'cover' as const},document},onClose:vi.fn()};
beforeEach(()=>{localStorage.removeItem("creatoros:current-group");localStorage.setItem("creatoros:current-account","account");vi.clearAllMocks();h.request.mockImplementation(async(op:string)=>op==='export'?{document:document.nativeDocument,blob:new Blob(['png-fixture'],{type:'image/png'}),fileName:'本页.png'}:{document:document.nativeDocument});h.upload.mockResolvedValue({mediaId:'generated',assetId:'image',assetFileId:'exact-file'});});
afterEach(cleanup);
async function open(onSave:any){const view=render(<GraphicDesignWorkbench {...props} onSave={onSave}/>);await waitFor(()=>expect(screen.getByRole('button',{name:'保存设计'})).not.toBeDisabled());return view;}
it('CreatorOS Dialog内直接挂载原生画布，PNG与同次图层配对采用',async()=>{
 const save=vi.fn().mockResolvedValue(undefined);const view=await open(save);expect(view.container.querySelector('iframe')).toBeNull();expect(h.options.owner).toEqual({groupId:null,accountId:'account',projectId:'project',outputId:'output',sourceVersionId:'v1'});fireEvent.click(screen.getByRole('button',{name:'导出并采用图片'}));await screen.findByText('图片已采用到当前稿件，图层也已保存。');expect(save).toHaveBeenCalledWith(props.design,{mediaId:'generated',assetId:'image',assetFileId:'exact-file'});expect(h.download).toHaveBeenCalledOnce();
});
it('保存未知回执重试使用原冻结图层/原上传文件，不重复PNG生成和上传',async()=>{
 const save=vi.fn().mockRejectedValueOnce(Error('保存回执未知')).mockResolvedValue(undefined);await open(save);fireEvent.click(screen.getByRole('button',{name:'导出并采用图片'}));await screen.findByText('保存回执未知');expect(screen.getByRole('button',{name:'返回稿件'})).toBeDisabled();fireEvent.click(screen.getByRole('button',{name:'导出并采用图片'}));await screen.findByText('图片已采用到当前稿件，图层也已保存。');expect(h.request.mock.calls.filter(c=>c[0]==='export')).toHaveLength(1);expect(h.upload).toHaveBeenCalledOnce();expect(save.mock.calls[1]).toEqual(save.mock.calls[0]);
});
it('卸载后的迟到PNG不上传、不保存、不触发下载',async()=>{
 const save=vi.fn();const view=await open(save);let finish:(value:any)=>void=()=>{};h.request.mockImplementation(()=>new Promise(resolve=>{finish=resolve;}));fireEvent.click(screen.getByRole('button',{name:'导出并采用图片'}));view.unmount();finish({document:document.nativeDocument,blob:new Blob(['png-fixture'],{type:'image/png'}),fileName:'迟到.png'});await new Promise(resolve=>setTimeout(resolve,10));expect(save).not.toHaveBeenCalled();expect(h.upload).not.toHaveBeenCalled();expect(h.download).not.toHaveBeenCalled();
});
it('已知409保留本地稿，允许备份后读取当前版本；未知回执不走此路径',async()=>{
 const save=vi.fn().mockRejectedValue(Object.assign(Error('服务端已另存新版本'),{status:409})),reload=vi.fn().mockResolvedValue(undefined);
 render(<GraphicDesignWorkbench {...props} onSave={save} onReload={reload}/>);await waitFor(()=>expect(screen.getByRole('button',{name:'保存设计'})).not.toBeDisabled());fireEvent.click(screen.getByRole('button',{name:'保存设计'}));await screen.findByText('服务端已另存新版本');
 expect(h.options.disabled).toBe(false);fireEvent.click(screen.getByRole('button',{name:'备份本地稿并读取当前版本'}));await waitFor(()=>expect(reload).toHaveBeenCalledOnce());expect(h.download).toHaveBeenCalledOnce();const backup=JSON.parse(await h.download.mock.calls[0][0].text());expect(backup.design.document).toEqual(document);expect(backup.sourceVersionId).toBe('v1');
});
it('保存期间完成的合法图片导入仍显示未保存，不覆盖已冻结服务请求',async()=>{
 let complete:()=>void=()=>{};const save=vi.fn((_design:typeof props.design)=>new Promise<void>(resolve=>{complete=resolve;}));await open(save);fireEvent.click(screen.getByRole('button',{name:'保存设计'}));await waitFor(()=>expect(save).toHaveBeenCalledOnce());
 const later={objects:[...document.nativeDocument.objects,{type:'textbox',text:'保存期间的后续图层'}]};h.request.mockImplementation(async(op:string)=>({document:op==='snapshot'?later:document.nativeDocument}));h.options.onChanged();complete();await screen.findByText('有未保存修改');expect(save.mock.calls[0][0].document.nativeDocument).toEqual(document.nativeDocument);
});
