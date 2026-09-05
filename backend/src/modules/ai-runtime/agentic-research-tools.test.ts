import {it,expect,vi} from "vitest";
import {createAgenticResearchTools} from "./agentic-research-tools";
import {KnowledgeSourceError} from "../ai/agentic-proposal-staging.service";
const ctx={userId:"u",accountId:"a",requestId:"test",source:"user" as const};
const scope={execution:{executionTaskId:"execution",attempt:1,fenceToken:"fence"},aiTaskId:"ai",callId:"call",toolCallId:"tool",signal:new AbortController().signal};
const input={title:"候选",note:"内容",sourceNote:"https://example.com",evidenceRefs:["actual-evidence"]};
it("确定来源错误成为可修正工具结果，数据库结果未知仍抛出",async()=>{
 const stage=vi.fn(async()=>{throw new KnowledgeSourceError("不能外传的原始说明");});const tools=createAgenticResearchTools({stage});
 const result=await tools.tools["knowledge.write"]!.execute!(ctx,input,scope);
 expect(result).toMatchObject({status:"error",sideEffect:"none",error:{code:"invalid_input",retryable:false}});expect(JSON.stringify(result)).not.toContain("原始说明");expect(stage).toHaveBeenCalledTimes(1);
 stage.mockImplementationOnce(async()=>{throw new Error("数据库提交响应丢失");});await expect(tools.tools["knowledge.write"]!.execute!(ctx,input,scope)).rejects.toThrow("数据库提交响应丢失");
});
it("续读引用必须成对提供，知识候选必须明确真实证据ID",()=>{
 const tools=createAgenticResearchTools({stage:async()=>{throw new Error("不执行");}});
 expect(tools.tools["web.read"]!.parameters.safeParse({url:"https://example.com",offset:12000}).success).toBe(false);
 expect(tools.tools["web.read"]!.parameters.safeParse({url:"https://example.com",snapshotId:"hash"}).success).toBe(false);
 expect(tools.tools["web.read"]!.parameters.safeParse({url:"https://example.com",offset:12000,snapshotId:"hash",evidenceRef:"evidence"}).success).toBe(true);
 expect(tools.tools["knowledge.write"]!.parameters.safeParse({...input,evidenceRefs:[]}).success).toBe(false);
 expect(tools.tools["web.search"]!.execute).toBeUndefined();expect(tools.tools["web.read"]!.execute).toBeUndefined();
});
it('浏览器工具声明使用严格协议且操作预演不提交',()=>{
 const {tools,definitions}=createAgenticResearchTools({stage:async()=>{throw new Error('不执行');}});
 expect(tools['browser.observe']?.effect).toBe('none');expect(tools['browser.act']?.effect).toBe('committed');
 expect(tools['browser.observe']?.parameters.safeParse({sessionId:'s',url:'https://example.com/'}).success).toBe(true);
 expect(tools['browser.act']?.parameters.safeParse({sessionId:'s',observationId:'o',action:'click',selector:'button'}).success).toBe(false);
 expect(definitions.find(row=>row.name==='browser.act')?.parameters).toMatchObject({type:'object',additionalProperties:false});
});
