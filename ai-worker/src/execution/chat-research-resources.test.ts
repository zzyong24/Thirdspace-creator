import {expect,it,vi} from "vitest";
const fake=vi.hoisted(()=>({execute:vi.fn(),close:vi.fn(async()=>{})}));
vi.mock("./research-worker-tools",()=>({createResearchWorkerTools:()=>fake}));
import {createChatResearchResources,closeChatResearchResources} from "./chat-research-worker";
const output={status:"ok",summary:"找到页面",evidence:[],data:{results:[]},error:null,continuation:null,sideEffect:"none"};
it("同回合同查询复用成功观察，失败可再试，退出关闭所有资源",async()=>{
 fake.execute.mockReset();fake.close.mockClear();fake.execute.mockResolvedValueOnce(output).mockResolvedValueOnce({...output,status:"error"}).mockResolvedValueOnce(output);
 const signal=new AbortController().signal,resources=await createChatResearchResources(signal,async()=>{});
 const first=await resources.execute("web.search",{query:"原查询",count:10},{callId:"one",signal});
 first.summary="调用者修改";
 expect((await resources.execute("web.search",{query:"原查询",count:10},{callId:"two",signal})).summary).toBe("找到页面");
 expect(fake.execute).toHaveBeenCalledTimes(1);
 await resources.execute("web.search",{query:"新查询",count:10},{callId:"three",signal});
 await resources.execute("web.search",{query:"新查询",count:10},{callId:"four",signal});
 expect(fake.execute).toHaveBeenCalledTimes(3);
 await closeChatResearchResources();expect(fake.close).toHaveBeenCalledTimes(1);
 await resources.close();
});
it("已取消的任务不创建浏览器资源",async()=>{
 fake.close.mockClear();await expect(createChatResearchResources(AbortSignal.abort(),async()=>{})).rejects.toThrow();
 await closeChatResearchResources();expect(fake.close).not.toHaveBeenCalled();
});
