import { createServer } from "node:http";
import { resolve } from "node:path";
import { execFileSync } from "node:child_process";
import { beforeAll, describe, expect, it, vi } from "vitest";
import { createWorkerSupervisor } from "./worker-supervisor";
const execution = {executionTaskId: "exec-local", attempt: 1, fenceToken: "fence-current"};

// 此文件验证进程/SDK协议，数据库检查点的真实原子性由call-ports集成测试覆盖。
function checkpointFixture() {
  let sequence=0;let settled=false;let revision=0;
  let messages:Array<{role:"assistant";callId:string}>=[];
  return (port:string,data?:unknown):unknown=>{
    if(port==="reserveCall")sequence=1;
    if(port==="settleCall")settled=(data as {status:string}).status==="settled";
    if(port==="readCheckpoint")return {revision,ledgerSequence:sequence,messages,uncheckpointedReceipts:settled&&!messages.length?[{callId:"call-local",kind:"model",sequence:1,resultText:"真实子进程结果"}]:[],recovery:settled&&!messages.length?"requires_replay":"ready"};
    if(port==="saveCheckpoint"){
      expect(data).toEqual({expectedRevision:revision,expectedLedgerSequence:sequence,messages:[{role:"assistant",callId:"call-local"}]});
      revision++;messages=[{role:"assistant",callId:"call-local"}];return {revision};
    }
    return undefined;
  };
}

describe("真实独立 Worker 进程", () => {
  beforeAll(() => {
    execFileSync(process.execPath, [resolve("../ai-worker/scripts/build.mjs")], {stdio: "pipe"});
  }, 30000);
  it("使用私有端口取上下文与凭据，经真实 SDK 调本地供应商并提交结果", async () => {
    const calls: string[] = [];
    let submitted: unknown;
    let requestCount = 0;
    const server = createServer((req, res) => {
      requestCount++;
      req.resume();
      req.on("end", () => {
        res.writeHead(200, {"content-type": "text/event-stream"});
        res.end('data: {"id":"c1","object":"chat.completion.chunk","created":1,"model":"test","choices":[{"index":0,"delta":{"content":"真实子进程结果"},"finish_reason":null}]}\n\ndata: {"id":"c1","object":"chat.completion.chunk","created":1,"model":"test","choices":[{"index":0,"delta":{},"finish_reason":"stop"}],"usage":{"prompt_tokens":2,"completion_tokens":3,"total_tokens":5}}\n\ndata: [DONE]\n\n');
      });
    });
    await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve));
    const address = server.address() as {port: number};
    const checkpoint=checkpointFixture();
    const supervisor = createWorkerSupervisor({entryPath: resolve("../ai-worker/dist/execution-worker.cjs"), ports: {
      async validate(ref) {expect(ref).toEqual(execution);},
      async invoke(_ref, port, data) {
        calls.push(port);
        const checkpointReply=checkpoint(port,data);if(checkpointReply!==undefined)return checkpointReply;
        if (port === "reserveCall") return {callId:"call-local",status:"reserved"};
        if (port === "startCall") return {callId:"call-local",status:"started"};
        if (port === "readTaskContext") return {kind: "model.generate", prompt: "写一段正文", capability: "script", maxOutputTokens: 128, operationKey: "op-local"};
        if (port === "resolveModelCredential") return {apiFormat: "openai_chat", baseUrl: `http://127.0.0.1:${address.port}/v1`, model: "test", token: "test-only"};
        if (port === "commitResult") submitted = data;
        return {};
      },
    }});
    try {
      expect(await supervisor.start()).toEqual(["model.generate", "model.structured"]);
      expect(await supervisor.run(execution, Date.now()+10000)).toBe("completed");
      expect(requestCount).toBe(1);
      expect(submitted).toMatchObject({outcome: "succeeded", text: "真实子进程结果"});
      expect(calls).toEqual(["readTaskContext", "readCheckpoint", "reserveCall", "resolveModelCredential", "startCall", "settleCall", "readCheckpoint", "saveCheckpoint", "commitResult"]);
      expect(await supervisor.run(execution, Date.now()+10000)).toBe("completed");
      expect(requestCount).toBe(1);
    } finally {await supervisor.stop(); await new Promise<void>(resolve => server.close(() => resolve()));}
  }, 15000);

  it.each(["MODEL_AUTHORITY_CHANGED","MODEL_CREDENTIAL_UNAVAILABLE"])("凭据端口 %s 进入等待用户，且不启动供应商调用",async code=>{
    const calls:string[]=[];
    const checkpoint=checkpointFixture();
    const supervisor=createWorkerSupervisor({entryPath:resolve("../ai-worker/dist/execution-worker.cjs"),ports:{
      async validate(){},async invoke(_ref,port,data){
        calls.push(port);
        const checkpointReply=checkpoint(port,data);if(checkpointReply!==undefined)return checkpointReply;
        if(port==="readTaskContext")return {kind:"model.generate",prompt:"测试",capability:"script",maxOutputTokens:128,operationKey:"credential-error"};
        if(port==="reserveCall")return {callId:"credential-call",status:"reserved"};
        if(port==="resolveModelCredential")throw Object.assign(new Error("private credential detail"),{code});
        return {};
      },
    }});
    try{expect(await supervisor.run(execution,Date.now()+10000)).toBe("waiting_user");expect(calls).not.toContain("startCall");}
    finally{await supervisor.stop();}
  });

  it("旧租约在获取凭据之前被拒绝", async () => {
    const invoke = vi.fn(async () => ({}));
    const checkpoint=checkpointFixture();
    const supervisor = createWorkerSupervisor({entryPath: resolve("../ai-worker/dist/execution-worker.cjs"), ports: {
      async validate() {throw new Error("STALE_LEASE");}, invoke,
    }});
    try {
      await expect(supervisor.run(execution, Date.now()+10000)).rejects.toThrow("STALE_LEASE");
      expect(invoke).not.toHaveBeenCalled();
    } finally {await supervisor.stop();}
  });

  it.each([
    {status: 429, expected: "retry_wait", managed: false},
    {status: 401, expected: "waiting_user", managed: false},
    {status: 200, expected: "unknown_result", managed: false},
    {status: 429, expected: "retry_wait", managed: true},
    {status: 402, expected: "waiting_user", managed: true},
    {status: 402, expected: "waiting_user", managed: false},
  ])("供应商 $status 受管=$managed 故障按 $expected 返回且不自动重提", async ({status, expected, managed}) => {
    let requestCount = 0;
    const results: unknown[] = [];
    const server = createServer((req, res) => {
      requestCount++; req.resume();
      req.on("end", () => {
        res.writeHead(status, {"content-type": status === 200 ? "text/event-stream" : "application/json", "retry-after": "120"});
        res.end(status === 200
          ? 'data: {"id":"c1","object":"chat.completion.chunk","created":1,"model":"test","choices":[{"index":0,"delta":{"content":"未完成正文"},"finish_reason":null}]}\n\ndata: {"error":{"message":"private-key-in-error","type":"server_error","code":"server_error"}}\n\ndata: [DONE]\n\n'
          : JSON.stringify({error: {message: "private-key-in-error", type: "api_error"}}));
      });
    });
    await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve));
    const address = server.address() as {port: number};
    const checkpoint=checkpointFixture();
    const supervisor = createWorkerSupervisor({entryPath: resolve("../ai-worker/dist/execution-worker.cjs"), ports: {
      async validate() {},
      async invoke(_ref, port, data) {
        const checkpointReply=checkpoint(port,data);if(checkpointReply!==undefined)return checkpointReply;
        if (port === "reserveCall") return {callId:"call-local",status:"reserved"};
        if (port === "startCall") return {callId:"call-local",status:"started"};
        if (port === "readTaskContext") return {kind: "model.generate", prompt: "正文", capability: "script", maxOutputTokens: 128, operationKey: "error-op"};
        if (port === "resolveModelCredential") return {apiFormat: "openai_chat", baseUrl: `http://127.0.0.1:${address.port}/v1`, model: "test", token: "test-only", ...(managed ? {displayModelKey: "channel-managed"} : {})};
        results.push({port, data}); return {};
      },
    }});
    try {
      expect(await supervisor.run(execution, Date.now()+10000)).toBe(expected);
      expect(requestCount).toBe(1);
      expect(results).toContainEqual(expect.objectContaining({port: "commitResult", data: expect.objectContaining({outcome: expected})}));
      expect(JSON.stringify(results)).not.toContain("private-key-in-error");
      if (status === 429) expect(results).toContainEqual(expect.objectContaining({port: "commitResult", data: expect.objectContaining({retryAfterMs: 120000})}));
    } finally {await supervisor.stop(); server.closeAllConnections(); await new Promise<void>(resolve => server.close(() => resolve()));}
  }, 15000);

  it("活动流取消会断开供应商，仅结算未知用量，不提交候选且能再次启动", async () => {
    let opened = false;
    let disconnected = false;
    const calls: {port: string; data: unknown}[] = [];
    const server = createServer((req, res) => {
      req.resume();
      req.on("end", () => {
        res.writeHead(200, {"content-type": "text/event-stream"});
        res.write(': waiting\n\n');
        opened = true;
        res.on("close", () => {disconnected = true;});
      });
    });
    await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve));
    const address = server.address() as {port: number};
    const checkpoint=checkpointFixture();
    const supervisor = createWorkerSupervisor({entryPath: resolve("../ai-worker/dist/execution-worker.cjs"), ports: {
      async validate() {},
      async invoke(_ref, port, data) {
        calls.push({port, data});
        const checkpointReply=checkpoint(port,data);if(checkpointReply!==undefined)return checkpointReply;
        if (port === "reserveCall") return {callId:"call-local",status:"reserved"};
        if (port === "startCall") return {callId:"call-local",status:"started"};
        if (port === "readTaskContext") return {kind: "model.generate", prompt: "正文", capability: "script", maxOutputTokens: 128, operationKey: "cancel-op"};
        if (port === "resolveModelCredential") return {apiFormat: "openai_chat", baseUrl: `http://127.0.0.1:${address.port}/v1`, model: "test", token: "test-only"};
        return {};
      },
    }});
    try {
      const result = supervisor.run(execution, Date.now()+10000);
      await vi.waitFor(() => expect(opened).toBe(true));
      supervisor.cancel({...execution, fenceToken: "old-fence"});
      expect(disconnected).toBe(false);
      supervisor.cancel(execution);
      expect(await result).toBe("cancelled");
      await vi.waitFor(() => expect(disconnected).toBe(true));
      expect(calls.filter(x => x.port === "commitResult")).toHaveLength(0);
      expect(calls.find(x => x.port === "settleCall")?.data).toMatchObject({status: "unknown"});
      await supervisor.stop();
      expect(await supervisor.start()).toEqual(["model.generate", "model.structured"]);
    } finally {
      await supervisor.stop(); server.closeAllConnections();
      await new Promise<void>(resolve => server.close(() => resolve()));
    }
  }, 15000);
});
