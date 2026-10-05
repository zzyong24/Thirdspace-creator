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
const doc:ArticleDocument={schemaVersion:1,title:'真实稿',summary:'',sections:[{sectionId:'s',order:0,heading:'要点',headingLevel:2,body:'当前正文',sourceRefs:[]}],factItems:[],visualBriefs:[],imageUses:[]};
beforeEach(()=>{h.request.mockImplementation(async(operation:string)=>operation==='load'?{themes:[{id:'moyu-green',name:'摸鱼绿'}],images:[],selectedImage:'',pageIndex:0,pageCount:0}:{blob:new Blob(['<p>当前正文</p>'],{type:'text/html'}),plainText:'当前正文'});});
afterEach(()=>{cleanup();vi.clearAllMocks();vi.unstubAllGlobals();});
async function connected(){await waitFor(()=>expect(screen.getByRole('button',{name:'复制公众号文章'})).not.toBeDisabled());}
it('预览宿主无重复说明，区标题字体与脚本一致',async()=>{
 render(<NoteRelayEditor accountId="a" outputId="o" sourceVersionId="v" platform="wechat" value={doc} onLayoutChange={()=>{}}/>);await connected();
 expect(screen.queryByText('正文修改会更新预览，版式随稿件保存。')).not.toBeInTheDocument();
 expect(screen.getByRole('heading',{name:'公众号排版'})).toHaveClass('text-[13.5px]','font-semibold');
});
function exports(){const details=screen.getByText('更多导出').closest('details')!;details.open=true;fireEvent(details,new Event('toggle'));}
function settings(){const details=screen.getByText('排版设置').closest('details')!;details.open=true;fireEvent(details,new Event('toggle'));}
it('原生工作面与CreatorOS控件直接改当前版式，无iframe或window消息',async()=>{
 const onLayoutChange=vi.fn();const {container}=render(<NoteRelayEditor accountId="a" outputId="o" sourceVersionId="v" platform="wechat" value={doc} onLayoutChange={onLayoutChange}/>);await connected();expect(container.querySelector('iframe')).toBeNull();
 settings();fireEvent.change(screen.getByRole('textbox',{name:'署名'}),{target:{value:'署名'}});expect(onLayoutChange).toHaveBeenCalledWith({...defaultLayout('wechat'),authorName:'署名'});
 window.dispatchEvent(new MessageEvent('message',{data:{channel:'creatoros-noterelay',type:'layout',layout:{...defaultLayout('wechat'),authorName:'伪造'}}}));expect(onLayoutChange).toHaveBeenCalledTimes(1);expect(h.getAssetFileDownloadUrl).not.toHaveBeenCalled();
});
it('富文本复制使用ClipboardItem；不支持时可真实复制纯文本',async()=>{
 const write=vi.fn(async()=>{}),writeText=vi.fn(async()=>{});Object.defineProperty(navigator,'clipboard',{configurable:true,value:{write,writeText}});class Item{constructor(public data:Record<string,Blob>){}}vi.stubGlobal('ClipboardItem',Item);
 render(<NoteRelayEditor accountId="a" outputId="o" sourceVersionId="v" platform="wechat" value={doc} onLayoutChange={()=>{}}/>);await connected();fireEvent.click(screen.getByRole('button',{name:'复制公众号文章'}));await waitFor(()=>expect(write).toHaveBeenCalledOnce());expect((write.mock.calls[0] as any)[0][0].data['text/html'].type).toBe('text/html');
 vi.stubGlobal('ClipboardItem',undefined);fireEvent.click(screen.getByRole('button',{name:'复制公众号文章'}));expect(await screen.findByRole('alert')).toHaveTextContent('不支持富文本复制');exports();fireEvent.click(screen.getByRole('button',{name:'复制纯文本'}));await waitFor(()=>expect(writeText).toHaveBeenCalledWith('当前正文'));
});
it('导出期间改稿或换账号，迟到结果不下载',async()=>{
 let finish:(value:unknown)=>void=()=>{};const original=h.request.getMockImplementation()!;h.request.mockImplementation((operation:string,payload:unknown)=>operation==='export'?new Promise(resolve=>{finish=resolve;}):original(operation,payload));
 const click=vi.spyOn(HTMLAnchorElement.prototype,'click').mockImplementation(()=>{}),onLayoutChange=vi.fn();const {rerender}=render(<NoteRelayEditor accountId="a" outputId="o" sourceVersionId="v" platform="wechat" value={doc} onLayoutChange={onLayoutChange}/>);await connected();exports();fireEvent.click(screen.getByRole('button',{name:'导出 HTML'}));rerender(<NoteRelayEditor accountId="a" outputId="o" sourceVersionId="v" platform="wechat" value={{...doc,title:'新稿'}} onLayoutChange={onLayoutChange}/>);
 await act(async()=>finish({blob:new Blob(['旧稿'],{type:'text/html'})}));expect(await screen.findByRole('alert')).toHaveTextContent('稿件已改变');expect(click).not.toHaveBeenCalled();await connected();exports();fireEvent.click(screen.getByRole('button',{name:'导出 HTML'}));rerender(<NoteRelayEditor accountId="b" outputId="o2" sourceVersionId="v2" platform="wechat" value={doc} onLayoutChange={onLayoutChange}/>);await act(async()=>finish({blob:new Blob(['旧稿'],{type:'text/html'})}));expect(click).not.toHaveBeenCalled();expect(screen.getByTestId('native-editor')).toHaveAttribute('data-owner','b');
});

it("预览先于折叠排版设置，主复制操作为正常尺寸且实例不重挂载",async()=>{
 render(<NoteRelayEditor accountId="a" outputId="o" sourceVersionId="v" platform="wechat" value={doc} onLayoutChange={()=>{}}/>);await connected();
 const setting=screen.getByText("排版设置").closest("details")!;expect(setting).not.toHaveAttribute("open");
 expect(screen.getByTestId("native-editor").compareDocumentPosition(setting)&Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
 expect(screen.getByRole("button",{name:"复制公众号文章"})).not.toHaveAttribute("data-size","sm");
 const count=h.request.mock.calls.filter(call=>call[0]==="load").length;fireEvent.click(screen.getByText("排版设置"));expect(h.request.mock.calls.filter(call=>call[0]==="load")).toHaveLength(count);
});
