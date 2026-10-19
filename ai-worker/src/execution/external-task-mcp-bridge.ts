import { createServer, type Server as HttpServer } from "node:http";
import { randomBytes, timingSafeEqual } from "node:crypto";
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { CallToolRequestSchema, ListToolsRequestSchema } from "@modelcontextprotocol/sdk/types.js";
import { z } from "zod";
import type { McpServerHttp } from "@agentclientprotocol/sdk";
import {agenticToolOutcomeSchema,type WorkerPort } from "@creatoros/contract/execution-worker";

type Call=(port:WorkerPort,data:unknown,signal?:AbortSignal)=>Promise<unknown>;
const listedSchema=z.object({tools:z.array(z.object({name:z.string().min(1),version:z.string().min(1),description:z.string(),inputSchema:z.record(z.string(),z.unknown())}).strict())}).strict();
const outcomeSchema=z.object({status:z.enum(["settled","unknown"]),outcome:z.unknown().optional()}).passthrough();

export interface ExternalTaskMcpBridge {
  configuration:McpServerHttp & {type:"http"};
  close():Promise<void>;
}

/** 只在本轮 worker 存活时监听回环；每次工具调用仍由后端租约与冻结权限复核。 */
export async function startExternalTaskMcpBridge(input:{turnCallId:string;signal:AbortSignal;call:Call}):Promise<ExternalTaskMcpBridge>{
  const secret=randomBytes(32).toString("base64url");
  const createMcp=()=>{
    const server=new Server({name:"creatoros-task",version:"1"},{capabilities:{tools:{}}});
    const transport=new StreamableHTTPServerTransport({sessionIdGenerator:undefined,enableJsonResponse:true});
    server.setRequestHandler(ListToolsRequestSchema,async()=>{
      input.signal.throwIfAborted();
      const data=listedSchema.parse(await input.call("listExternalTaskTools",{},input.signal));
      return {tools:data.tools.map(tool=>({name:tool.name,description:tool.description,inputSchema:tool.inputSchema as {type:"object"}}))};
    });
    server.setRequestHandler(CallToolRequestSchema,async(request,extra)=>{
      const signal=AbortSignal.any([input.signal,extra.signal]);
      try{
        signal.throwIfAborted();
        const toolCallId=String(extra.requestId);
        const response=outcomeSchema.parse(await input.call("executeExternalTaskTool",{turnCallId:input.turnCallId,toolCallId,toolName:request.params.name,input:request.params.arguments??{}},signal));
        if(response.status!=="settled")return {content:[{type:"text" as const,text:"TOOL_RESULT_UNKNOWN: 请先对账，此工具调用不能自动重试。"}],isError:true};
        const outcome=agenticToolOutcomeSchema.parse(response.outcome);
        return {content:[{type:"text" as const,text:JSON.stringify(outcome)}],...(outcome.status==="error"||outcome.status==="blocked"?{isError:true}:{})};
      }catch(error){
        const code=error && typeof error==="object" && "code" in error && typeof error.code==="string"?error.code:"TOOL_EXECUTION_FAILED";
        return {content:[{type:"text" as const,text:code}],isError:true};
      }
    });
    return {server,transport};
  };
  const http:HttpServer=createServer((request,response)=>{
    const bearer=request.headers.authorization??"";
    const supplied=Buffer.from(bearer.startsWith("Bearer ")?bearer.slice(7):"");
    const expected=Buffer.from(secret);
    if(request.url!=="/mcp" || supplied.length!==expected.length || !timingSafeEqual(supplied,expected)){
      response.writeHead(403).end();return;
    }
    // SDK 的无状态 Streamable HTTP transport 每个 HTTP 请求只能使用一次。
    void (async()=>{
      const {server,transport}=createMcp();
      try{await server.connect(transport);await transport.handleRequest(request,response);}
      catch{if(!response.headersSent)response.writeHead(500).end();else response.end();}
      finally{await server.close().catch(()=>{});}
    })();
  });
  try{
    await new Promise<void>((resolve,reject)=>{http.once("error",reject);http.listen(0,"127.0.0.1",resolve);});
    const address=http.address();
    if(!address || typeof address==="string")throw new Error("MCP_LOOPBACK_BIND_FAILED");
    let closing:Promise<void>|null=null;
    const close=()=>{
      closing??=new Promise<void>(resolve=>{
        http.close(()=>resolve());
        // 取消后可能仍有长轮询或工具响应占用连接；后台账本负责把结果标为未知。
        http.closeAllConnections();
      });
      return closing;
    };
    input.signal.addEventListener("abort",()=>{void close();},{once:true});
    // 每轮随机服务名避免与用户全局 MCP 配置同名而被 ACP 适配器去重覆盖。
    return {configuration:{type:"http",name:`creatoros-task-${secret.slice(0,12)}`,url:`http://127.0.0.1:${address.port}/mcp`,headers:[{name:"Authorization",value:`Bearer ${secret}`}]},close};
  }catch(error){
    http.close();
    throw error;
  }
}
