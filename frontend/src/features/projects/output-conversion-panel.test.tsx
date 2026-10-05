import * as React from "react";
import {cleanup,fireEvent,render,screen,waitFor} from "@testing-library/react";
import {afterEach,beforeEach,expect,it,vi} from "vitest";
const api=vi.hoisted(()=>({listCreativeCapabilities:vi.fn(),convertOutput:vi.fn(),getOutputConversion:vi.fn(),getResult:vi.fn(),getArticleCandidate:vi.fn(),getGraphicPost:vi.fn(),getArticle:vi.fn(),getTask:vi.fn(),getArtifact:vi.fn(),adoptResult:vi.fn(),retryResult:vi.fn()}));
vi.mock("@/lib/contract-client",()=>({client:api}));
import {OutputConversionPanel} from "./output-conversion-panel";
const props={accountId:"account-a",projectId:"project",outputId:"article-source",sourceType:"article" as const,versionId:"source-version",dirty:false,fields:{title:"保存标题",summary:"选定摘要"},sections:[{sectionId:"s",heading:"小标题",body:"未选正文"}],images:[]};
const reply={targetOutputId:"target-image",targetType:"image",resultId:"r-title",taskId:null,bundleId:"b",status:"queued",items:[{targetField:"title",resultId:"r-title",taskId:null,status:"queued",errorCode:null,adoption:{status:"not_adopted"}}]};
afterEach(cleanup);
beforeEach(()=>{Object.values(api).forEach(m=>m.mockReset());sessionStorage.clear();localStorage.setItem("creatoros:current-account","account-a");api.listCreativeCapabilities.mockResolvedValue({items:["title","body","cardBriefs"].map(kind=>({outputType:"image",platform:null,kind,state:"supported"}))});api.convertOutput.mockResolvedValue(reply);api.getResult.mockResolvedValue({resultId:"r-title",kind:"title",status:"queued",value:null,errorCode:null});api.getOutputConversion.mockResolvedValue(reply);});
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
 const ready={...reply,status:"complete",items:[{...reply.items[0],taskId:"task-title",status:"succeeded"}]};
 const row={resultId:"r-title",kind:"title",outputId:"target-image",status:"succeeded",value:"候选标题",errorCode:null,baseVersionId:"base",typedCandidateRef:{owner:"graphic_post",id:"candidate"}};
 api.convertOutput.mockResolvedValue(ready);api.getResult.mockResolvedValue(row);
 api.getGraphicPost.mockResolvedValueOnce({currentVersionId:"base"}).mockResolvedValue({currentVersionId:"owner-already-adopted"});
 api.adoptResult.mockRejectedValueOnce(Error("回执丢失")).mockResolvedValue({status:"adopted"});
 render(<OutputConversionPanel {...props}/>);fireEvent.click(screen.getByRole("button",{name:"转成其他作品"}));
 await waitFor(()=>expect(screen.getByRole("button",{name:"开始转换"})).toBeEnabled());fireEvent.click(screen.getByRole("button",{name:"开始转换"}));
 fireEvent.change(await screen.findByLabelText("标题候选编辑"),{target:{value:"人工标题"}});
 fireEvent.click(screen.getByRole("button",{name:"采用标题"}));await screen.findByRole("alert");
 expect(screen.getByLabelText("标题候选编辑")).toHaveValue("人工标题");
 fireEvent.click(screen.getByRole("button",{name:"采用标题"}));await waitFor(()=>expect(api.adoptResult).toHaveBeenCalledTimes(2));
 expect(api.adoptResult.mock.calls[1][0]).toEqual(api.adoptResult.mock.calls[0][0]);
});
it("页面刷新后恢复丢回执采用的人工值和冻结请求",async()=>{
 const ready={...reply,status:"complete",items:[{...reply.items[0],taskId:"task-title",status:"succeeded"}]};
 api.convertOutput.mockResolvedValue(ready);api.getOutputConversion.mockResolvedValue(ready);
 api.getResult.mockResolvedValue({resultId:"r-title",kind:"title",outputId:"target-image",status:"succeeded",value:"候选标题",errorCode:null,baseVersionId:"base",typedCandidateRef:{owner:"graphic_post",id:"candidate"}});
 api.getGraphicPost.mockResolvedValue({currentVersionId:"base"});api.adoptResult.mockRejectedValueOnce(Error("回执丢失"));
 const view=render(<OutputConversionPanel {...props}/>);fireEvent.click(screen.getByRole("button",{name:"转成其他作品"}));
 await waitFor(()=>expect(screen.getByRole("button",{name:"开始转换"})).toBeEnabled());fireEvent.click(screen.getByRole("button",{name:"开始转换"}));
 fireEvent.change(await screen.findByLabelText("标题候选编辑"),{target:{value:"刷新仍保留人工标题"}});fireEvent.click(screen.getByRole("button",{name:"采用标题"}));await screen.findByRole("alert");
 const first=api.adoptResult.mock.calls[0][0];view.unmount();api.getGraphicPost.mockResolvedValue({currentVersionId:"already-adopted"});api.adoptResult.mockResolvedValue({status:"adopted"});
 render(<OutputConversionPanel {...props}/>);fireEvent.click(screen.getByRole("button",{name:"转成其他作品"}));
 await waitFor(()=>expect(screen.getByLabelText("标题候选编辑")).toHaveValue("刷新仍保留人工标题"));fireEvent.click(screen.getByRole("button",{name:"采用标题"}));
 await waitFor(()=>expect(api.adoptResult).toHaveBeenCalledTimes(2));expect(api.adoptResult.mock.calls[1][0]).toEqual(first);
});
it("刷新读回未绑定重试预约，使用服务端原请求号恢复原结果",async()=>{
 const pending={...reply,items:[{...reply.items[0],resultId:"retry-reserved"}]};api.convertOutput.mockResolvedValue(pending);api.getOutputConversion.mockResolvedValue(pending);
 api.getResult.mockResolvedValue({resultId:"retry-reserved",kind:"title",status:"queued",value:null,errorCode:"RETRY_SUBMISSION_UNKNOWN",retryOf:"original-result",retryRequestId:"original-retry-request",taskId:null,typedCandidateRef:null});
 api.retryResult.mockResolvedValue({status:"running"});render(<OutputConversionPanel {...props}/>);fireEvent.click(screen.getByRole("button",{name:"转成其他作品"}));
 await waitFor(()=>expect(screen.getByRole("button",{name:"开始转换"})).toBeEnabled());fireEvent.click(screen.getByRole("button",{name:"开始转换"}));
 fireEvent.click(await screen.findByRole("button",{name:"恢复这次重试"}));
 await waitFor(()=>expect(api.retryResult).toHaveBeenCalledWith({params:{resultId:"original-result"},query:undefined,body:{clientRequestId:"original-retry-request"}}));
});
it("切换账号后丢弃迟到的原账号转换回执",async()=>{
 let resolve!: (value:typeof reply)=>void;api.convertOutput.mockImplementation(()=>new Promise(r=>{resolve=r;}));
 const view=render(<OutputConversionPanel {...props}/>);fireEvent.click(screen.getByRole("button",{name:"转成其他作品"}));await waitFor(()=>expect(screen.getByRole("button",{name:"开始转换"})).toBeEnabled());fireEvent.click(screen.getByRole("button",{name:"开始转换"}));
 await waitFor(()=>expect(api.convertOutput).toHaveBeenCalled());localStorage.setItem("creatoros:current-account","account-b");view.rerender(<OutputConversionPanel {...props} accountId="account-b"/>);
 resolve(reply);fireEvent.click(screen.getByRole("button",{name:"转成其他作品"}));
 await waitFor(()=>expect(screen.getByRole("button",{name:"开始转换"})).toBeEnabled());expect(screen.queryByRole("link",{name:"打开目标作品"})).not.toBeInTheDocument();expect(api.getResult).not.toHaveBeenCalled();
});
