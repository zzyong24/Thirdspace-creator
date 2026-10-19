import * as React from 'react';
import {afterEach,expect,it,vi} from 'vitest';
import {cleanup,fireEvent,render,screen,waitFor} from '@testing-library/react';
const h=vi.hoisted(()=>({request:vi.fn(),options:null as any}));
vi.mock('@/features/reference-editors/native-editor-surface',()=>({NativeEditorSurface:React.forwardRef(function Surface(props:any,ref:any){h.options=props;React.useImperativeHandle(ref,()=>({request:h.request}),[]);React.useEffect(()=>props.onReady(),[]);return <div/>;})}));
vi.mock('@/features/reference-editors/reference-editor-media',async importOriginal=>({...await importOriginal<any>(),hydrateGraphicDocument:vi.fn(async(value:any)=>({document:value.nativeDocument,revoke(){}})),downloadEditorExport:vi.fn()}));
vi.mock('@/components/ui/dialog',()=>({Dialog:({children}:any)=><div>{children}</div>,DialogContent:({children}:any)=><div>{children}</div>,DialogTitle:({children}:any)=><h1>{children}</h1>}));
import {GraphicDesignWorkbench} from '/Users/zyongzhu/.codex/worktrees/user-diagnostics/Thirdspace-creator/frontend/src/features/reference-editors/graphic-design-workbench';
afterEach(cleanup);
it('已知409之后原生稿不能陷入全部恢复入口禁用的死局',async()=>{
 const document={editor:'kuaitu' as const,revision:'b3bdcfb0bd6d8f98e7483cf561ac03ba56c0d889',mediaRefs:[],nativeDocument:{objects:[{type:'textbox',text:'本地未保存的原生设计'}]}};
 h.request.mockResolvedValue({document:document.nativeDocument});const save=vi.fn().mockRejectedValue(Object.assign(Error('服务端已另存新版本'),{status:409}));
 render(<GraphicDesignWorkbench accountId="a" sourceVersionId="v1" projectId="p" outputId="o" title="设计" design={{target:{kind:'cover'},document}} onSave={save} onClose={()=>{}}/>);
 await waitFor(()=>expect(screen.getByRole('button',{name:'保存设计'})).not.toBeDisabled());fireEvent.click(screen.getByRole('button',{name:'保存设计'}));await screen.findByText('服务端已另存新版本');
 // An unknown receipt may keep an immutable retry. A known CAS conflict needs a usable recovery or backup action.
 const hasRecovery=screen.queryAllByRole('button').some(button=>!button.hasAttribute('disabled')&&/核对|备份|恢复|读取/.test(button.textContent??''));
 expect(hasRecovery||h.options.disabled===false).toBe(true);
});
