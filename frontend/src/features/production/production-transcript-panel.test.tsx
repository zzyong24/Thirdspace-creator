import * as React from "react";
import {cleanup,fireEvent,render,screen,waitFor} from "@testing-library/react";
import {afterEach,beforeEach,expect,it,vi} from "vitest";
import type {ProductionEditorDocument} from "@creatoros/contract";
const api=vi.hoisted(()=>({createProductionEditorTranscript:vi.fn(),getProductionEditorTranscript:vi.fn(),adoptProductionEditorTranscript:vi.fn(),getTask:vi.fn()}));
vi.mock("@/lib/contract-client",()=>({client:api}));
import {ProductionTranscriptPanel} from "./production-transcript-panel";
const source={sourceId:"source-a",assetId:"asset-a",assetFileId:"file-a",fileDigest:"a".repeat(64),probeDigest:"b".repeat(64),timebase:{num:1,den:30},durationTicks:90,hasAudio:true};
const initial=()=>({outputId:"output-a",projectId:"project-a",productionId:"production-a",revision:3,state:"editable",unsupportedFields:[],plan:{editorVersion:2,mainTrack:{sources:[{...source}],clips:[{clipId:"clip-a",sourceId:"source-a",sourceInTicks:0,sourceOutTicks:90}]},overlayDraft:{meta:{title:"原片"},scenes:[],captions:[],broll:[],delivery:{width:1920,height:1080,fps:30}},sourceTranscripts:[]}} as ProductionEditorDocument);
const transcript={transcriptId:"transcript-a",sourceId:"source-a",assetFileId:"file-a",audioDigest:"c".repeat(64),providerReceiptId:"original-receipt",granularity:"text",providerEvidence:{fixture:"explicit-test"},text:"真实全文，没有假时间码"};
const result={requestId:"request-a",taskId:"task-a",executionTaskId:"execution-a",status:"succeeded",sourceId:"source-a",transcript,warnings:[]};
function show(document=initial(),onSaved=vi.fn()){const view=render(<ProductionTranscriptPanel document={document} disabled={false} run={async action=>{await action();}} onSaved={onSaved}/>);return{...view,onSaved,open:()=>{const details=screen.getByText("原片转写与逐字稿").closest("details")!;details.open=true;fireEvent(details,new Event("toggle"));}};}
beforeEach(()=>{sessionStorage.clear();Object.values(api).forEach(fn=>fn.mockReset());});afterEach(cleanup);
it("折叠逐字稿不发读取请求；无音轨时不发转写请求",async()=>{const document=initial();(document.plan!.mainTrack as {sources:typeof source[]}).sources[0]!.hasAudio=false;const view=show(document);expect(api.getProductionEditorTranscript).not.toHaveBeenCalled();view.open();await screen.findByText("请先加入一段有真实音轨的原片。");expect(screen.getByRole("button",{name:"转写这段原片"})).toBeDisabled();expect(api.createProductionEditorTranscript).not.toHaveBeenCalled();});
it("转写创建丢回复后刷新保留source、旧revision与原请求号",async()=>{api.createProductionEditorTranscript.mockRejectedValueOnce(Error("原请求回复丢失"));const first=show();first.open();fireEvent.click(await screen.findByRole("button",{name:"转写这段原片"}));await screen.findByRole("alert");const original=api.createProductionEditorTranscript.mock.calls[0][0];expect(original.body).toMatchObject({sourceId:"source-a",expectedRevision:3});first.unmount();const next=initial();next.revision=4;api.createProductionEditorTranscript.mockResolvedValue(result);const second=show(next);second.open();fireEvent.click(await screen.findByRole("button",{name:"恢复原转写请求"}));await screen.findByText("转写已完成");expect(api.createProductionEditorTranscript.mock.calls[1][0]).toEqual(original);expect(screen.getByText(/没有词句时间码/)).toBeInTheDocument();expect(api.adoptProductionEditorTranscript).not.toHaveBeenCalled();});
it("明确采纳走原版本CAS；采纳失回复复用同body，不再次转写",async()=>{api.createProductionEditorTranscript.mockResolvedValue(result);api.adoptProductionEditorTranscript.mockRejectedValueOnce(Error("采纳回复丢失"));const view=show();view.open();fireEvent.click(await screen.findByRole("button",{name:"转写这段原片"}));fireEvent.click(await screen.findByRole("button",{name:"采纳转写并保存版本"}));await screen.findByRole("alert");const original=api.adoptProductionEditorTranscript.mock.calls[0][0];expect(original.body).toMatchObject({transcriptRequestId:"request-a",expectedRevision:3});api.adoptProductionEditorTranscript.mockResolvedValue({revision:4,plan:initial().plan});fireEvent.click(screen.getByRole("button",{name:"恢复原转写采纳"}));await waitFor(()=>expect(view.onSaved).toHaveBeenCalledOnce());expect(api.adoptProductionEditorTranscript.mock.calls[1][0]).toEqual(original);expect(api.createProductionEditorTranscript).toHaveBeenCalledOnce();});
it("折叠卸载后在途读取不回写新面板，已保存原始转写仍可查看",async()=>{sessionStorage.setItem("production-transcript:project-a:output-a",JSON.stringify({original:{sourceId:"source-a",expectedRevision:3,requestId:"request-original"},pending:null}));let resolve!:(value:typeof result)=>void;api.getProductionEditorTranscript.mockImplementation(()=>new Promise(r=>{resolve=r;}));const view=show();view.open();fireEvent.click(await screen.findByRole("button",{name:"读取原转写状态"}));view.unmount();const document=initial();document.plan!.sourceTranscripts=[transcript];const fresh=show(document);fresh.open();resolve(result);await screen.findByText("已保存的原始转写");expect(screen.queryByText("转写已完成")).not.toBeInTheDocument();expect(api.createProductionEditorTranscript).not.toHaveBeenCalled();});

it("用户明确选词级后冻结模式，请求回执真实词级不再误称只有全文",async()=>{
 const words={...result,transcript:{...transcript,granularity:"word",tokens:[{tokenId:"word-a",text:"真实词",startTicks:30,endTicks:45}]}};api.createProductionEditorTranscript.mockResolvedValue(words);const view=show();view.open();fireEvent.change(await screen.findByLabelText("转写精度"),{target:{value:"word"}});fireEvent.click(screen.getByRole("button",{name:"转写这段原片"}));await screen.findByText(/真实词级时间码/);expect(api.createProductionEditorTranscript.mock.calls[0][0].body).toMatchObject({sourceId:"source-a",expectedRevision:3,granularity:"word"});expect(screen.queryByText(/该结果仅有全文/)).not.toBeInTheDocument();expect(screen.getByLabelText("转写精度")).toBeDisabled();
});
it("新精度选择不改旧丢回执请求的完整body，旧全文不自动补granularity",async()=>{
 const original={sourceId:"source-a",expectedRevision:2,requestId:"original-legacy-create"};sessionStorage.setItem("production-transcript:project-a:output-a",JSON.stringify({original,pending:{kind:"create",body:original}}));api.createProductionEditorTranscript.mockResolvedValue(result);const view=show();view.open();const mode=await screen.findByLabelText("转写精度");await waitFor(()=>expect(mode).toBeDisabled());fireEvent.click(screen.getByRole("button",{name:"恢复原转写请求"}));await screen.findByText("转写已完成");expect(api.createProductionEditorTranscript.mock.calls[0][0].body).toEqual(original);expect(api.createProductionEditorTranscript.mock.calls[0][0].body).not.toHaveProperty("granularity");
});

it('已展开逐字稿在原片采纳后新增来源会选择真实sourceId，直接可转写',async()=>{
 const empty=initial();(empty.plan!.mainTrack as {sources:typeof source[];clips:unknown[]}).sources=[];(empty.plan!.mainTrack as {clips:unknown[]}).clips=[];const next=initial();next.revision=4;api.createProductionEditorTranscript.mockResolvedValue(result);const saved=vi.fn(),run=async(action:()=>Promise<void>)=>{await action();};
 const view=render(<ProductionTranscriptPanel document={empty} disabled={false} run={run} onSaved={saved}/>);const details=screen.getByText('原片转写与逐字稿').closest('details')!;details.open=true;fireEvent(details,new Event('toggle'));await screen.findByText('请先加入一段有真实音轨的原片。');
 view.rerender(<ProductionTranscriptPanel document={next} disabled={false} run={run} onSaved={saved}/>);await waitFor(()=>expect(screen.getByRole('button',{name:'转写这段原片'})).not.toBeDisabled());expect(screen.getByLabelText('转写原片')).toHaveValue('source-a');fireEvent.click(screen.getByRole('button',{name:'转写这段原片'}));await waitFor(()=>expect(api.createProductionEditorTranscript).toHaveBeenCalled());expect(api.createProductionEditorTranscript.mock.calls[0][0].body).toMatchObject({sourceId:'source-a',expectedRevision:4});
});
it('新增sources不会替换恢复中的原sourceId、granularity或完整原body',async()=>{
 const original={sourceId:'source-a',expectedRevision:2,requestId:'frozen-source-request',granularity:'word'};sessionStorage.setItem('production-transcript:project-a:output-a',JSON.stringify({original,pending:{kind:'create',body:original}}));const empty=initial();(empty.plan!.mainTrack as {sources:typeof source[];clips:unknown[]}).sources=[];(empty.plan!.mainTrack as {clips:unknown[]}).clips=[];api.createProductionEditorTranscript.mockResolvedValue(result);const saved=vi.fn(),run=async(action:()=>Promise<void>)=>{await action();};const view=render(<ProductionTranscriptPanel document={empty} disabled={false} run={run} onSaved={saved}/>);const details=screen.getByText('原片转写与逐字稿').closest('details')!;details.open=true;fireEvent(details,new Event('toggle'));await screen.findByRole('button',{name:'恢复原转写请求'});const next=initial();(next.plan!.mainTrack as {sources:typeof source[]}).sources=[{...source,sourceId:'new-other-source'}];(next.plan!.mainTrack as {clips:unknown[]}).clips=[];view.rerender(<ProductionTranscriptPanel document={next} disabled={false} run={run} onSaved={saved}/>);fireEvent.click(screen.getByRole('button',{name:'恢复原转写请求'}));await waitFor(()=>expect(api.createProductionEditorTranscript).toHaveBeenCalled());expect(api.createProductionEditorTranscript.mock.calls[0][0].body).toEqual(original);
});


it('真实转写失败读取同一task的执行态及人话原因，不重新创建请求',async()=>{
 api.createProductionEditorTranscript.mockResolvedValue({...result,status:'failed',transcript:null});api.getTask.mockResolvedValue({id:'task-a',projectId:'project-a',contentOutputId:'output-a',taskType:'asset.asr',status:'failed',runtimeStatus:'failed',executionTaskId:'execution-a',errorMessage:'音轨格式不支持，请换成受支持的原片。',errorCode:'ASR_AUDIO_FORMAT_UNSUPPORTED'});const view=show();view.open();fireEvent.click(await screen.findByRole('button',{name:'转写这段原片'}));await screen.findByText('音轨格式不支持，请换成受支持的原片。');expect(api.getTask).toHaveBeenCalledWith({params:{taskId:'task-a'},query:undefined,body:undefined});expect(api.createProductionEditorTranscript).toHaveBeenCalledOnce();expect(screen.getByText('原任务已失败')).toBeInTheDocument();
});
it('unknown原结果只读诊断，读取失败仍保留原request与完整body',async()=>{
 const original={sourceId:'source-a',expectedRevision:2,requestId:'original-unknown'};sessionStorage.setItem('production-transcript:project-a:output-a',JSON.stringify({original,pending:null}));api.getProductionEditorTranscript.mockResolvedValue({...result,status:'unknown_result',transcript:null});api.getTask.mockRejectedValueOnce(Error('诊断临时不可读'));const view=show();view.open();fireEvent.click(await screen.findByRole('button',{name:'读取原转写状态'}));await screen.findByText('原任务诊断暂未读到，原转写请求已保留；可再读取原状态。');expect(JSON.parse(sessionStorage.getItem('production-transcript:project-a:output-a')!).original).toEqual(original);expect(api.createProductionEditorTranscript).not.toHaveBeenCalled();
});

it('已采纳succeeded转写显式另建允许选择句级，保存原逐字稿且不自动create',async()=>{
 const document=initial();document.plan!.sourceTranscripts=[transcript];api.createProductionEditorTranscript.mockResolvedValue(result);const view=show(document);view.open();fireEvent.click(await screen.findByRole('button',{name:'转写这段原片'}));const another=await screen.findByRole('button',{name:'生成另一份转写'});const original=api.createProductionEditorTranscript.mock.calls[0][0].body;fireEvent.click(another);expect(api.createProductionEditorTranscript).toHaveBeenCalledOnce();expect(screen.getByText('已保存的原始转写')).toBeInTheDocument();expect(document.plan!.sourceTranscripts).toEqual([transcript]);expect(JSON.parse(sessionStorage.getItem('production-transcript:project-a:output-a')!).original).toBeNull();fireEvent.change(screen.getByLabelText('转写精度'),{target:{value:'segment'}});fireEvent.click(screen.getByRole('button',{name:'转写这段原片'}));await waitFor(()=>expect(api.createProductionEditorTranscript).toHaveBeenCalledTimes(2));expect(api.createProductionEditorTranscript.mock.calls[1][0].body).toMatchObject({sourceId:'source-a',granularity:'segment'});expect(api.createProductionEditorTranscript.mock.calls[1][0].body.requestId).not.toBe(original.requestId);
});
it('unknown请求不会因已有保存转写而显示另建入口',async()=>{
 const document=initial();document.plan!.sourceTranscripts=[transcript];api.createProductionEditorTranscript.mockResolvedValue({...result,status:'unknown_result',transcript:null});api.getTask.mockRejectedValue(Error('诊断暂不可读'));const view=show(document);view.open();fireEvent.click(await screen.findByRole('button',{name:'转写这段原片'}));await screen.findByText('供应商结果待确认');expect(screen.queryByRole('button',{name:'生成另一份转写'})).toBeNull();expect(api.createProductionEditorTranscript).toHaveBeenCalledOnce();
});

// T1062_COMPONENT_PORT_SEAM: 仅本文件既有业务spies；真实scope/epoch/signal/lifecycle不替换。
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
// T1062_COMPONENT_PORT_SEAM_END

// T1062_UNIT_SCOPE_FIXTURE: 显式合成单测选择；不是当前用户/生产default。
import {beforeEach as t1062ScopeBeforeEach, afterEach as t1062ScopeAfterEach} from "vitest";
t1062ScopeBeforeEach(() => {
  window.localStorage.setItem("creatoros:current-group", "t1062-unit-test-group");
  window.localStorage.removeItem("creatoros:current-account");
});
t1062ScopeAfterEach(() => {
  window.localStorage.removeItem("creatoros:current-group");
  window.localStorage.removeItem("creatoros:current-account");
});
// T1062_UNIT_SCOPE_FIXTURE_END
