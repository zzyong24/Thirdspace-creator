import * as React from 'react';
import {act,fireEvent,render,screen,waitFor,cleanup} from '@testing-library/react';
import {it,expect,vi,afterEach,beforeEach} from 'vitest';
import type {ArticleDocument} from '@creatoros/contract';
import {NoteRelayEditor} from './noterelay-editor';
import {defaultLayout} from './projection';
const h=vi.hoisted(()=>({request:vi.fn(),getAssetFileDownloadUrl:vi.fn()}));
vi.mock('@/lib/contract-client',()=>({client:h}));
// 此夹具只验证React宿主的真实归属、控件与交付边界；原引擎见native-bundle.test.ts。
vi.mock('../native-editor-surface',()=>({NativeEditorSurface:React.forwardRef(function Surface(props:any,ref:any){React.useImperativeHandle(ref,()=>({request:h.request}),[]);React.useEffect(()=>{props.onReady();},[]);return <div data-testid="native-editor" data-owner={props.owner.accountId}/>;})}));
vi.mock('@/lib/creation-workspace-scope',async importOriginal=>{const actual=await importOriginal<any>(),{client:scopeClient}=await import('@/lib/contract-client');return {...actual,useCreationWorkspace:(scope:any)=>{const workspace=actual.useCreationWorkspace(scope);return {...workspace,client:scopeClient,capture:()=>({...workspace.capture(),client:scopeClient})};}};});

const doc:ArticleDocument={schemaVersion:1,title:'真实稿',summary:'',sections:[{sectionId:'s',order:0,heading:'要点',headingLevel:2,body:'当前正文',sourceRefs:[]}],factItems:[],visualBriefs:[],imageUses:[]};
beforeEach(()=>{localStorage.removeItem("creatoros:current-group");localStorage.setItem("creatoros:current-account","a");h.request.mockImplementation(async(operation:string)=>operation==='load'?{themes:[{id:'moyu-green',name:'摸鱼绿'}],images:[],selectedImage:'',pageIndex:0,pageCount:0}:{blob:new Blob(['<p>当前正文</p>'],{type:'text/html'}),plainText:'当前正文'});});
afterEach(()=>{cleanup();vi.clearAllMocks();vi.unstubAllGlobals();});
async function connected(){await waitFor(()=>expect(screen.getByRole('button',{name:'复制公众号文章'})).not.toBeDisabled());}
it('预览宿主无重复说明，区标题字体与脚本一致',async()=>{
 render(<NoteRelayEditor projectId="project-fixture" accountId="a" outputId="o" sourceVersionId="v" platform="wechat" value={doc} onLayoutChange={()=>{}}/>);await connected();
 expect(screen.queryByText('正文修改会更新预览，版式随稿件保存。')).not.toBeInTheDocument();
 expect(screen.getByRole('heading',{name:'成稿预览'})).toHaveClass('text-[13.5px]','font-semibold');
});
function exports(){const details=screen.getByText('更多导出').closest('details')!;details.open=true;fireEvent(details,new Event('toggle'));}
function settings(){const details=screen.getByText('排版设置').closest('details')!;details.open=true;fireEvent(details,new Event('toggle'));}
it('原生工作面与CreatorOS控件直接改当前版式，无iframe或window消息',async()=>{
 const onLayoutChange=vi.fn();const {container}=render(<NoteRelayEditor projectId="project-fixture" accountId="a" outputId="o" sourceVersionId="v" platform="wechat" value={doc} onLayoutChange={onLayoutChange}/>);await connected();expect(container.querySelector('iframe')).toBeNull();
 settings();fireEvent.change(screen.getByRole('textbox',{name:'署名'}),{target:{value:'署名'}});expect(onLayoutChange).toHaveBeenCalledWith({...defaultLayout('wechat'),authorName:'署名'});
 window.dispatchEvent(new MessageEvent('message',{data:{channel:'creatoros-noterelay',type:'layout',layout:{...defaultLayout('wechat'),authorName:'伪造'}}}));expect(onLayoutChange).toHaveBeenCalledTimes(1);expect(h.getAssetFileDownloadUrl).not.toHaveBeenCalled();
});
it('富文本复制使用ClipboardItem；不支持时可真实复制纯文本',async()=>{
 const write=vi.fn(async()=>{}),writeText=vi.fn(async()=>{});Object.defineProperty(navigator,'clipboard',{configurable:true,value:{write,writeText}});class Item{constructor(public data:Record<string,Blob>){}}vi.stubGlobal('ClipboardItem',Item);
 render(<NoteRelayEditor projectId="project-fixture" accountId="a" outputId="o" sourceVersionId="v" platform="wechat" value={doc} onLayoutChange={()=>{}}/>);await connected();fireEvent.click(screen.getByRole('button',{name:'复制公众号文章'}));await waitFor(()=>expect(write).toHaveBeenCalledOnce());expect((write.mock.calls[0] as any)[0][0].data['text/html'].type).toBe('text/html');
 vi.stubGlobal('ClipboardItem',undefined);fireEvent.click(screen.getByRole('button',{name:'复制公众号文章'}));expect(await screen.findByRole('alert')).toHaveTextContent('不支持富文本复制');exports();fireEvent.click(screen.getByRole('button',{name:'复制纯文本'}));await waitFor(()=>expect(writeText).toHaveBeenCalledWith('当前正文'));
});
it('导出期间改稿或换账号，迟到结果不下载',async()=>{
 let finish:(value:unknown)=>void=()=>{};const original=h.request.getMockImplementation()!;h.request.mockImplementation((operation:string,payload:unknown)=>operation==='export'?new Promise(resolve=>{finish=resolve;}):original(operation,payload));
 const click=vi.spyOn(HTMLAnchorElement.prototype,'click').mockImplementation(()=>{}),onLayoutChange=vi.fn();const {rerender}=render(<NoteRelayEditor projectId="project-fixture" accountId="a" outputId="o" sourceVersionId="v" platform="wechat" value={doc} onLayoutChange={onLayoutChange}/>);await connected();exports();fireEvent.click(screen.getByRole('button',{name:'导出 HTML'}));rerender(<NoteRelayEditor projectId="project-fixture" accountId="a" outputId="o" sourceVersionId="v" platform="wechat" value={{...doc,title:'新稿'}} onLayoutChange={onLayoutChange}/>);
 await act(async()=>finish({blob:new Blob(['旧稿'],{type:'text/html'})}));expect(await screen.findByRole('alert')).toHaveTextContent('稿件已改变');expect(click).not.toHaveBeenCalled();await connected();exports();fireEvent.click(screen.getByRole('button',{name:'导出 HTML'}));localStorage.setItem("creatoros:current-account","b");window.dispatchEvent(new Event("creatoros:accounts-changed"));rerender(<NoteRelayEditor projectId="project-fixture" accountId="b" outputId="o2" sourceVersionId="v2" platform="wechat" value={doc} onLayoutChange={onLayoutChange}/>);await act(async()=>finish({blob:new Blob(['旧稿'],{type:'text/html'})}));expect(click).not.toHaveBeenCalled();expect(screen.getByTestId('native-editor')).toHaveAttribute('data-owner','b');
});

it("预览先于折叠排版设置，主复制操作为正常尺寸且实例不重挂载",async()=>{
 render(<NoteRelayEditor projectId="project-fixture" accountId="a" outputId="o" sourceVersionId="v" platform="wechat" value={doc} onLayoutChange={()=>{}}/>);await connected();
 const setting=screen.getByText("排版设置").closest("details")!;expect(setting).not.toHaveAttribute("open");
 expect(screen.getByTestId("native-editor").compareDocumentPosition(setting)&Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
 expect(screen.getByRole("button",{name:"复制公众号文章"})).not.toHaveAttribute("data-size","sm");
 const count=h.request.mock.calls.filter(call=>call[0]==="load").length;fireEvent.click(screen.getByText("排版设置"));expect(h.request.mock.calls.filter(call=>call[0]==="load")).toHaveLength(count);
});

it('候选模式禁止版式回写，同时真实page/export端口保持可用',async()=>{
 const onLayoutChange=vi.fn();h.request.mockImplementation(async(op:string)=>op==='load'?{themes:[],images:[],selectedImage:'',pageIndex:0,pageCount:3}:op==='page'?{themes:[],images:[],selectedImage:'',pageIndex:1,pageCount:3}:{blob:new Blob(['png'],{type:'image/png'})});
 render(<NoteRelayEditor projectId="p" accountId="a" outputId="o" sourceVersionId="tool-1" platform="rednote" value={{schemaVersion:1,title:'候选',body:'正文',summary:'',tags:[],sourceRefs:[],imageUses:[],visualBriefs:[],cardBriefs:[]} as any} readOnlyCandidate onLayoutChange={onLayoutChange}/>);
 await waitFor(()=>expect(screen.getByRole('button',{name:'下一页'})).not.toBeDisabled());fireEvent.click(screen.getByRole('button',{name:'下一页'}));await waitFor(()=>expect(h.request).toHaveBeenCalledWith('page',{index:1}));settings();expect(screen.getByRole('textbox',{name:'署名'})).toBeDisabled();fireEvent.change(screen.getByRole('textbox',{name:'署名'}),{target:{value:'不得写回'}});expect(onLayoutChange).not.toHaveBeenCalled();
});

it('精简模式移除精调表单，所有交付先确认保存，保存失败不导出',async()=>{
 const prepare=vi.fn(async()=>false);render(<NoteRelayEditor simplified prepareDelivery={prepare} projectId="p" accountId="a" outputId="o" sourceVersionId="v" platform="wechat" value={doc} onLayoutChange={()=>{}}/>);await connected();expect(screen.queryByText('排版设置')).toBeNull();expect(screen.queryAllByRole('textbox')).toHaveLength(0);
 fireEvent.click(screen.getByRole('button',{name:'复制公众号文章'}));await screen.findByRole('alert');expect(prepare).toHaveBeenCalledOnce();expect(h.request.mock.calls.filter(([op])=>op==='export')).toHaveLength(0);
 prepare.mockResolvedValue(true);const writeText=vi.fn();Object.defineProperty(navigator,'clipboard',{configurable:true,value:{writeText}});exports();fireEvent.click(screen.getByRole('button',{name:'复制纯文本'}));await waitFor(()=>expect(writeText).toHaveBeenCalledWith('当前正文'));expect(prepare).toHaveBeenCalledTimes(2);
});

it('精简公众号默认使用无需填写占位符的版式，已有主题保持原样',async()=>{
 const props={projectId:"p",accountId:"a",outputId:"o",sourceVersionId:"v",platform:"wechat" as const,onLayoutChange:()=>{}};
 const view=render(<NoteRelayEditor {...props} simplified value={doc}/>);await connected();expect(h.request.mock.calls.find(([op])=>op==='load')?.[1].layout.themeId).toBe('graphite-minimal');
 view.rerender(<NoteRelayEditor {...props} simplified value={{...doc,nativeLayout:{...defaultLayout('wechat'),themeId:'moyu-green'}}}/>);await waitFor(()=>expect(h.request.mock.calls.filter(([op])=>op==='load').at(-1)?.[1].layout.themeId).toBe('moyu-green'));
});

function withImages(count:number):ArticleDocument{return {...doc,imageUses:Array.from({length:count},(_,index)=>({sectionId:'s',assetId:`asset-${index}`,assetFileId:`file-${index}`,sourceKind:'existing' as const,reviewState:'selected' as const}))};}
it('慢图片以4路上限并发，乱序完成仍保原投影顺序并局部降级',async()=>{
 const pending=new Map<string,(value:any)=>void>();let inFlight=0,peak=0;
 h.getAssetFileDownloadUrl.mockImplementation(async({params}:any)=>({url:params.assetId}));
 vi.stubGlobal('fetch',vi.fn((url:string)=>{inFlight++;peak=Math.max(peak,inFlight);return new Promise(resolve=>pending.set(url,value=>{inFlight--;resolve(value);}));}));
 render(<NoteRelayEditor projectId="p" accountId="a" outputId="o" sourceVersionId="v" platform="wechat" value={withImages(6)} onLayoutChange={()=>{}}/>);
 await waitFor(()=>expect(pending.size).toBe(4));expect(h.request).not.toHaveBeenCalled();
 const response=(body:string)=>({ok:true,blob:async()=>new Blob([body],{type:'image/png'})});
 await act(async()=>{pending.get('asset-2')!(response('2'));pending.get('asset-0')!({ok:false});});await waitFor(()=>expect(pending.size).toBe(6));
 await act(async()=>{for(const index of [5,3,4,1])pending.get(`asset-${index}`)!(response(String(index)));});await connected();
 expect(peak).toBe(4);expect(h.request.mock.calls.find(([op])=>op==='load')?.[1].images.map((image:any)=>image.source)).toEqual([1,2,3,4,5].map(i=>`creatoros-asset:asset-${i}:file-${i}`));expect(screen.getByRole('alert')).toHaveTextContent('1 张图片');
});

it('改稿取消旧图片批次，忽略不响应signal的迟到下载且卸载继续取消',async()=>{
 const pending:Array<{signal:AbortSignal;finish:(value:any)=>void}>=[];h.getAssetFileDownloadUrl.mockImplementation(async()=>({url:'image'}));vi.stubGlobal('fetch',vi.fn((_url,options)=>new Promise(resolve=>pending.push({signal:options.signal,finish:resolve}))));
 const view=render(<NoteRelayEditor projectId="p" accountId="a" outputId="o" sourceVersionId="v" platform="wechat" value={withImages(1)} onLayoutChange={()=>{}}/>);await waitFor(()=>expect(pending).toHaveLength(1));
 view.rerender(<NoteRelayEditor projectId="p" accountId="a" outputId="o" sourceVersionId="v" platform="wechat" value={{...doc,title:'新正文'}} onLayoutChange={()=>{}}/>);await connected();expect(pending[0]!.signal.aborted).toBe(true);
 await act(async()=>pending[0]!.finish({ok:true,blob:async()=>new Blob(['old'],{type:'image/png'})}));expect(h.request.mock.calls.filter(([op])=>op==='load')).toHaveLength(1);expect(h.request.mock.calls.find(([op])=>op==='load')?.[1].title).toBe('新正文');
 view.rerender(<NoteRelayEditor projectId="p" accountId="a" outputId="o" sourceVersionId="v" platform="wechat" value={withImages(1)} onLayoutChange={()=>{}}/>);await waitFor(()=>expect(pending).toHaveLength(2));view.unmount();expect(pending[1]!.signal.aborted).toBe(true);await act(async()=>pending[1]!.finish({ok:true,blob:async()=>new Blob(['late'],{type:'image/png'})}));expect(h.request.mock.calls.filter(([op])=>op==='load')).toHaveLength(1);
});

it('图片类型及25MiB大小检查失败只降级对应图片，正文仍加载',async()=>{
 h.getAssetFileDownloadUrl.mockImplementation(async({params}:any)=>({url:params.assetId}));vi.stubGlobal('fetch',vi.fn(async(url:string)=>({ok:true,blob:async()=>url==='asset-0'?new Blob(['html'],{type:'text/html'}):Object.defineProperty(new Blob(['pixels'],{type:'image/png'}),'size',{value:26*1024*1024})})));
 render(<NoteRelayEditor projectId="p" accountId="a" outputId="o" sourceVersionId="v" platform="wechat" value={withImages(2)} onLayoutChange={()=>{}}/>);await connected();expect(screen.getByRole('alert')).toHaveTextContent('2 张图片');expect(h.request.mock.calls.find(([op])=>op==='load')?.[1]).toMatchObject({title:'真实稿',images:[]});
});
