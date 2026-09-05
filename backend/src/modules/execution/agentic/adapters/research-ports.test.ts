import { describe,it,expect,vi } from "vitest";
import { createResearchPorts } from "./research-ports";
import { createResearchTools } from "./research-adapter";
const ctx={userId:"u",accountId:"a",requestId:"r",source:"user" as const};
const signal=new AbortController().signal;
const body="完整正文".repeat(7000);
function fixture(){
  const services={search:vi.fn(async()=>[{title:"来源",url:"https://example.com/page",snippet:"真实摘要"}]),read:vi.fn(async()=>({needLogin:false as boolean,title:"正文",fullText:body,sourceUrl:"https://example.com/final",domain:"example.com"})),stageKnowledge:vi.fn(async()=>{throw new Error("NOT_CONNECTED");})};
  return {services,ports:createResearchPorts(ctx,services)};
}
describe("调研只读服务与完整分页",()=>{
  it("搜索透传归属和取消信号，分页可取完整全文并只抓一次",async()=>{
    const {services,ports}=fixture();const tools=createResearchTools(ports);const search=tools.find(t=>t.name==="web.search")!;const read=tools.find(t=>t.name==="web.read")!;
    expect((await search.execute({query:"问题"},{signal,dryRun:false})).hasEvidence).toBe(true);
    expect(services.search).toHaveBeenCalledWith(ctx,"问题",{signal});
    let offset:number|null=0;let reconstructed="";let snapshotId:string|undefined;
    while(offset!==null){const result=await read.execute({url:"https://example.com/page",offset,snapshotId},{signal,dryRun:false});const data=result.data as {text:string;nextOffset:number|null;sourceUrl:string;totalLength:number;snapshotId:string};expect(data.sourceUrl).toBe("https://example.com/final");expect(data.totalLength).toBe(body.length);reconstructed+=data.text;offset=data.nextOffset;snapshotId=data.snapshotId;}
    await expect(read.execute({url:"https://example.com/page",offset:12000,snapshotId:"wrong"},{signal,dryRun:false})).rejects.toThrow("快照");
    expect(reconstructed).toBe(body);expect(services.read).toHaveBeenCalledTimes(1);expect(services.read).toHaveBeenCalledWith(ctx,"https://example.com/page",signal);
    expect(services.stageKnowledge).not.toHaveBeenCalled();
    const stopped=new AbortController();stopped.abort();await expect(ports.webRead({url:"https://example.com/page"},stopped.signal)).rejects.toThrow();
    await expect(read.execute({url:"https://example.com/page",offset:-1},{signal,dryRun:false})).rejects.toThrow();
  });
  it("第九个URL触发淘汰后，旧快照不能续接变化正文",async()=>{
    const {services,ports}=fixture();const read=createResearchTools(ports).find(tool=>tool.name==="web.read")!;
    const first=await read.execute({url:"https://example.com/original"},{signal,dryRun:false});
    for(let index=0;index<8;index++)await ports.webRead({url:`https://example.com/${index}`},signal);
    expect(services.read).toHaveBeenCalledTimes(9);
    services.read.mockResolvedValueOnce({needLogin:false,title:"更新正文",fullText:"变化后"+body,sourceUrl:"https://example.com/final",domain:"example.com"});
    await expect(read.execute({url:"https://example.com/original",offset:12000,snapshotId:(first.data as {snapshotId:string}).snapshotId},{signal,dryRun:false})).rejects.toThrow("快照");
    expect(services.read).toHaveBeenCalledTimes(10);
  });
  it("登录提示和失败不缓存，另一个账号不复用正文",async()=>{
    const {services,ports}=fixture();services.read.mockResolvedValueOnce({needLogin:true,title:"",fullText:"",sourceUrl:"",domain:"example.com"});
    expect((await ports.webRead({url:"https://example.com/page"},signal)).needLogin).toBe(true);
    expect((await ports.webRead({url:"https://example.com/page"},signal)).needLogin).toBe(false);
    const other=createResearchPorts({...ctx,accountId:"b"},services);await other.webRead({url:"https://example.com/page"},signal);expect(services.read).toHaveBeenCalledTimes(3);
    services.read.mockRejectedValueOnce(new Error("temporary"));await expect(ports.webRead({url:"https://example.com/new"},signal)).rejects.toThrow("temporary");
    await expect(ports.webRead({url:"https://example.com/new"},signal)).resolves.toMatchObject({needLogin:false});
  });
});
