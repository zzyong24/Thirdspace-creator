import {expect,it,vi} from "vitest";
import {createLearningsService} from "./learnings.service";
const adopt=vi.hoisted(()=>vi.fn(async(input:Record<string,unknown>)=>({...input,id:"learning",userId:"u",accountId:"a",validationStatus:"validated",confidenceScore:0,reuseCount:0,createdAt:"2026-09-11",updatedAt:"2026-09-11"})));
vi.mock("./learnings.repository",()=>({createLearningsRepository:()=>({adoptLearning:adopt})}));
const ctx={userId:"u",accountId:"a",requestId:"test",source:"user" as const};
it("聊天经验采纳在写入前核对项目归属；正文保留依据与适用条件",async()=>{
 adopt.mockClear();
 const assertOwnsProject=vi.fn(async(_ctx:unknown,projectId:string)=>{if(projectId!=="owned")throw new Error("not owned");});
 const service=createLearningsService({db:{} as never,now:()=>"2026-09-11",nextId:()=>"id",projects:{assertOwnsProject,recordActivity:async()=>{}}});
 const body={title:"先演示结果",insight:"一条待验证方法",source:"当前稿第一段",applicability:"有真实演示素材时"};
 await expect(service.adoptLearning(ctx,{...body,projectId:undefined})).rejects.toThrow("来源项目");expect(adopt).not.toHaveBeenCalled();
 await expect(service.adoptLearning(ctx,{...body,projectId:"foreign"})).rejects.toThrow("not owned");expect(adopt).not.toHaveBeenCalled();
 await service.adoptLearning(ctx,{...body,projectId:"owned"});
 expect(assertOwnsProject).toHaveBeenLastCalledWith(ctx,"owned");expect(adopt).toHaveBeenCalledWith(expect.objectContaining({projectId:"owned",insight:"一条待验证方法\n来源依据：当前稿第一段\n适用条件：有真实演示素材时"}));
});
