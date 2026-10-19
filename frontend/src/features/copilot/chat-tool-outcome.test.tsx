import * as React from "react";
import {expect,it,vi} from "vitest";
import {render,screen} from "@testing-library/react";
import {workEditorContext} from "@creatoros/contract";
import {readChatToolOutcome,ChatToolOutcomeNotice} from "./chat-tool-outcome";

const meta=(status="ok",sideEffect="none",error:unknown=null)=>({schemaVersion:1,callId:"real-call",status,summary:status==="ok"?"已读取":"账号权限已变更",error,sideEffect,continuation:null});
it("展示元信息剥离后仍符合真实旧严格作品合同，不改变原消息",()=>{
 const digest="sha256:"+"a".repeat(64),selection={kind:"article",sectionIds:[]},base={kind:"artifact",artifactId:"artifact-real",versionId:"version-real"};
 const data=workEditorContext.parse({kind:"work.editor.context",schemaVersion:1,target:{schemaVersion:1,projectId:"project-real",outputId:"output-real",documentDigest:digest,owner:"wechat_article",contentType:"article",savedBase:base,selection},base,baseDigest:digest,selection,readScope:{},selected:[],documentSummary:{},document:null,projectEnvelope:null,media:[],sourceTranscripts:[],capabilities:{},fieldWindow:null,complete:true,failureCode:null,error:null});
 const raw={...data,__creatorosOutcome:meta()};
 expect(workEditorContext.safeParse(raw).success).toBe(false);
 const result=readChatToolOutcome(raw);
 expect(workEditorContext.parse(result.data)).toEqual(data);
 expect(raw).toHaveProperty("__creatorosOutcome");
 expect(result.phase).toBe("read");
});
it("旧成功空列表与旧错误分别保留，错误不是空库",()=>{
 const success={kind:"context.projects",items:[],total:0,error:null};
 expect(readChatToolOutcome(success)).toMatchObject({data:success,blocksData:false});
 const failure=readChatToolOutcome({kind:"context.projects",items:[],error:"账号权限已变更"});
 expect(failure).toMatchObject({phase:"error",blocksData:true,reason:"账号权限已变更"});
});
it("宿主失败与恢复清楚可见，未知结果引导核对原操作而非自动重发",()=>{
 render(<ChatToolOutcomeNotice outcome={readChatToolOutcome({items:[],__creatorosOutcome:meta("blocked","none",{code:"permission",retryable:false,recovery:"重新选择有权限的账号组"})})}/>);
 expect(screen.getByRole("status")).toHaveTextContent("账号权限已变更");
 expect(screen.getByRole("status")).toHaveTextContent("重新选择有权限的账号组");
 expect(readChatToolOutcome({__creatorosOutcome:meta("error","unknown",{code:"unknown_commit",retryable:false,recovery:"核对原操作"})})).toMatchObject({phase:"unknown",blocksData:true});
});
it("读取状态不触发大对象序列化，失败提示不暴露路径堆栈或密钥",()=>{
 const toJSON=vi.fn(()=>{throw Error("不应执行序列化")});
 const result=readChatToolOutcome({toJSON,__creatorosOutcome:{...meta("error","none",{code:"transient",retryable:true,recovery:"到设置检查模型连接后继续"}),summary:"Error: failed at /Users/private/a.ts:9 api_key=sk-secret"}});
 render(<ChatToolOutcomeNotice outcome={result}/>);
 expect(toJSON).not.toHaveBeenCalled();
 expect(screen.queryByText(/sk-secret|\/Users\/|a\.ts/)).toBeNull();
 expect(screen.getByRole("status")).toHaveTextContent("检查模型连接");
});
