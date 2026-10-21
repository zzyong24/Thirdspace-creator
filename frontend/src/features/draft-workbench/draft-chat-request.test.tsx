import * as React from "react";
import { act, render, cleanup, screen } from "@testing-library/react";
import { it, expect, afterEach } from "vitest";
import {
  DraftChatRequestProvider,
  useDraftChatRequest,
} from "./draft-chat-request";
let api: ReturnType<typeof useDraftChatRequest>;
function Consumer() {
  api = useDraftChatRequest();
  return null;
}
afterEach(cleanup);
it("T-1382 主脚本采用证明拒绝脏稿，新增输入/重注册使原证明失效，允许保存的空稿",()=>{
  render(<DraftChatRequestProvider><Consumer/></DraftChatRequestProvider>);
  let generation=1,dirty=true;
  const scopeKey="account:missing";
  const port={readState:()=>({generation,dirty,projectId:"p",scopeKey,saving:false,artifactId:"a"}),prepareForCreation:async()=>{throw Error("不能为检查采用而自动保存");}};
  api.registerScript(port);
  expect(()=>api.captureScriptAdoption("p",scopeKey)).toThrow(/未保存/);
  dirty=false;
  const stillCurrent=api.captureScriptAdoption("p",scopeKey);
  expect(stillCurrent()).toBe(true);
  generation++;
  expect(stillCurrent()).toBe(false);
  const next=api.captureScriptAdoption("p",scopeKey);
  api.registerScript({...port});
  expect(next()).toBe(false);
  expect(()=>api.captureScriptAdoption("other",scopeKey)).toThrow(/当前项目/);
},120000);
it("匹配编辑器有未保存文字时拒绝采用，不能返回null触发直接保存", async () => {
  render(<DraftChatRequestProvider><Consumer /></DraftChatRequestProvider>);
  let adoptions = 0;
  act(() => { api.registerEditor({
    readState: () => ({ target: null, outputId: "o", generation: 1, dirty: true }),
    prepareForTurn: async () => { throw Error("不能自动保存"); },
    previewCandidate: async () => null,
    adoptCandidate: async () => { adoptions++; return {status: "adopted"}; },
  }); });
  await expect(api.adoptEditorCandidate({kind: "work.editor.candidate", target: {outputId: "o"}} as any, "same-source")).rejects.toThrow(/未保存/);
  expect(adoptions).toBe(0);
});
it("采用等待期间换编辑器或新增输入，保留已保存结果但不能报告当前稿已同步", async () => {
  render(<DraftChatRequestProvider><Consumer /></DraftChatRequestProvider>);
  let generation = 1, done!: (value: any) => void;
  const port = {
    readState: () => ({ target: null, outputId: "o", generation, dirty: false }),
    prepareForTurn: async () => { throw Error("不能另发模型"); },
    previewCandidate: async () => null,
    adoptCandidate: () => new Promise<any>(resolve => { done = resolve; }),
  };
  act(() => { api.registerEditor(port); });
  const pending = api.adoptEditorCandidate({kind: "work.editor.candidate", target: {outputId: "o"}} as any, "same-source");
  generation++;
  act(() => { api.registerEditor({...port, readState: () => ({target:null,outputId:"other",generation:3,dirty:true})}); });
  await act(async () => { done({status:"adopted",versionId:"saved-v"}); });
  expect(await pending).toMatchObject({status:"saved-not-synced",versionId:"saved-v"});
});
it("刷新后原候选使用已加载作品身份预览和采纳，不要求再发送模型初始化target", async () => {
  render(<DraftChatRequestProvider><Consumer /></DraftChatRequestProvider>);
  let outputId = "o", prepared = 0, previews = 0, adoptions = 0;
  api.registerEditor({
    readState: () => ({ target: null, outputId, generation: 1, dirty: false }),
    prepareForTurn: async () => { prepared++; throw Error("本轮不能重新发送"); },
    previewCandidate: async () => { previews++; return {blob: new Blob(["预览"]), fileName: "候选.mp4"}; },
    adoptCandidate: async () => { adoptions++; return {status: "adopted"}; },
  } as any);
  const candidate: any = {kind: "work.editor.candidate", target: {outputId: "o"}};
  expect(await api.previewEditorCandidate(candidate)).toMatchObject({fileName: "候选.mp4"});
  expect(await api.adoptEditorCandidate(candidate, "原采纳请求")).toEqual({status: "adopted"});
  outputId = "other";
  expect(await api.previewEditorCandidate(candidate)).toBeNull();
  expect(await api.adoptEditorCandidate(candidate, "原采纳请求")).toBeNull();
  expect([prepared, previews, adoptions]).toEqual([0, 1, 1]);
});
it("首次严格读回成功后通知同栏当前作品，方法保持稳定且不改变generation", async () => {
  let target: any = null;
  const savedTarget = {
    schemaVersion: 1, projectId: "p", outputId: "o", owner: "wechat_article",
    contentType: "article", savedBase: { kind: "artifact", artifactId: "a", versionId: "v" },
    documentDigest: "sha256:" + "a".repeat(64), selection: { kind: "article" },
  };
  function CurrentWork() {
    const chat = useDraftChatRequest();
    return <p role="status">{chat.readEditorState()?.target?.contentType ?? "等待读回"}</p>;
  }
  render(<DraftChatRequestProvider><Consumer /><CurrentWork /></DraftChatRequestProvider>);
  const prepare = api.prepareEditorTurn;
  act(() => { api.registerEditor({
    readState: () => ({ target, generation: 1, dirty: false }),
    prepareForTurn: async () => { target = savedTarget; return target; },
    previewCandidate: async () => null,
    adoptCandidate: async () => ({ status: "adopted" }),
  }); });
  expect(screen.getByRole("status")).toHaveTextContent("等待读回");
  await act(async () => { expect(await prepare()).toEqual(savedTarget); });
  expect(screen.getByRole("status")).toHaveTextContent("article");
  expect(api.prepareEditorTurn).toBe(prepare);
  expect(api.readEditorState()?.generation).toBe(1);
});
it("编辑器注册令牌防止旧卸载清除新端口，并在等待保存期间核对generation", async () => {
  render(
    <DraftChatRequestProvider>
      <Consumer />
    </DraftChatRequestProvider>,
  );
  let generation = 1;
  let done: () => void = () => {};
  const target = {
    schemaVersion: 1,
    projectId: "p",
    outputId: "o",
    owner: "wechat_article",
    contentType: "article",
    savedBase: { kind: "artifact", artifactId: "a", versionId: "v" },
    documentDigest: "sha256:" + "a".repeat(64),
    selection: { kind: "article" },
  };
  const port = {
    readState: () => ({ target, generation, dirty: false }),
    prepareForTurn: () =>
      new Promise<any>((r) => {
        done = () => r(target);
      }),
    previewCandidate: async () => null,
    adoptCandidate: async () => ({ status: "saved-not-synced" }),
  };
  const old = api.registerEditor(port as any);
  const fresh = api.registerEditor(port as any);
  old();
  let pending!: Promise<unknown>;
  act(() => {
    pending = api.prepareEditorTurn();
  });
  const rejected = expect(pending).rejects.toThrow(/改变/);
  generation++;
  await act(async () => done());
  await rejected;
  fresh();
  await expect(api.prepareEditorTurn()).resolves.toBeUndefined();
});
it("脚本严格端口未注册和旧token不得发送联合创作；方法稳定", async () => {
  render(
    <DraftChatRequestProvider>
      <Consumer />
    </DraftChatRequestProvider>,
  );
  const fn = api.prepareScriptForCreation;
  await expect(fn()).rejects.toThrow(/脚本/);
  let generation = 1;
  const ref = { kind: "project_script", id: "script-a", versionId: "script-v" };
  const old = api.registerScript({
    readState: () => ({ generation }),
    prepareForCreation: async () => ref,
  } as any);
  const fresh = api.registerScript({
    readState: () => ({ generation }),
    prepareForCreation: async () => ref,
  } as any);
  old();
  await expect(fn()).resolves.toEqual(ref);
  act(() => api.openChat({ prefill: "微调" }));
  expect(api.prepareScriptForCreation).toBe(fn);
  fresh();
});

it.each(["synced", "later-change", "dirty"])("原生采纳自身推进generation后，精确同步回执只放行当前clean稿：%s", async mode => {
  render(<DraftChatRequestProvider><Consumer /></DraftChatRequestProvider>);
  let generation=1, dirty=false;
  act(()=>{api.registerEditor({
    readState:()=>({target:null,outputId:"o",generation,dirty}),
    prepareForTurn:async()=>{throw Error("不再生成");},previewCandidate:async()=>null,
    adoptCandidate:async()=>{generation++;const syncedGeneration=generation;if(mode==="later-change")generation++;if(mode==="dirty")dirty=true;return {status:"adopted",revision:2,syncedGeneration};},
  });});
  let result:any;await act(async()=>{result=await api.adoptEditorCandidate({kind:"work.editor.candidate",target:{outputId:"o"}} as any,"same-native-adopt");});
  expect(result).toMatchObject({status:mode==="synced"?"adopted":"saved-not-synced",revision:2});
});

// T1300：这里只核客户端同次准备；服务端当前稿/CAS仍由公共链单独验收。
function ticketFixture() {
  let selection:any={kind:"article",sectionIds:[]},writing:any={schemaVersion:1,brandProfileVersionId:null,sourceAssets:[]},scopeKey="group:g",generation=1,dirty=false,versionId="v";
  const calls:any[]=[];
  const target=()=>({schemaVersion:1,projectId:"p",outputId:"o",owner:"wechat_article",contentType:"article",savedBase:{kind:"artifact",artifactId:"a",versionId},documentDigest:"sha256:"+"a".repeat(64),selection,writingContext:writing});
  const port:any={readState:()=>({target:target(),outputId:"o",generation,dirty,preparation:{scopeKey,projectId:"p",outputId:"o",owner:"wechat_article",versionId,documentFingerprint:"document",selection,writingContext:writing}}),prepareForTurn:async(options:any)=>{calls.push(options);dirty=false;return structuredClone(target());},previewCandidate:async()=>null,adoptCandidate:async()=>({status:"adopted"})};
  return {port,calls,change:(kind:string)=>{if(kind==="selection")selection={kind:"article",sectionIds:["s"]};if(kind==="writing")writing={...writing,brandProfileVersionId:"changed"};if(kind==="scope")scopeKey="group:other";if(kind==="dirty")dirty=true;if(kind==="version")versionId="v2";if(kind==="generation")generation++;}};
}
it("T1300 同turn准备一次、凭据仅内存并一次消费，下一turn重新读取",async()=>{
  render(<DraftChatRequestProvider><Consumer/></DraftChatRequestProvider>);const f=ticketFixture();act(()=>{api.registerEditor(f.port);});
  let ticket:any;await act(async()=>{ticket=await (api as any).prepareEditorRequest("group:g");});act(()=>api.openChat({prefill:"重组",autoSend:true,preparedEditorTurn:ticket} as any));
  const nonce=api.request!.nonce;await act(async()=>{expect(await (api.prepareEditorTurn as any)(ticket,"group:g",nonce)).toMatchObject({outputId:"o"});});
  expect(f.calls).toEqual([{requireScript:true}]);expect(JSON.stringify(api.request)).not.toContain("documentFingerprint");expect(Object.keys(sessionStorage)).toHaveLength(0);
  await act(async()=>{await api.prepareEditorTurn(ticket,"group:g",nonce);});expect(f.calls).toHaveLength(2);
  await act(async()=>{await api.prepareEditorTurn();});expect(f.calls).toHaveLength(3);expect(f.calls[2]).toBeUndefined();
});
it.each(["selection","writing","dirty","version","generation","registration"])("T1300 同generation上下文或身份变更使准备失效并重新核对：%s",async kind=>{
 render(<DraftChatRequestProvider><Consumer/></DraftChatRequestProvider>);const f=ticketFixture();act(()=>{api.registerEditor(f.port);});let ticket:any;await act(async()=>{ticket=await (api as any).prepareEditorRequest("group:g");});act(()=>api.openChat({prefill:"重组",preparedEditorTurn:ticket} as any));const nonce=api.request!.nonce;
 act(()=>{if(kind==="registration")api.registerEditor(f.port);else f.change(kind);});await act(async()=>{await (api.prepareEditorTurn as any)(ticket,kind==="scope"?"group:other":"group:g",nonce);});expect(f.calls).toHaveLength(2);expect(f.calls[1]).toEqual({requireScript:true});
});
it("T1300 跨turn不能用旧凭据；注销/卸载后的迟到准备不发布",async()=>{
 const view=render(<DraftChatRequestProvider><Consumer/></DraftChatRequestProvider>);const f=ticketFixture();let unregister!:()=>void;act(()=>{unregister=api.registerEditor(f.port);});let ticket:any;await act(async()=>{ticket=await (api as any).prepareEditorRequest("group:g");});act(()=>api.openChat({prefill:"一",preparedEditorTurn:ticket} as any));const nonce=api.request!.nonce;
 await expect((api.prepareEditorTurn as any)(ticket,"group:g",nonce+1)).rejects.toThrow(/回合/);
 let finish!:(v:any)=>void;f.port.prepareForTurn=()=>new Promise(resolve=>{finish=resolve;});const pending=(api as any).prepareEditorRequest("group:g");const rejected=expect(pending).rejects.toThrow(/改变|卸载/);act(()=>unregister());view.unmount();await act(async()=>finish(f.port.readState().target));await rejected;
});

it("T1300 准备后切组不能把旧按钮原话带到新工作区",async()=>{
 render(<DraftChatRequestProvider><Consumer/></DraftChatRequestProvider>);const f=ticketFixture();act(()=>{api.registerEditor(f.port);});let ticket:any;await act(async()=>{ticket=await api.prepareEditorRequest("group:g");});act(()=>api.openChat({prefill:"原组指令",preparedEditorTurn:ticket}));f.change("scope");await expect(api.prepareEditorTurn(ticket,"group:other",api.request!.nonce)).rejects.toThrow(/工作区|归属/);expect(f.calls).toHaveLength(1);
});

it.each(["writing","selection","registration"])("T1300 prepare等待中%s变化拒绝迟到结果，新的明确回合仍可准备",async kind=>{
 render(<DraftChatRequestProvider><Consumer/></DraftChatRequestProvider>);const f=ticketFixture();act(()=>{api.registerEditor(f.port);});let finish!:(v:any)=>void;const original=f.port.prepareForTurn;f.port.prepareForTurn=()=>new Promise(resolve=>{finish=resolve;});const pending=api.prepareEditorRequest("group:g");const rejected=expect(pending).rejects.toThrow(/改变/);act(()=>{if(kind==="registration")api.registerEditor(f.port);else f.change(kind);});await act(async()=>finish(f.port.readState().target));await rejected;f.port.prepareForTurn=original;await act(async()=>{expect(await api.prepareEditorRequest("group:g")).toBeDefined();});
});

it("T1300 无preparation的旧owner端口不得被另一owner旧ticket触发准备或保存",async()=>{
 render(<DraftChatRequestProvider><Consumer/></DraftChatRequestProvider>);const f=ticketFixture();act(()=>{api.registerEditor(f.port);});let ticket:any;await act(async()=>{ticket=await api.prepareEditorRequest("group:g");});act(()=>api.openChat({prefill:"文章重组",preparedEditorTurn:ticket}));let prepared=0;act(()=>{api.registerEditor({readState:()=>({target:null,outputId:"other-video",generation:1,dirty:true}),prepareForTurn:async()=>{prepared++;return {...f.port.readState().target,outputId:"other-video",owner:"production"} as any;},previewCandidate:async()=>null,adoptCandidate:async()=>({status:"adopted"})});});await expect(api.prepareEditorTurn(ticket,"group:g",api.request!.nonce)).rejects.toThrow();expect(prepared).toBe(0);
});

it.each(['generation','scope','output','replace','unregister','proof'] as const)('T1303 只读准入await期间%s变化不得进入保存',async(mode)=>{
 render(<DraftChatRequestProvider><Consumer/></DraftChatRequestProvider>);
 const state:any={target:null,outputId:'o',generation:0,dirty:true,preparation:{scopeKey:'group:g',projectId:'p',outputId:'o',owner:'wechat_article',versionId:'v',documentFingerprint:'derived',selection:{kind:'article',sectionIds:[]}}};
 let release!:(value:any)=>void,adoptions=0;
 const port:any={readState:()=>state,prepareForTurn:async()=>{throw Error('不得保存或发送');},previewCandidate:async()=>null,admitCandidate:()=>new Promise(resolve=>{release=resolve;}),adoptCandidate:async()=>{adoptions++;return{status:'adopted'};}};
 let unregister!:()=>void;act(()=>{unregister=api.registerEditor(port);});const candidate:any={kind:'work.editor.candidate',target:{outputId:'o'}};
 const pending=api.adoptEditorCandidate(candidate,'original-key').catch(error=>error);
 act(()=>{if(mode==='generation')state.generation++;if(mode==='scope')state.preparation={...state.preparation,scopeKey:'group:other'};if(mode==='output')state.outputId='other';if(mode==='replace')api.registerEditor({...port});if(mode==='unregister'){unregister();api.registerEditor(port);}});
 await act(async()=>release(mode==='proof'?null:{isCurrent:()=>true}));expect(await pending).toBeInstanceOf(Error);expect(adoptions).toBe(0);
});
it('T1303 编辑后改回相同字节或同scope重新注册也不能重新取得派生资格',async()=>{
 render(<DraftChatRequestProvider><Consumer/></DraftChatRequestProvider>);let generation=0,admissions=0;
 const state=()=>({target:null,outputId:'o',generation,dirty:true,preparation:{scopeKey:'group:g',projectId:'p',outputId:'o',owner:'wechat_article' as const,versionId:'v',documentFingerprint:'same',selection:{kind:'article' as const,sectionIds:[]}}});
 const port={readState:state,prepareForTurn:async()=>{throw Error('不得发送');},previewCandidate:async()=>null,admitCandidate:async()=>{admissions++;return{isCurrent:()=>true};},adoptCandidate:async()=>({status:'adopted' as const})};act(()=>{api.registerEditor(port);generation++;api.notifyEditorChanged();generation++;api.notifyEditorChanged();api.registerEditor(port);});await expect(api.adoptEditorCandidate({kind:'work.editor.candidate',target:{outputId:'o'}} as any,'original-key')).rejects.toThrow(/未保存/);expect(admissions).toBe(0);
});


it("T1340 当前port纯ready刷新可读状态，克隆/旧port/卸载通知不影响当前消费者",()=>{
 let read="未就绪",renders=0;
 function View(){const chat=useDraftChatRequest();renders++;return <output data-testid="ready-owner">{chat.readEditorState()?.preparation?.outputId??"none"}</output>;}
 render(<DraftChatRequestProvider><Consumer/><View/></DraftChatRequestProvider>);
 const f=ticketFixture();f.port.readState=()=>({target:null,generation:1,dirty:false,preparation:{outputId:read}});
 let remove!:()=>void;act(()=>{remove=api.registerEditor(f.port);});
 const initial=renders;read="当前已就绪";act(()=>{api.notifyEditorReady({...f.port});});expect(renders).toBe(initial);expect(screen.getByTestId("ready-owner")).toHaveTextContent("未就绪");
 act(()=>api.notifyEditorReady(f.port));expect(screen.getByTestId("ready-owner")).toHaveTextContent("当前已就绪");
 const next=ticketFixture();act(()=>api.registerEditor(next.port));const stable=renders;act(()=>{api.notifyEditorReady(f.port);remove();});expect(renders).toBe(stable);expect(screen.getByTestId("ready-owner")).toHaveTextContent("o");
},120000);
it("T1340 纯ready不清原prepared ticket/epoch且不重新prepare",async()=>{
 render(<DraftChatRequestProvider><Consumer/></DraftChatRequestProvider>);const f=ticketFixture();act(()=>api.registerEditor(f.port));let ticket:any;
 await act(async()=>{ticket=await api.prepareEditorRequest("group:g");});act(()=>api.openChat({prefill:"原准备",preparedEditorTurn:ticket}));const nonce=api.request!.nonce;
 const before=f.port.readState();act(()=>{api.notifyEditorReady(f.port);api.notifyEditorReady(f.port);});
 expect(f.port.readState()).toEqual(before);await act(async()=>{expect(await api.prepareEditorTurn(ticket,"group:g",nonce)).toMatchObject({outputId:"o"});});expect(f.calls).toEqual([{requireScript:true}]);
},120000);
it("T1340 ready不退役首次派生，真实编辑后重复ready仍拒绝复活",async()=>{
 render(<DraftChatRequestProvider><Consumer/></DraftChatRequestProvider>);let generation=0,admissions=0,adoptions=0,dirty=true;
 const port={readState:()=>({target:null,outputId:"o",generation,dirty,preparation:{scopeKey:"group:g",projectId:"p",outputId:"o",owner:"wechat_article" as const,versionId:"v",documentFingerprint:"same",selection:{kind:"article" as const,sectionIds:[]}}}),prepareForTurn:async()=>{throw Error("不得发送");},previewCandidate:async()=>null,admitCandidate:async()=>{admissions++;return{isCurrent:()=>true};},adoptCandidate:async()=>{adoptions++;dirty=false;return{status:"adopted" as const,syncedGeneration:generation};}};
 act(()=>{api.registerEditor(port);api.notifyEditorReady(port);});await expect(api.adoptEditorCandidate({kind:"work.editor.candidate",target:{outputId:"o"}} as any,"first-key")).resolves.toMatchObject({status:"adopted"});expect([admissions,adoptions]).toEqual([1,1]);
 act(()=>{generation++;dirty=true;api.notifyEditorChanged();api.notifyEditorReady(port);});await expect(api.adoptEditorCandidate({kind:"work.editor.candidate",target:{outputId:"o"}} as any,"after-edit")).rejects.toThrow(/未保存/);expect([admissions,adoptions]).toEqual([1,1]);
},120000);
