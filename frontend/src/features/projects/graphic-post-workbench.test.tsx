import * as React from 'react';
import {act,cleanup,fireEvent,render,screen,waitFor} from '@testing-library/react';
import {afterEach,beforeEach,expect,it,vi} from 'vitest';
import type {GraphicPostResource} from '@creatoros/contract';
import {unzipSync,strFromU8} from 'fflate';
const api=vi.hoisted(()=>({getGraphicPost:vi.fn(),getGraphicPostVersion:vi.fn(),createGraphicPostVersion:vi.fn(),getAssetFileDownloadUrl:vi.fn(),openChat:vi.fn(),port:null as any,note:null as any,result:null as any}));
vi.mock('@/lib/contract-client',()=>({client:api}));
vi.mock('next/navigation',()=>({useRouter:()=>({refresh:vi.fn()})}));
vi.mock('@/features/draft-workbench/draft-chat-request',async original=>{const real:any=await original();return {...real,useDraftChatRequest:()=>{const context=real.useDraftChatRequest();const registerEditor=React.useCallback((port:any)=>{api.port=port;return context.registerEditor(port);},[context.registerEditor]);return {...context,openChat:api.openChat,registerEditor};}};});
vi.mock('@/features/reference-editors/noterelay/noterelay-editor',()=>({NoteRelayEditor:(props:any)=>{api.note=props;return <section aria-label="成稿预览"><h2>图片页预览</h2>{props.extraDelivery}</section>;}}));
vi.mock('./graphic-post-results',()=>({GraphicPostResults:(props:any)=>{api.result=props;return null;}}));
vi.mock('./publication-result-actions',()=>({PublicationResultActions:()=>null}));
import {GraphicPostWorkbench} from './graphic-post-workbench';
const script={state:'ready' as const,scriptRef:{kind:'project_script' as const,id:'script',versionId:'sv1'},scriptText:'脚本原话，图文默认承接。',metadata:{title:'原稿标题',summary:'',tags:[]}};
function fixture():GraphicPostResource{return {projectId:'p',outputId:'o',targetPlatform:null,artifactId:'a',currentVersionId:'v1',versions:[],scriptContext:script,current:{schemaVersion:1,title:'',body:'',summary:'',tags:[],sourceRefs:[],imageUses:[],ruleSnapshotRef:null}};}
let latest:GraphicPostResource;
const props={projectId:'p',projectTitle:'项目',accountId:'a'};
beforeEach(()=>{vi.clearAllMocks();sessionStorage.clear();latest=fixture();api.getGraphicPost.mockImplementation(async()=>structuredClone(latest));api.getGraphicPostVersion.mockImplementation(async({params})=>({versionId:params.versionId,document:structuredClone(latest.current)}));api.createGraphicPostVersion.mockImplementation(async({body})=>{latest={...latest,currentVersionId:'v2',current:structuredClone(body.document)};return {versionId:'v2',document:latest.current};});});
afterEach(()=>{cleanup();sessionStorage.clear();vi.unstubAllGlobals();vi.restoreAllMocks();});
it('纯预览承接原稿，唯一重组主动作先保存精确读回再发图文对话',async()=>{
 render(<GraphicPostWorkbench {...props} initial={latest}/>);expect(screen.getByText(script.scriptText)).toBeVisible();expect(screen.queryAllByRole('textbox')).toHaveLength(0);for(const text of ['逐页创作与 AI 辅助','手动选图与封面','快图细调封面'])expect(screen.queryByText(text)).toBeNull();expect(api.createGraphicPostVersion).not.toHaveBeenCalled();fireEvent.click(screen.getByRole('button',{name:'重新组织内容'}));await waitFor(()=>expect(api.openChat).toHaveBeenCalledOnce());expect(api.createGraphicPostVersion.mock.calls[0]![0].body.document).toMatchObject({body:script.scriptText,sourceRefs:[script.scriptRef]});expect(api.openChat).toHaveBeenCalledWith(expect.objectContaining({autoSend:true,prefill:expect.stringContaining('图文内容')}));expect(api.port.readState().target.selection).toEqual({kind:'graphic_post',cardIds:[]});
});
it('独立成稿与图卡、图片、版式保留，不再次承接更新脚本',async()=>{
 latest.current={...latest.current,title:'成稿',body:'已改好的图文',cardBriefs:[{cardId:'真实页',title:'第一页',body:'第一段',sourceRefs:[script.scriptRef]}],imageUses:[{role:'card',cardId:'真实页',order:0,assetId:'image',assetFileId:'file'}]};const initial=structuredClone(latest);render(<GraphicPostWorkbench {...props} initial={initial}/>);expect(api.note.value).toEqual(initial.current);await act(async()=>{await api.port.prepareForTurn();});expect(api.createGraphicPostVersion).not.toHaveBeenCalled();expect(api.note.value).toEqual(initial.current);
});
it('原保存UNKNOWN不发对话，再次确认必须相同请求ID和正文',async()=>{
 api.createGraphicPostVersion.mockRejectedValueOnce(new Error('保存响应丢失'));render(<GraphicPostWorkbench {...props} initial={latest}/>);fireEvent.click(screen.getByRole('button',{name:'重新组织内容'}));await screen.findByRole('alert');expect(api.openChat).not.toHaveBeenCalled();const original=api.createGraphicPostVersion.mock.calls[0]![0];fireEvent.click(screen.getByRole('button',{name:'恢复保存并核对'}));await waitFor(()=>expect(api.createGraphicPostVersion).toHaveBeenCalledTimes(2));expect(api.createGraphicPostVersion.mock.calls[1]![0]).toEqual(original);await screen.findByText('当前成稿已保存');
});
it('精确读回字段篡改或版本漂移阻止继续生成并保留原请求',async()=>{
 api.getGraphicPostVersion.mockImplementation(async({params})=>({versionId:params.versionId,document:{...latest.current,summary:'别的摘要'}}));render(<GraphicPostWorkbench {...props} initial={latest}/>);fireEvent.click(screen.getByRole('button',{name:'重新组织内容'}));await screen.findByRole('alert');expect(api.openChat).not.toHaveBeenCalled();expect(Object.keys(sessionStorage).some(k=>k.includes('graphic:request'))).toBe(true);
});
it('保存期间晚到的版式更新保留，不拿旧稿继续对话',async()=>{
 let finish!:(v:any)=>void;api.createGraphicPostVersion.mockImplementationOnce(()=>new Promise(resolve=>{finish=resolve;}));render(<GraphicPostWorkbench {...props} initial={latest}/>);fireEvent.click(screen.getByRole('button',{name:'重新组织内容'}));await waitFor(()=>expect(api.createGraphicPostVersion).toHaveBeenCalledOnce());const submitted=api.createGraphicPostVersion.mock.calls[0]![0].body.document;
 const layout={schemaVersion:1,editor:'noterelay',editorVersion:'0.1.8',themeId:'default',authorName:'保留作者',authorBio:'',variables:{},fontSize:16,splitHeading:2,templateId:'default',imageWidths:{},imageRadii:{}};
 act(()=>api.note.onLayoutChange(layout));latest={...latest,currentVersionId:'v2',current:submitted};await act(async()=>finish({versionId:'v2'}));await screen.findByRole('alert');expect(api.note.value.nativeLayout).toEqual(layout);expect(api.openChat).not.toHaveBeenCalled();
});
it('切作品后迟到旧保存不能覆盖新作品或发送旧对话',async()=>{
 let finish!:(v:any)=>void;api.createGraphicPostVersion.mockImplementationOnce(()=>new Promise(resolve=>{finish=resolve;}));const original=latest;const r=render(<GraphicPostWorkbench {...props} initial={original}/>);fireEvent.click(screen.getByRole('button',{name:'重新组织内容'}));await waitFor(()=>expect(api.createGraphicPostVersion).toHaveBeenCalledOnce());const next={...fixture(),outputId:'next',current:{...fixture().current,title:'下一作品',body:'下一作品正文'}};r.rerender(<GraphicPostWorkbench {...props} initial={next}/>);latest={...original,currentVersionId:'v2',current:api.createGraphicPostVersion.mock.calls[0]![0].body.document};await act(async()=>finish({versionId:'v2'}));expect(screen.getByText('下一作品正文')).toBeVisible();expect(api.openChat).not.toHaveBeenCalled();
});
it('脚本为空或不可读时只引导回脚本，不发空白请求',()=>{
 const initial={...latest,scriptContext:{...script,state:'empty' as const,scriptText:''}};render(<GraphicPostWorkbench {...props} initial={initial}/>);expect(screen.getByRole('button',{name:'重新组织内容'})).toBeDisabled();expect(screen.getByRole('link',{name:'前往脚本撰写原稿'})).toHaveAttribute('href','/projects/p');
});

it('导出读取精确文件，封面重复文件只导出一次，真实页序和配文写入zip',async()=>{
 const a={assetId:'asset-a',assetFileId:'file-a',order:1,role:'card' as const,cardId:'a'},b={assetId:'asset-b',assetFileId:'file-b',order:2,role:'card' as const,cardId:'b'};
 const initial:GraphicPostResource={projectId:'p',outputId:'o',targetPlatform:null,artifactId:'artifact',currentVersionId:'v0',versions:[],current:{schemaVersion:1,title:'作品标题',body:'作品正文',summary:'摘要',tags:['标签'],sourceRefs:[],ruleSnapshotRef:null,cardBriefs:[{cardId:'a',title:'一',body:'一',sourceRefs:[]},{cardId:'b',title:'二',body:'二',sourceRefs:[]}],imageUses:[{assetId:'asset-b',assetFileId:'file-b',order:0,role:'cover'},b,a]}};
 api.getGraphicPost.mockResolvedValue(initial);api.getAssetFileDownloadUrl.mockImplementation(async({params})=>({url:`http://example.test/${params.assetFileId}.png`}));
 const read=vi.fn(async(_url:string)=>({ok:true,blob:async()=>({type:'image/png',arrayBuffer:async()=>new Uint8Array([1,2,3]).buffer})}));vi.stubGlobal('fetch',read);
 let archive:Blob|undefined;const create=URL.createObjectURL,revoke=URL.revokeObjectURL;
 URL.createObjectURL=vi.fn(blob=>{archive=blob;return 'blob:archive';});URL.revokeObjectURL=vi.fn();vi.spyOn(HTMLAnchorElement.prototype,'click').mockImplementation(()=>{});
 try{
  render(<GraphicPostWorkbench projectId="p" projectTitle="项目" accountId="a" initial={initial}/>);

  fireEvent.click(screen.getByRole('button',{name:'导出原图与配文'}));await screen.findByText(/已导出 2 张精确图片和配文/);
  expect(read.mock.calls.map(call=>call[0])).toEqual(['http://example.test/file-a.png','http://example.test/file-b.png']);
  const buffer=await new Promise<ArrayBuffer>((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(reader.result as ArrayBuffer);reader.onerror=reject;reader.readAsArrayBuffer(archive!);});
  const files=unzipSync(new Uint8Array(buffer));expect(Object.keys(files)).toEqual(['01.png','02.png','配文.txt','图片顺序.json']);
  expect(strFromU8(files['配文.txt']!)).toBe('作品标题\n\n作品正文\n\n摘要\n\n#标签');
  expect(JSON.parse(strFromU8(files['图片顺序.json']!)).map((row:{assetFileId:string})=>row.assetFileId)).toEqual(['file-a','file-b']);
  expect(api.createGraphicPostVersion).not.toHaveBeenCalled();
 }finally{URL.createObjectURL=create;URL.revokeObjectURL=revoke;}
});

vi.mock("@/lib/creation-workspace-scope", async importOriginal => {
  const actual = await importOriginal<typeof import("@/lib/creation-workspace-scope")>();
  const {client: componentPorts} = await import("@/lib/contract-client");
  type Workspace = ReturnType<typeof actual.createCreationWorkspace>;
  type Operation = ReturnType<Workspace["capture"]>;
  const views = new WeakMap<Workspace, Workspace>();
  function portClient(base: Operation["client"], capture: () => Operation): Operation["client"] {
    const methods = new Map<PropertyKey, unknown>();
    return new Proxy(base, {
      get(target, key, receiver) {
        const port = Reflect.get(componentPorts, key);
        const original = Reflect.get(target, key, receiver);
        if (typeof port !== "function") return original;
        if (!methods.has(key)) methods.set(key, async (...args: unknown[]) => {
          const operation = capture();
          operation.assertCurrent();
          try { return await Reflect.apply(Reflect.get(componentPorts, key), componentPorts, args); }
          finally { operation.assertCurrent(); }
        });
        return methods.get(key);
      },
    });
  }
  function view(workspace: Workspace): Workspace {
    const cached = views.get(workspace);
    if (cached) return cached;
    const client = portClient(workspace.client, () => workspace.capture());
    const capture = (): Operation => {
      const operation = workspace.capture();
      return Object.freeze({...operation, client: portClient(operation.client, () => operation)});
    };
    const proxy = new Proxy(workspace, {
      get(target, key) {
        if (key === "client") return client;
        if (key === "capture") return capture;
        // Reflect读取原对象getter，signal/epoch始终是原factory当前值；不spread workspace。
        return Reflect.get(target, key, target);
      },
    });
    views.set(workspace, proxy);
    return proxy;
  }
  return {
    ...actual,
    createCreationWorkspace: (...args: Parameters<typeof actual.createCreationWorkspace>) => view(actual.createCreationWorkspace(...args)),
    useCreationWorkspace: (scope: Parameters<typeof actual.useCreationWorkspace>[0]) => view(actual.useCreationWorkspace(scope)),
    useCreationClient: () => view(actual.useCreationWorkspace(actual.useCreationScope())).client,
  };
});
// T1069_EXISTING_PORT_SEAM_END

// 显式单测账号范围；工作区与取消守卫仍使用真实实现。
import {beforeEach as scopeBefore,afterEach as scopeAfter} from "vitest";
scopeBefore(()=>{localStorage.removeItem("creatoros:current-group");localStorage.setItem("creatoros:current-account","a");});
scopeAfter(()=>{localStorage.removeItem("creatoros:current-group");localStorage.removeItem("creatoros:current-account");});

import {DraftChatRequestProvider,useDraftChatRequest} from '@/features/draft-workbench/draft-chat-request';
let actualChat:ReturnType<typeof useDraftChatRequest>;
function ChatPortWitness(){actualChat=useDraftChatRequest();return null;}
it.each(['normal','later-input','unmount'] as const)('T1298 真实Provider与成稿端口同步代次及并发保护：%s',async mode=>{
 latest.current={...latest.current,title:'已保存稿',body:'已保存正文'};
 const tree=(shown=true)=><DraftChatRequestProvider><ChatPortWitness/>{shown?<GraphicPostWorkbench {...props} initial={latest}/>:null}</DraftChatRequestProvider>;const view=render(tree());await screen.findByText('已保存正文');
 const changed={...latest.current,body:'本次采用正文'};
 const candidate:any={kind:'work.editor.candidate',target:{outputId:'o'},candidate:{kind:'graphic_post',document:changed},apply:{operation:'createGraphicPostVersion',outputId:'o',body:{expectedCurrentVersionId:'v1',document:changed}}};
 let finish!:(value:any)=>void;api.createGraphicPostVersion.mockImplementationOnce(()=>new Promise(resolve=>{finish=resolve;}));let pending:Promise<any>;act(()=>{pending=actualChat.adoptEditorCandidate(candidate,'t1298-adoption').catch(error=>({error}));});await waitFor(()=>expect(api.createGraphicPostVersion).toHaveBeenCalledOnce());
 const layout:any={schemaVersion:1,editor:'noterelay',editorVersion:'0.1.8',themeId:'default',authorName:'晚到输入',authorBio:'',variables:{},fontSize:16,splitHeading:2,templateId:'default',imageWidths:{},imageRadii:{}};
 if(mode==='later-input')act(()=>api.note.onLayoutChange(layout));if(mode==='unmount')view.rerender(tree(false));latest={...latest,currentVersionId:'v2',current:changed};let result:any;await act(async()=>{finish({versionId:'v2'});result=await pending;});
 if(mode==='normal'){expect(result).toMatchObject({status:'adopted',versionId:'v2'});expect(actualChat.readEditorState()).toMatchObject({dirty:false});expect(screen.getByText('本次采用正文')).toBeVisible();}
 else{expect(result?.status).not.toBe('adopted');if(mode==='later-input'){expect(api.note.value.nativeLayout).toEqual(layout);expect(actualChat.readEditorState()?.dirty).toBe(true);}}
});

it("T1300 重组只读取一次有效latest/exact，不额外前读当前稿",async()=>{
 latest.current={...latest.current,title:"已存",body:"已存正文"};render(<GraphicPostWorkbench {...props} initial={latest}/>);api.getGraphicPost.mockClear();api.getGraphicPostVersion.mockClear();fireEvent.click(screen.getByRole("button",{name:"重新组织内容"}));await waitFor(()=>expect(api.openChat).toHaveBeenCalledOnce());expect(api.getGraphicPost).toHaveBeenCalledTimes(1);expect(api.getGraphicPostVersion).toHaveBeenCalledTimes(1);
});

it("T1300 requireScript只约束重组当次latest，普通对话无脚本门槛",async()=>{
 latest.current={...latest.current,title:"已存",body:"已存正文"};render(<GraphicPostWorkbench {...props} initial={latest}/>);latest={...latest,scriptContext:{...script,state:"empty",scriptText:""} as any};await act(async()=>{expect(await api.port.prepareForTurn()).toMatchObject({outputId:"o"});});await expect(api.port.prepareForTurn({requireScript:true})).rejects.toThrow(/脚本/);expect(api.openChat).not.toHaveBeenCalled();expect(api.createGraphicPostVersion).not.toHaveBeenCalled();
});

it('T1303 真实图文owner首次谱系在外部版式回调编辑又改回后不可复活',async()=>{
 const layout:any={schemaVersion:1,editor:'noterelay',editorVersion:'0.1.8',themeId:'default',authorName:'原作者',authorBio:'',variables:{},fontSize:16,splitHeading:2,templateId:'default',imageWidths:{},imageRadii:{}};latest.current.nativeLayout=layout;render(<DraftChatRequestProvider><ChatPortWitness/><GraphicPostWorkbench {...props} initial={latest}/></DraftChatRequestProvider>);
 const candidate:any={kind:'work.creation.member',member:'image',proposal:{target:{projectId:'p',scriptSourceRef:script.scriptRef,graphicMember:{outputId:'o',artifactId:'a',baseVersionId:'v1'}},scriptSourceRef:script.scriptRef}};
 expect(await api.port.admitCandidate(candidate)).not.toBeNull();act(()=>api.note.onLayoutChange({...layout,authorName:'受控回调新值'}));act(()=>api.note.onLayoutChange(layout));expect(api.note.value.nativeLayout).toEqual(layout);expect(await api.port.admitCandidate(candidate)).toBeNull();await expect(actualChat.adoptEditorCandidate(candidate,'original-key')).rejects.toThrow(/未保存/);expect(api.createGraphicPostVersion).not.toHaveBeenCalled();
});
it('T1303 图文派生准入只读等待时真实owner新回调输入保留，零保存',async()=>{
 render(<DraftChatRequestProvider><ChatPortWitness/><GraphicPostWorkbench {...props} initial={latest}/></DraftChatRequestProvider>);let finish!:(v:any)=>void;api.getGraphicPost.mockImplementationOnce(()=>new Promise(resolve=>{finish=resolve;}));const candidate:any={kind:'work.creation.member',member:'image',proposal:{target:{projectId:'p',scriptSourceRef:script.scriptRef,graphicMember:{outputId:'o',artifactId:'a',baseVersionId:'v1'}},scriptSourceRef:script.scriptRef}};let pending!:Promise<any>;act(()=>{pending=actualChat.adoptEditorCandidate(candidate,'same-request').catch(error=>error);});await waitFor(()=>expect(finish).toBeTypeOf('function'));const layout:any={schemaVersion:1,editor:'noterelay',editorVersion:'0.1.8',themeId:'default',authorName:'等待期间的受控回调',authorBio:'',variables:{},fontSize:16,splitHeading:2,templateId:'default',imageWidths:{},imageRadii:{}};act(()=>api.note.onLayoutChange(layout));await act(async()=>finish(structuredClone(latest)));expect(await pending).toBeInstanceOf(Error);expect(api.note.value.nativeLayout).toEqual(layout);expect(api.createGraphicPostVersion).not.toHaveBeenCalled();
});

it('发布配文独立显示且可复制，不再展示发布与交付；无脚本旧稿仍可重组',async()=>{
 latest={...latest,scriptContext:{...script,state:'empty',scriptText:''} as any,current:{...latest.current,title:'发布标题',body:'小红书配文',tags:['创作'],cardBriefs:[{cardId:'a',title:'图片要点',body:'图内文字',sourceRefs:[]}]}};
 const writeText=vi.fn(async()=>{});Object.defineProperty(navigator,'clipboard',{configurable:true,value:{writeText}});
 render(<GraphicPostWorkbench {...props} initial={latest}/>);expect(screen.getByRole('region',{name:'发布配文'})).toHaveTextContent('小红书配文');expect(screen.queryByText('发布与交付')).toBeNull();
 fireEvent.click(screen.getByRole('button',{name:'复制配文'}));await waitFor(()=>expect(writeText).toHaveBeenCalledWith('发布标题\n\n小红书配文\n\n#创作'));
 expect(screen.getByRole('button',{name:'重新组织内容'})).toBeEnabled();fireEvent.click(screen.getByRole('button',{name:'重新组织内容'}));await waitFor(()=>expect(api.openChat).toHaveBeenCalledOnce());
 expect(api.openChat.mock.calls[0]![0].prefill).toContain('cardBriefs');expect(api.openChat.mock.calls[0]![0].prefill).toContain('小红书发布正文');
});

it('旧稿有空卡但主脚本可读时，仍可重新组织',async()=>{
 latest={...latest,current:{...latest.current,cardBriefs:[{cardId:'empty',title:'',body:'',sourceRefs:[]}]}};render(<GraphicPostWorkbench {...props} initial={latest}/>);
 expect(screen.getByRole('button',{name:'重新组织内容'})).toBeEnabled();fireEvent.click(screen.getByRole('button',{name:'重新组织内容'}));await waitFor(()=>expect(api.openChat).toHaveBeenCalledOnce());
});
