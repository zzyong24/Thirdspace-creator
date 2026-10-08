import {expect,it,vi} from "vitest";
import {Client} from "@modelcontextprotocol/sdk/client/index.js";
import {StreamableHTTPClientTransport} from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import {startExternalTaskMcpBridge} from "./external-task-mcp-bridge";

it.each(["error","blocked","partial","ok","unknown"] as const)("真实任务MCP %s保留回执并表达错误，未知不自动重发",async status=>{
 const outcome={status:status==="unknown"?"error":status,summary:"真实回执",evidence:[],data:{kind:"context.projects",items:[],total:0},error:status==="error"||status==="blocked"?{code:"permission",retryable:false,recovery:"重新选择有权限的账号组"}:null,continuation:null,sideEffect:"none"};
 const controller=new AbortController(),call=vi.fn(async(port:string)=>port==="listExternalTaskTools"?{tools:[{name:"context.projects",version:"1",description:"读取真实项目",inputSchema:{type:"object",properties:{}}}]}:status==="unknown"?{status:"unknown"}:{status:"settled",outcome});
 const bridge=await startExternalTaskMcpBridge({turnCallId:"real-turn",signal:controller.signal,call});
 const client=new Client({name:"task-mcp-test",version:"1"}),headers=Object.fromEntries(bridge.configuration.headers.map(header=>[header.name,header.value]));
 try{
  await client.connect(new StreamableHTTPClientTransport(new URL(bridge.configuration.url),{requestInit:{headers}}));
  expect((await client.listTools()).tools[0]?.name).toBe("context.projects");
  const result=await client.callTool({name:"context.projects",arguments:{}},undefined,{timeout:120000}) as any;
  expect(result.isError===true).toBe(status==="error"||status==="blocked"||status==="unknown");
  if(status!=="unknown")expect(JSON.parse(result.content[0].text)).toEqual(outcome);else expect(result.content[0].text).toContain("不能自动重试");
  expect(call.mock.calls.filter(([port])=>port==="executeExternalTaskTool")).toHaveLength(1);
 }finally{await client.close();await bridge.close();}
});
