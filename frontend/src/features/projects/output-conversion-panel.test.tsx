import * as React from "react";
import {cleanup,fireEvent,render,screen,waitFor} from "@testing-library/react";
import {afterEach,beforeEach,expect,it,vi} from "vitest";
import {ENDPOINTS} from "@creatoros/contract";
const requests:Array<{id:string;input:any;headers:Headers;signal:AbortSignal|null}>=[];
const api=vi.hoisted(()=>({listCreativeCapabilities:vi.fn(),convertOutput:vi.fn(),getOutputConversion:vi.fn(),getResult:vi.fn(),getArticleCandidate:vi.fn(),getGraphicPost:vi.fn(),getArticle:vi.fn(),getTask:vi.fn(),getArtifact:vi.fn(),adoptResult:vi.fn(),retryResult:vi.fn()}));
vi.mock("@/lib/contract-client",()=>({client:api}));
const handlers=()=>new Map<string,(input:any)=>Promise<unknown>|unknown>([
 [ENDPOINTS.listCreativeCapabilities.id,api.listCreativeCapabilities],[ENDPOINTS.convertOutput.id,api.convertOutput],
 [ENDPOINTS.getOutputConversion.id,api.getOutputConversion],[ENDPOINTS.getResult.id,api.getResult],
 [ENDPOINTS.getArticleCandidate.id,api.getArticleCandidate],[ENDPOINTS.getGraphicPost.id,api.getGraphicPost],
 [ENDPOINTS.getArticle.id,api.getArticle],[ENDPOINTS.getTask.id,api.getTask],[ENDPOINTS.getArtifact.id,api.getArtifact],
 [ENDPOINTS.adoptResult.id,api.adoptResult],[ENDPOINTS.retryResult.id,api.retryResult],
]);
function installRealScopeTransport(){vi.stubGlobal("fetch",vi.fn(async(_url:RequestInfo|URL,init?:RequestInit)=>{const parsed=JSON.parse(String(init?.body)) as {id:string;input:unknown};requests.push({id:parsed.id,input:parsed.input,headers:new Headers(init?.headers),signal:init?.signal instanceof AbortSignal?init.signal:null});const handler=handlers().get(parsed.id);if(!handler)throw Error(`unexpected dispatch ${parsed.id}`);return new Response(JSON.stringify({data:await handler(parsed.input),meta:{requestId:"fixture-dispatch"}}),{status:200,headers:{"content-type":"application/json"}});}));}
import {OutputConversionPanel} from "./output-conversion-panel";
const props={accountId:"account-a",projectId:"project",outputId:"article-source",sourceType:"article" as const,versionId:"source-version",dirty:false,fields:{title:"保存标题",summary:"选定摘要"},sections:[{sectionId:"s",heading:"小标题",body:"未选正文"}],images:[]};
const at="2026-10-06T00:00:00.000Z",digest="a".repeat(64),requestSummary={sourceOutputId:"article-source",sourceVersionId:"source-version",targetType:"image" as const,mode:"whole" as const,clientRequestId:"fixture-request-1",reuseImages:[]};
const sourceAnchor={kind:"output_version" as const,sourceOutputId:"article-source",artifactId:"artifact-source",versionId:"source-version",sourceType:"article" as const,selectionDigest:digest,selection:{mode:"whole" as const}};
const resultIdentity={title:"r-title",body:"r-body",cardBriefs:"r-cards"} as const;
const receiptItems=(status:"queued"|"running"|"succeeded",taskId:string|null)=>["title","body","cardBriefs"].map(targetField=>({targetField,resultId:resultIdentity[targetField as keyof typeof resultIdentity],taskId,status,errorCode:null,adoption:{status:"not_adopted" as const}}));
const reply={targetOutputId:"target-image",targetType:"image" as const,resultId:"r-title",taskId:null,bundleId:"bundle-1",sourceAnchor,requestSummary,targetFields:["title","body","cardBriefs"],status:"queued" as const,items:receiptItems("queued",null)};
const receiptFor=(request:any,status:"queued"|"running"|"complete"="queued")=>{const taskId=status==="queued"?null:"task-conversion",selection=request.mode==="whole"?{mode:"whole" as const}:{mode:"selected" as const,sourceSectionIds:request.sourceSectionIds,sourceFields:request.sourceFields,textRanges:request.textRanges};return {...reply,taskId,requestSummary:structuredClone(request),sourceAnchor:{...sourceAnchor,sourceOutputId:request.sourceOutputId,versionId:request.sourceVersionId,selection},targetFields:request.mode==="selected"?[...request.targetFields]:["title","body","cardBriefs"],status,items:receiptItems(status==="complete"?"succeeded":status,taskId)};};
let lastReceipt:any=reply;
const resultValue={title:"候选标题",body:"候选正文",cardBriefs:[{cardId:"card-1",title:"候选图卡",body:"图卡正文",sourceRefs:[]}]} as const;
const resultFor=(resultId:string,status:"queued"|"running"|"succeeded"="succeeded",overrides:Record<string,unknown>={})=>{const kind=(Object.entries(resultIdentity).find(([,id])=>id===resultId)?.[0]??"title") as keyof typeof resultIdentity;return {resultId,projectId:"project",outputId:"target-image",outputType:"image",targetPlatform:null,targetSectionId:null,kind,status,typedCandidateRef:status==="succeeded"?{owner:"graphic_post",id:`candidate-${kind}`}:null,taskId:status==="queued"?null:"task-conversion",baseVersionId:status==="queued"?null:"base",ruleSnapshotRef:null,appliedRules:"not_applied",sourceRefs:[],value:status==="succeeded"?resultValue[kind]:null,retryRequestId:null,errorCode:null,retryOf:null,createdAt:at,updatedAt:at,...overrides};};
const graphic=(currentVersionId:string)=>({projectId:"project",outputId:"target-image",targetPlatform:null,artifactId:"target-artifact",currentVersionId,current:{schemaVersion:1,title:"候选",body:"",summary:"",tags:[],imageUses:[],sourceRefs:[],ruleSnapshotRef:null},versions:[{id:currentVersionId,versionNumber:1,createdAt:at,changeSummary:"fixture"}]});
const adopted=(versionId="adopted-version")=>({owner:"graphic_post" as const,resultId:"r-title",versionId,status:"adopted" as const});
afterEach(()=>{cleanup();vi.unstubAllGlobals();});
beforeEach(()=>{Object.values(api).forEach(m=>m.mockReset());requests.length=0;sessionStorage.clear();localStorage.removeItem("creatoros:current-group");localStorage.setItem("creatoros:current-account","account-a");installRealScopeTransport();api.listCreativeCapabilities.mockResolvedValue({items:["title","body","cardBriefs"].map(kind=>({outputType:"image",platform:null,kind,state:"supported",reasonCode:null,lastVerifiedAt:at}))});api.convertOutput.mockImplementation(({body}:{body:any})=>(lastReceipt=receiptFor(body,"queued")));api.getResult.mockImplementation(({params}:{params:{resultId:string}})=>resultFor(params.resultId,"queued"));api.getOutputConversion.mockImplementation(()=>lastReceipt);});
it("未保存稿不提交转换，提示先保存；面板未展开不请求能力",async()=>{
 render(<OutputConversionPanel {...props} dirty/>);expect(api.listCreativeCapabilities).not.toHaveBeenCalled();
 fireEvent.click(screen.getByRole("button",{name:"转成其他作品"}));
 expect(screen.getByText(/先保存当前稿/)).toBeInTheDocument();
 await waitFor(()=>expect(screen.getByRole("button",{name:"开始转换"})).toBeDisabled());expect(api.convertOutput).not.toHaveBeenCalled();
});
it("局部转换仅提交明确保存字段，回复后链接指向真实独立作品",async()=>{
 render(<OutputConversionPanel {...props}/>);fireEvent.click(screen.getByRole("button",{name:"转成其他作品"}));
 fireEvent.click(screen.getByLabelText("只转换选中内容"));fireEvent.click(screen.getByLabelText("来源摘要"));
 await waitFor(()=>expect(screen.getByRole("button",{name:"开始转换"})).toBeEnabled());fireEvent.click(screen.getByRole("button",{name:"开始转换"}));
 await waitFor(()=>expect(api.convertOutput).toHaveBeenCalledWith({params:undefined,query:undefined,body:expect.objectContaining({sourceOutputId:"article-source",sourceVersionId:"source-version",mode:"selected",sourceFields:["summary"],sourceSectionIds:[],textRanges:[],targetType:"image",targetFields:["title","body","cardBriefs"],reuseImages:[]})}));
 expect(await screen.findByRole("link",{name:"打开目标作品"})).toHaveAttribute("href","/projects/project/outputs/target-image/image");
});

it("采用回执丢失后保留人工编辑和原版本/请求号重试",async()=>{
 const ready={...reply,taskId:"task-title",status:"complete",items:receiptItems("succeeded","task-title")};
 const row=resultFor("r-title");
 api.convertOutput.mockImplementation(({body}:{body:any})=>(lastReceipt=receiptFor(body,"complete")));api.getResult.mockImplementation(({params}:{params:{resultId:string}})=>params.resultId==="r-title"?row:resultFor(params.resultId));
 api.getGraphicPost.mockResolvedValueOnce(graphic("base")).mockResolvedValue(graphic("owner-already-adopted"));
 api.adoptResult.mockRejectedValueOnce(Error("回执丢失")).mockResolvedValue(adopted());
 render(<OutputConversionPanel {...props}/>);fireEvent.click(screen.getByRole("button",{name:"转成其他作品"}));
 await waitFor(()=>expect(screen.getByRole("button",{name:"开始转换"})).toBeEnabled());fireEvent.click(screen.getByRole("button",{name:"开始转换"}));
 fireEvent.change(await screen.findByLabelText("标题候选编辑"),{target:{value:"人工标题"}});
 fireEvent.click(screen.getByRole("button",{name:"采用标题"}));await screen.findByRole("alert");
 expect(screen.getByLabelText("标题候选编辑")).toHaveValue("人工标题");
 fireEvent.click(screen.getByRole("button",{name:"采用标题"}));await waitFor(()=>expect(api.adoptResult).toHaveBeenCalledTimes(2));
 expect(api.adoptResult.mock.calls[1][0]).toEqual(api.adoptResult.mock.calls[0][0]);
});
it("页面刷新后恢复丢回执采用的人工值和冻结请求",async()=>{
 const ready={...reply,taskId:"task-title",status:"complete",items:receiptItems("succeeded","task-title")};
 api.convertOutput.mockImplementation(({body}:{body:any})=>(lastReceipt=receiptFor(body,"complete")));api.getOutputConversion.mockImplementation(()=>lastReceipt);
 api.getResult.mockImplementation(({params}:{params:{resultId:string}})=>resultFor(params.resultId));
 api.getGraphicPost.mockResolvedValue(graphic("base"));api.adoptResult.mockRejectedValueOnce(Error("回执丢失"));
 const view=render(<OutputConversionPanel {...props}/>);fireEvent.click(screen.getByRole("button",{name:"转成其他作品"}));
 await waitFor(()=>expect(screen.getByRole("button",{name:"开始转换"})).toBeEnabled());fireEvent.click(screen.getByRole("button",{name:"开始转换"}));
 fireEvent.change(await screen.findByLabelText("标题候选编辑"),{target:{value:"刷新仍保留人工标题"}});fireEvent.click(screen.getByRole("button",{name:"采用标题"}));await screen.findByRole("alert");
 const first=api.adoptResult.mock.calls[0][0];view.unmount();api.getGraphicPost.mockResolvedValue(graphic("already-adopted"));api.adoptResult.mockResolvedValue(adopted("already-adopted"));
 render(<OutputConversionPanel {...props}/>);fireEvent.click(screen.getByRole("button",{name:"转成其他作品"}));
 await waitFor(()=>expect(screen.getByLabelText("标题候选编辑")).toHaveValue("刷新仍保留人工标题"));fireEvent.click(screen.getByRole("button",{name:"采用标题"}));
 await waitFor(()=>expect(api.adoptResult).toHaveBeenCalledTimes(2));expect(api.adoptResult.mock.calls[1][0]).toEqual(first);
});
it("刷新读回未绑定重试预约，使用服务端原请求号恢复原结果",async()=>{
 const pending={...reply,resultId:"retry-reserved",items:reply.items.map(item=>item.targetField==="title"?{...item,resultId:"retry-reserved"}:item)};api.convertOutput.mockImplementation(({body}:{body:any})=>{const base=receiptFor(body,"queued");return lastReceipt={...base,resultId:"retry-reserved",items:base.items.map((item:any)=>item.targetField==="title"?{...item,resultId:"retry-reserved"}:item)};});api.getOutputConversion.mockImplementation(()=>lastReceipt);
 api.getResult.mockImplementation(({params}:{params:{resultId:string}})=>params.resultId==="retry-reserved"?resultFor("retry-reserved","queued",{kind:"title",errorCode:"RETRY_SUBMISSION_UNKNOWN",retryOf:"original-result",retryRequestId:"original-retry-request"}):resultFor(params.resultId,"queued"));
 api.retryResult.mockResolvedValue(resultFor("original-result","running",{kind:"title",typedCandidateRef:null,taskId:"retry-task"}));render(<OutputConversionPanel {...props}/>);fireEvent.click(screen.getByRole("button",{name:"转成其他作品"}));
 await waitFor(()=>expect(screen.getByRole("button",{name:"开始转换"})).toBeEnabled());fireEvent.click(screen.getByRole("button",{name:"开始转换"}));
 fireEvent.click(await screen.findByRole("button",{name:"恢复这次重试"}));
 await waitFor(()=>expect(api.retryResult).toHaveBeenCalledWith({params:{resultId:"original-result"},query:undefined,body:{clientRequestId:"original-retry-request"}}));
});
it("切换账号后丢弃迟到的原账号转换回执",async()=>{
 let resolve!: (value:any)=>void;api.convertOutput.mockImplementation(()=>new Promise(r=>{resolve=r;}));
 const view=render(<OutputConversionPanel {...props}/>);fireEvent.click(screen.getByRole("button",{name:"转成其他作品"}));await waitFor(()=>expect(screen.getByRole("button",{name:"开始转换"})).toBeEnabled());fireEvent.click(screen.getByRole("button",{name:"开始转换"}));
 await waitFor(()=>expect(api.convertOutput).toHaveBeenCalled());localStorage.setItem("creatoros:current-account","account-b");window.dispatchEvent(new CustomEvent("creatoros:accounts-changed"));view.rerender(<OutputConversionPanel {...props} accountId="account-b"/>);
 resolve(receiptFor(api.convertOutput.mock.calls[0][0].body,"queued"));fireEvent.click(screen.getByRole("button",{name:"转成其他作品"}));
 await waitFor(()=>expect(screen.getByRole("button",{name:"开始转换"})).toBeEnabled());expect(screen.queryByRole("link",{name:"打开目标作品"})).not.toBeInTheDocument();expect(api.getResult).not.toHaveBeenCalled();
});

it("纯组真实envelope与候选人工编辑在同组平台筛选后保持冻结",async()=>{
 const ready={...reply,taskId:"task-title",status:"complete",items:receiptItems("succeeded","task-title")};
 api.convertOutput.mockImplementation(({body}:{body:any})=>(lastReceipt=receiptFor(body,"complete")));api.getResult.mockImplementation(({params}:{params:{resultId:string}})=>resultFor(params.resultId));
 localStorage.setItem("creatoros:current-group","group-a");localStorage.setItem("creatoros:current-account","platform-a");
 const view=render(<OutputConversionPanel {...props} accountId={null}/>);fireEvent.click(screen.getByRole("button",{name:"转成其他作品"}));
 fireEvent.click(screen.getByLabelText("只转换选中内容"));fireEvent.click(screen.getByLabelText("来源摘要"));
 await waitFor(()=>expect(api.listCreativeCapabilities).toHaveBeenCalledOnce());const capability=requests.find(row=>row.id===ENDPOINTS.listCreativeCapabilities.id)!;
 expect(capability.headers.get("x-group-id")).toBe("group-a");expect(capability.headers.has("x-account-id")).toBe(false);expect(capability.input).toEqual(expect.objectContaining({query:{projectId:"project"}}));
 fireEvent.click(screen.getByRole("button",{name:"开始转换"}));await waitFor(()=>expect(api.convertOutput).toHaveBeenCalledOnce());fireEvent.change(await screen.findByLabelText("标题候选编辑"),{target:{value:"组内人工标题"}});
 const frozenCache=sessionStorage.getItem("creatoros-output-conversion:group:group-a:article-source"),frozenBody=structuredClone(api.convertOutput.mock.calls[0][0]);expect(frozenCache).not.toBeNull();
 localStorage.setItem("creatoros:current-account","platform-b");window.dispatchEvent(new CustomEvent("creatoros:accounts-changed"));view.rerender(<OutputConversionPanel {...props} accountId={null}/>);
 expect(screen.getByLabelText("标题候选编辑")).toHaveValue("组内人工标题");expect(sessionStorage.getItem("creatoros-output-conversion:group:group-a:article-source")).toBe(frozenCache);expect(api.convertOutput.mock.calls[0][0]).toEqual(frozenBody);expect(lastReceipt.requestSummary).toEqual(frozenBody.body);expect(lastReceipt.sourceAnchor.selection).toEqual({mode:"selected",sourceSectionIds:[],sourceFields:["summary"],textRanges:[]});expect(JSON.parse(frozenCache!).clientRequestId).toBe(frozenBody.body.clientRequestId);expect(api.listCreativeCapabilities).toHaveBeenCalledOnce();
 const converted=requests.find(row=>row.id===ENDPOINTS.convertOutput.id)!;expect(converted.headers.get("x-group-id")).toBe("group-a");expect(converted.headers.has("x-account-id")).toBe(false);
});

it("未选账号和props错账号都不能读取能力、提交、采用或写缓存",async()=>{
 for(const mismatch of [false,true]){localStorage.removeItem("creatoros:current-group");if(mismatch)localStorage.setItem("creatoros:current-account","account-a");else localStorage.removeItem("creatoros:current-account");const view=render(<OutputConversionPanel {...props} accountId={mismatch?"account-b":null}/>);fireEvent.click(screen.getByRole("button",{name:"转成其他作品"}));await Promise.resolve();expect(api.listCreativeCapabilities).not.toHaveBeenCalled();expect(api.convertOutput).not.toHaveBeenCalled();expect(api.adoptResult).not.toHaveBeenCalled();expect([...Array(sessionStorage.length)].map((_,index)=>sessionStorage.key(index))).toEqual([]);view.unmount();}
});
