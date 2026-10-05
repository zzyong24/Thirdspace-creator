import * as React from 'react';
import {render,fireEvent,screen,waitFor,cleanup,act} from '@testing-library/react';
import {it,expect,vi,afterEach,beforeEach} from 'vitest';
import {DoocsArticleEditor} from '/Users/zyongzhu/.codex/worktrees/user-diagnostics/Thirdspace-creator/frontend/src/features/article/doocs-article-editor';
import {serializeArticleMarkdown} from '/Users/zyongzhu/.codex/worktrees/user-diagnostics/Thirdspace-creator/frontend/src/features/article/doocs-markdown';
const h=vi.hoisted(()=>({request:vi.fn(),save:vi.fn(),live:'',changed:null as any}));
vi.mock('@/lib/contract-client',()=>({client:{}}));
vi.mock('@/features/reference-editors/native-editor-surface',()=>({NativeEditorSurface:React.forwardRef(function Surface(props:any,ref:any){React.useImperativeHandle(ref,()=>({request:h.request}),[]);h.changed=props.onChanged;React.useEffect(()=>props.onReady(),[]);return <div/>;})}));
const original={schemaVersion:1,title:'文章',summary:'',sections:[{sectionId:'same-section',order:0,heading:'要点',headingLevel:2,body:'原正文',sourceRefs:[]}],factItems:[],visualBriefs:[],imageUses:[]};
const layout={schemaVersion:1,editor:'doocs-md',editorCommit:'a7c17fc4cda92e3c13aa7e24f06615cfa4219b31',themeId:'default',themeSettings:{},customCss:'',exportOptions:{useIndent:false,useJustify:false}};
const props={accountId:'a',outputId:'o',sourceVersionId:'v',value:original,savedDocument:original,onChange:()=>{},onSave:h.save};
beforeEach(()=>{vi.clearAllMocks();sessionStorage.clear();h.live='';h.save.mockResolvedValue(true);h.request.mockImplementation(async(op:string,payload:any)=>{if(op==='load')h.live=payload.document.markdown;return {markdown:h.live,layout};});});
afterEach(cleanup);
async function open(){const view=render(<DoocsArticleEditor {...props} />);await waitFor(()=>expect(screen.getByRole('button',{name:'保存正文与排版'})).not.toBeDisabled());return view;}
it('外部同段正文更新后同步真实当前稿再保存',async()=>{
 const view=await open();const changed={...original,title:'外部新标题',sections:[{...original.sections[0],body:'用户刚在当前稿件textarea写的新正文'}]};view.rerender(<DoocsArticleEditor {...props} value={changed} />);
 await waitFor(()=>expect(h.request.mock.calls.filter(([op])=>op==='load')).toHaveLength(2));await waitFor(()=>expect(screen.getByRole('button',{name:'保存正文与排版'})).not.toBeDisabled());
 fireEvent.click(screen.getByRole('button',{name:'保存正文与排版'}));await waitFor(()=>expect(h.save).toHaveBeenCalled());
 expect(h.save.mock.calls[0][0].sections[0].body).toBe(changed.sections[0].body);expect(h.save.mock.calls[0][0].title).toBe(changed.title);
});
it('通知窗口内保存读取native即时snapshot',async()=>{
 await open();h.live=serializeArticleMarkdown([{...original.sections[0],body:'最后一秒的新正文'}]);
 fireEvent.click(screen.getByRole('button',{name:'保存正文与排版'}));await waitFor(()=>expect(h.save).toHaveBeenCalled());
 expect(h.save.mock.calls[0][0].sections[0].body).toBe('最后一秒的新正文');expect(h.request.mock.calls.at(-1)[0]).toBe('snapshot');
});
it('通知窗口内未保存正文不能冒充正式导出',async()=>{
 await open();h.live=serializeArticleMarkdown([{...original.sections[0],body:'尚未保存但原生已改'}]);
 fireEvent.click(screen.getByRole('button',{name:'导出 HTML + 图片 ZIP'}));expect(await screen.findByRole('alert')).toHaveTextContent('尚未保存');expect(h.request.mock.calls.some(([op])=>op==='export-html')).toBe(false);
});
it('原生回传进入父状态后不load从而保留Undo',async()=>{
 function Parent(){const[value,setValue]=React.useState<any>(original);return <DoocsArticleEditor {...props} value={value} onChange={setValue}/>;}
 render(<Parent/>);await waitFor(()=>expect(screen.getByRole('button',{name:'保存正文与排版'})).not.toBeDisabled());
 const markdown=serializeArticleMarkdown([{...original.sections[0],body:'原生刚编辑的正文'}]);h.live=markdown;await act(async()=>h.changed({markdown,layout}));
 await waitFor(()=>expect(screen.getByRole('button',{name:'保存正文与排版'})).not.toBeDisabled());expect(h.request.mock.calls.filter(([op])=>op==='load')).toHaveLength(1);
});
