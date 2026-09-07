import {it,expect,vi} from "vitest";
import {preparePublishPackageTaskInput} from "./publish-package-task-input";
const ctx={userId:"u",accountId:"a",requestId:"r",source:"user" as const};
it("完整正文、真实 output 与单平台保持原链语义，调用方变更不污染快照",async()=>{
 const owner={...ctx},input={projectId:"p",topic:"原主题"};let release!:(s:string)=>void;
 const getScript=vi.fn(()=>new Promise<string>(r=>{release=r;})),listOutputIdsByProject=vi.fn(async()=>["out","other"]);
 const work=preparePublishPackageTaskInput(owner,input,{getScript,listOutputIdsByProject});owner.accountId="other";input.topic="changed";
 const text="原始正文\n".repeat(10);release(text);
 expect(await work).toEqual({projectId:"p",topic:"原主题",scriptText:text,outputId:"out",platforms:["douyin"]});
 expect(listOutputIdsByProject).toHaveBeenCalledExactlyOnceWith(ctx,"p");
});
it("空稿、缺产出及属主失败都不虚构发布输入",async()=>{
 const listOutputIdsByProject=vi.fn(async()=>[] as string[]);
 await expect(preparePublishPackageTaskInput(ctx,{projectId:"p"},{getScript:async()=>"短",listOutputIdsByProject})).rejects.toThrow("还没有可用的整稿");expect(listOutputIdsByProject).not.toHaveBeenCalled();
 await expect(preparePublishPackageTaskInput(ctx,{projectId:"p"},{getScript:async()=>"正文".repeat(30),listOutputIdsByProject})).rejects.toThrow("outputId");
 const denied=new Error("OwnershipError");await expect(preparePublishPackageTaskInput(ctx,{projectId:"p"},{getScript:async()=>{throw denied;},listOutputIdsByProject})).rejects.toBe(denied);
});
