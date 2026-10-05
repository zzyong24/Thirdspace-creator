import * as React from 'react';
import {afterEach,expect,it,vi} from 'vitest';
import {act,cleanup,fireEvent,render,screen,waitFor} from '@testing-library/react';
const h=vi.hoisted(()=>({request:vi.fn(),options:null as any}));
vi.mock('@/features/reference-editors/native-editor-surface',()=>({NativeEditorSurface:React.forwardRef(function Surface(props:any,ref:any){h.options=props;React.useImperativeHandle(ref,()=>({request:h.request}),[]);React.useEffect(()=>props.onReady(),[]);return <div/>;})}));
vi.mock('@/features/reference-editors/reference-editor-media',async importOriginal=>({...await importOriginal<any>(),hydrateGraphicDocument:vi.fn(async(value:any)=>({document:value.nativeDocument,revoke(){}})),downloadEditorExport:vi.fn()}));
vi.mock('@/components/ui/dialog',()=>({Dialog:({children}:any)=><div>{children}</div>,DialogContent:({children}:any)=><div>{children}</div>,DialogTitle:({children}:any)=><h1>{children}</h1>}));
import {GraphicDesignWorkbench} from '/Users/zyongzhu/.codex/worktrees/user-diagnostics/Thirdspace-creator/frontend/src/features/reference-editors/graphic-design-workbench';
afterEach(cleanup);
it('冻结稿保存回执期间原生追加图层必须仍为未保存修改',async()=>{
 let native={objects:[{type:'textbox',text:'冻结稿'}]};
 const document={editor:'kuaitu' as const,revision:'b3bdcfb0bd6d8f98e7483cf561ac03ba56c0d889',mediaRefs:[],nativeDocument:native};
 h.request.mockImplementation(async()=>({document:structuredClone(native)}));let finish!:()=>void;const save=vi.fn(()=>new Promise<void>(resolve=>finish=resolve));
 render(<GraphicDesignWorkbench accountId="a" sourceVersionId="v1" projectId="p" outputId="o" title="设计" design={{target:{kind:'cover'},document}} onSave={save} onClose={()=>{}}/>);
 await waitFor(()=>expect(screen.getByRole('button',{name:'保存设计'})).not.toBeDisabled());fireEvent.click(screen.getByRole('button',{name:'保存设计'}));await waitFor(()=>expect(save).toHaveBeenCalled());
 native={objects:[...native.objects,{type:'image',text:'慢导入新层'}]};await act(async()=>h.options.onChanged());await act(async()=>finish());
 expect(screen.getByText('有未保存修改')).toBeInTheDocument();
});
