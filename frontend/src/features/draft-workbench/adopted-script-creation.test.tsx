import * as React from "react";
import {act,cleanup,fireEvent,render,screen,waitFor} from "@testing-library/react";
import {afterEach,beforeEach,describe,expect,it,vi} from "vitest";
import type {Editor} from "@tiptap/react";
import {DraftChatRequestProvider,useDraftChatRequest} from "./draft-chat-request";
import {ScriptRichEditor} from "@/features/script/script-rich-editor";
import {loadScriptEditorData} from "@/features/script/script-editor-data";
import {WorkCreationCta} from "./creation-flow-ctas";

const api=vi.hoisted(()=>({get:vi.fn(),versions:vi.fn(),save:vi.fn(),pair:vi.fn()}));
vi.mock("next/navigation",()=>({useRouter:()=>({refresh:vi.fn()})}));
vi.mock("@/lib/contract-client.server",()=>({client:{}}));
vi.mock("@/lib/contract-client",()=>({client:{getArtifact:(...a:unknown[])=>api.get(...a),listArtifactVersions:(...a:unknown[])=>api.versions(...a),createArtifactVersion:(...a:unknown[])=>api.save(...a),getPreferences:async()=>({autosaveEnabled:false})}}));
vi.mock("./work-creation-request",()=>({prepareWorkCreationRequest:(...a:unknown[])=>api.pair(...a)}));
let request:ReturnType<typeof useDraftChatRequest>["request"];
function Probe(){request=useDraftChatRequest().request;return null;}
type Version={id:string;artifactId:string;versionNumber:number;contentText:string;contentData:Record<string,unknown>};
const plain:Version={id:"accepted-v2",artifactId:"script",versionNumber:2,contentText:"已采纳的第一段。\n\n第二段保留。",contentData:{}};
beforeEach(()=>{vi.clearAllMocks();localStorage.clear();sessionStorage.clear();localStorage.setItem("creatoros:current-group","group-real");request=null;api.save.mockRejectedValue(Error("不应重复保存已采纳稿"));api.pair.mockImplementation(async(_client,state)=>({scriptSourceRef:state.source,clientRequestId:state.clientRequestId}));});
afterEach(cleanup);

async function mountSaved(version:Version,firstLoad=false){
 let current=version.id,rows=[version],editor:Editor|null=null;
 api.get.mockImplementation(async()=>({id:"script",projectId:"project",currentVersionId:current}));api.versions.mockImplementation(async()=>rows);
 const data=await loadScriptEditorData("script",{getArtifact:api.get,listArtifactVersions:api.versions});expect(data?.editorHtml).toBeTruthy();
 const view=(html:string,id:string)=><DraftChatRequestProvider><Probe/><ScriptRichEditor projectId="project" artifactId="script" currentVersionId={id} initialHtml={html} onEditorReady={e=>{editor=e;}}/><WorkCreationCta projectId="project"/></DraftChatRequestProvider>;
 const mounted=render(view(firstLoad?data!.editorHtml!:"<p></p>",firstLoad?version.id:"reserved-v1"));
 await waitFor(()=>expect(editor).not.toBeNull());
 if(!firstLoad){mounted.rerender(view(data!.editorHtml!,version.id));await waitFor(()=>expect(editor!.getText()).toContain("保留"));}
 return {editor:()=>editor!,changeCurrent(id:string){current=id;},changeRows(value:Version[]){rows=value;},async applyVersion(value:Version){current=value.id;rows=[value];const next=await loadScriptEditorData("script",{getArtifact:api.get,listArtifactVersions:api.versions});mounted.rerender(view(next!.editorHtml!,value.id));await act(async()=>{});}};
}
async function clickCreation(){fireEvent.click(screen.getByRole("button",{name:"一键生成文章和图文"}));await waitFor(()=>expect(api.pair).toHaveBeenCalledOnce());expect(request).toMatchObject({autoSend:true,creationTarget:{scriptSourceRef:{kind:"project_script",id:"script",versionId:"accepted-v2"}}});expect(api.save).not.toHaveBeenCalled();}

describe("正式采纳稿→页面读侧→真实富文本编辑器→一键生成",()=>{
 it("纯文本采纳稿用原v2继续，不因显示标题或缺html误报不一致",async()=>{await mountSaved(plain);await clickCreation();});
 it("首次打开已有采纳稿也不追加一个编辑版本",async()=>{await mountSaved(plain,true);await clickCreation();});
 it("只有sections的历史稿按同一显示投影继续",async()=>{await mountSaved({...plain,contentData:{sections:[{heading:"开场",body:"保留正文",startSeconds:0,endSeconds:15,emphasis:true}]}});await clickCreation();});
 it("合法富文本标签被编辑器规范化后仍能继续",async()=>{await mountSaved({...plain,contentText:"保留正文",contentData:{html:"<p><b>保留正文</b></p>"}});await clickCreation();});
 it("外部相同正文的新版本更新锚点而不被误判并发",async()=>{const mounted=await mountSaved({...plain,contentText:"保留正文",contentData:{html:"<p>保留正文</p>"}});await mounted.applyVersion({...plain,id:"same-body-v3",versionNumber:3,contentText:"保留正文",contentData:{html:"<p>保留正文</p>"}});fireEvent.click(screen.getByRole("button",{name:"一键生成文章和图文"}));await waitFor(()=>expect(api.pair).toHaveBeenCalledOnce());expect(request?.creationTarget?.scriptSourceRef.versionId).toBe("same-body-v3");expect(api.save).not.toHaveBeenCalled();});
 it("真实并发更新仍拒绝，保留当前编辑内容",async()=>{const mounted=await mountSaved(plain);mounted.changeCurrent("concurrent-v3");fireEvent.click(screen.getByRole("button",{name:"一键生成文章和图文"}));expect(await screen.findByRole("alert")).toHaveTextContent("并发更新");expect(api.pair).not.toHaveBeenCalled();expect(api.save).not.toHaveBeenCalled();expect(mounted.editor().getText()).toContain("第二段保留");});
 it("读回正文不同仍拒绝，不能只凭相同版本ID放行",async()=>{await mountSaved(plain);api.versions.mockResolvedValue([{...plain,contentText:"完全不同的正式稿"}]);fireEvent.click(screen.getByRole("button",{name:"一键生成文章和图文"}));expect(await screen.findByRole("alert")).toHaveTextContent("读回不一致");expect(api.pair).not.toHaveBeenCalled();expect(api.save).not.toHaveBeenCalled();});
 it("已存富文本的纯文本字段不一致仍拒绝",async()=>{await mountSaved({...plain,contentText:"另一个正文",contentData:{html:"<p>保留正文</p>"}});fireEvent.click(screen.getByRole("button",{name:"一键生成文章和图文"}));expect(await screen.findByRole("alert")).toHaveTextContent("读回不一致");expect(api.pair).not.toHaveBeenCalled();});
 it("读回属于其他项目时仍拒绝",async()=>{await mountSaved(plain);api.get.mockResolvedValue({id:"script",projectId:"another-project",currentVersionId:plain.id});fireEvent.click(screen.getByRole("button",{name:"一键生成文章和图文"}));expect(await screen.findByRole("alert")).toHaveTextContent("不属于当前项目");expect(api.pair).not.toHaveBeenCalled();expect(api.save).not.toHaveBeenCalled();});
 it("读回在途发生输入，保留新输入且不提交生成",async()=>{const mounted=await mountSaved(plain);let finish!:(value:unknown)=>void;api.versions.mockImplementationOnce(()=>new Promise(resolve=>{finish=resolve;}));fireEvent.click(screen.getByRole("button",{name:"一键生成文章和图文"}));await waitFor(()=>expect(finish).toBeTypeOf("function"));await act(async()=>{mounted.editor().commands.insertContent("在途输入");finish([plain]);});expect(await screen.findByRole("alert")).toHaveTextContent("改变");expect(mounted.editor().getText()).toContain("在途输入");expect(api.pair).not.toHaveBeenCalled();expect(api.save).not.toHaveBeenCalled();});
 it("相同正文换版发生在准备途中也使原准备失效",async()=>{const rich={...plain,contentText:"保留正文",contentData:{html:"<p>保留正文</p>"}};const mounted=await mountSaved(rich);let finish!:(value:unknown)=>void;api.versions.mockImplementationOnce(()=>new Promise(resolve=>{finish=resolve;}));fireEvent.click(screen.getByRole("button",{name:"一键生成文章和图文"}));await waitFor(()=>expect(finish).toBeTypeOf("function"));await mounted.applyVersion({...rich,id:"same-body-v3",versionNumber:3});await act(async()=>finish([rich]));expect(await screen.findByRole("alert")).toHaveTextContent("改变");expect(api.pair).not.toHaveBeenCalled();expect(api.save).not.toHaveBeenCalled();fireEvent.click(screen.getByRole("button",{name:/一键生成文章和图文/}));await waitFor(()=>expect(api.pair).toHaveBeenCalledOnce());expect(request?.creationTarget?.scriptSourceRef.versionId).toBe("same-body-v3");});
 it("对话整稿采纳信号读回新版本，不沿用旧锚点或重复保存",async()=>{const mounted=await mountSaved(plain);const next={...plain,id:"chat-adopted-v3",versionNumber:3,contentText:"对话采纳后保留正文",contentData:{html:"<p>对话采纳后保留正文</p>"}};mounted.changeCurrent(next.id);mounted.changeRows([next]);const {emitScriptWrite}=await import("@/features/script/script-write-signal");await act(async()=>emitScriptWrite({artifactId:"script",html:next.contentData.html}));fireEvent.click(screen.getByRole("button",{name:"一键生成文章和图文"}));await waitFor(()=>expect(api.pair).toHaveBeenCalledOnce());expect(request?.creationTarget?.scriptSourceRef.versionId).toBe(next.id);expect(api.save).not.toHaveBeenCalled();});
});
