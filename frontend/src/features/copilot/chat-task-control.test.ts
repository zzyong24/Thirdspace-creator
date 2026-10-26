import { afterEach, describe, expect, it, vi } from "vitest";
import { createChatTaskControl } from "./chat-task-control";

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("chat task receipt", () => {
  it.each(["none","partial"])("T-1408 缺完整原轮回执%s时拒绝自动重发，不能退回submit",async receipt=>{
    const fetchMock=vi.fn(async()=>new Response("unknown",{status:503,headers:receipt==="partial"?{"x-execution-task-id":"original"}:{}}));
    vi.stubGlobal("fetch",fetchMock);const control=createChatTaskControl();
    const messages=[{id:"source",role:"user"}];
    await control.fetch("/api/chat",{body:JSON.stringify({trigger:"submit-message",messages})});
    await expect(control.fetch("/api/chat",{body:JSON.stringify({trigger:"regenerate-message",conversationId:"conversation",messages})})).rejects.toThrow("CHAT_RESULT_UNCONFIRMED");
    expect(fetchMock).toHaveBeenCalledOnce();
  });
  it.each(["conversation","source"])("T-1407 拒绝不同%s的原轮恢复，不发送请求",async variant=>{
    const fetchMock=vi.fn(async()=>new Response("ok",{headers:{"x-execution-task-id":"execution-original","x-conversation-id":"conversation-original","x-source-message-id":"server-user"}}));
    vi.stubGlobal("fetch",fetchMock);const control=createChatTaskControl();
    const messages=[{id:"client-user",role:"user"}];
    await control.fetch("/api/chat",{body:JSON.stringify({trigger:"submit-message",messages})});
    await expect(control.fetch("/api/chat",{body:JSON.stringify({trigger:"regenerate-message",conversationId:variant==="conversation"?"other":"conversation-original",messages:variant==="source"?[{id:"other-user",role:"user"}]:messages,recoveryIntent:"resume"})})).rejects.toThrow("CHAT_RESULT_UNCONFIRMED");
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
  it("T-1407 取消进行中及确认后旧恢复均不重新提交，新消息可单独开始",async()=>{
    let confirm!:(value:Response)=>void;
    const fetchMock=vi.fn().mockResolvedValueOnce(new Response("ok",{headers:{"x-execution-task-id":"original","x-conversation-id":"conversation","x-source-message-id":"source"}})).mockImplementationOnce(()=>new Promise<Response>(resolve=>{confirm=resolve;})).mockResolvedValueOnce(new Response("next"));
    vi.stubGlobal("fetch",fetchMock);const control=createChatTaskControl();
    const messages=[{id:"source",role:"user"}];
    await control.fetch("/api/chat",{body:JSON.stringify({trigger:"submit-message",messages})});
    const cancelling=control.cancel();await Promise.resolve();
    const old={body:JSON.stringify({trigger:"regenerate-message",conversationId:"conversation",messages})};
    await expect(control.fetch("/api/chat",old)).rejects.toMatchObject({name:"AbortError"});
    confirm(new Response("{}"));expect(await cancelling).toBe(true);
    await expect(control.fetch("/api/chat",old)).rejects.toMatchObject({name:"AbortError"});
    control.release();await expect(control.fetch("/api/chat",old)).rejects.toMatchObject({name:"AbortError"});
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(JSON.parse(String(fetchMock.mock.calls[1][1].body)).input.body.command).toBe("cancel");
    await control.fetch("/api/chat",{body:JSON.stringify({trigger:"submit-message",messages:[{id:"new",role:"user"}]})});
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });
  it("T-1407 原轮重连只观察真实三元回执，不再重新提交已取消的消息", async () => {
    const headers={"x-execution-task-id":"execution-original","x-conversation-id":"conversation-original","x-source-message-id":"server-user"};
    const fetchMock=vi.fn().mockImplementation(async(_input:RequestInfo,_init?:RequestInit)=>new Response("ok",{headers}));
    vi.stubGlobal("fetch",fetchMock);
    const control=createChatTaskControl();
    const messages=[{id:"client-user",role:"user",parts:[{type:"text",text:"原请求"}]}];
    await control.fetch("/api/chat",{body:JSON.stringify({trigger:"submit-message",messages})});
    await control.fetch("/api/chat",{body:JSON.stringify({trigger:"regenerate-message",conversationId:"conversation-original",messages})});
    expect(JSON.parse(String(fetchMock.mock.calls[1][1]!.body)).originalTask).toEqual({executionTaskId:"execution-original",conversationId:"conversation-original",sourceMessageId:"server-user",intent:"observe"});
    await control.fetch("/api/chat",{body:JSON.stringify({trigger:"regenerate-message",conversationId:"conversation-original",messages,recoveryIntent:"resume"})});
    expect(JSON.parse(String(fetchMock.mock.calls[2][1]!.body)).originalTask.intent).toBe("resume");
  });
  it("T-1407 切会话释放旧观察并拒绝晚到回执",async()=>{
    let release!:(value:Response)=>void;let signal:AbortSignal|undefined;
    vi.stubGlobal("fetch",vi.fn((_input,init)=>{signal=init.signal;return new Promise<Response>(resolve=>{release=resolve;});}));
    const control=createChatTaskControl();
    const pending=control.fetch("/api/chat",{body:JSON.stringify({trigger:"submit-message"})}).catch(error=>error);
    await Promise.resolve();control.release();
    expect(signal?.aborted).toBe(true);
    release(new Response("late",{headers:{"x-execution-task-id":"old"}}));
    expect(await pending).toMatchObject({name:"AbortError"});expect(control.currentTaskId()).toBeNull();
  });
  it("records the durable task receipt and keeps it while reconnecting the same turn", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        new Response("ok", {
          headers: { "x-execution-task-id": "execution-original","x-conversation-id":"conversation-original","x-source-message-id":"source-original" },
        }),
      )
      .mockResolvedValueOnce(new Response("temporary", { status: 503 }));
    vi.stubGlobal("fetch", fetchMock);
    const control = createChatTaskControl();

    await control.fetch("/api/chat", {
      method: "POST",
      body: JSON.stringify({ trigger: "submit-message",messages:[{id:"source-original",role:"user"}] }),
    });
    expect(control.currentTaskId()).toBe("execution-original");

    await control.fetch("/api/chat", {
      method: "POST",
      body: JSON.stringify({ trigger: "regenerate-message",conversationId:"conversation-original",messages:[{id:"source-original",role:"user"}] }),
    });
    expect(control.currentTaskId()).toBe("execution-original");
  });

  it("clears an old receipt when a new user turn starts", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        new Response("ok", {
          headers: { "x-execution-task-id": "execution-old" },
        }),
      )
      .mockResolvedValueOnce(new Response("temporary", { status: 503 }));
    vi.stubGlobal("fetch", fetchMock);
    const control = createChatTaskControl();

    await control.fetch("/api/chat", {
      method: "POST",
      body: JSON.stringify({ trigger: "submit-message" }),
    });
    await control.fetch("/api/chat", {
      method: "POST",
      body: JSON.stringify({ trigger: "submit-message" }),
    });

    expect(control.currentTaskId()).toBeNull();
  });
});


describe("响应头前停止观察",()=>{
 it("服务端已持久提交但未回头时即时停止HTTP观察，不伪造取消任务",async()=>{
  let release!:(response:Response)=>void;let requestSignal:AbortSignal|null|undefined;
  // 本地服务端替身先建立真实任务记录，响应头仅人为延迟；停止观察不能删该事实。
  const serverTasks=new Map<string,{status:string}>();
  const fetchMock=vi.fn((_input:RequestInfo,init?:RequestInit)=>{requestSignal=init?.signal;serverTasks.set("durable-A",{status:"queued"});return new Promise<Response>(resolve=>{release=resolve})});vi.stubGlobal("fetch",fetchMock);
  const control=createChatTaskControl();const request=control.fetch("/api/chat",{body:JSON.stringify({trigger:"submit-message"})}).catch(error=>error);await Promise.resolve();
  const result=await Promise.race([control.cancel(),new Promise(resolve=>setTimeout(()=>resolve("still-waiting"),25))]);
  expect(result).toBe(true);expect(requestSignal?.aborted).toBe(true);expect(control.stopOutcome).toBe("waiting_stopped");expect(fetchMock).toHaveBeenCalledTimes(1);
  expect(serverTasks.get("durable-A")).toEqual({status:"queued"});expect(control.currentTaskId()).toBeNull();
  release(new Response("late",{headers:{"x-execution-task-id":"durable-A"}}));await request;
  expect(control.currentTaskId()).toBeNull();expect(serverTasks.has("durable-A")).toBe(true);
 });
 it("A停止后可提交B，A迟到响应头不得覆盖B回执",async()=>{
  let release!:(response:Response)=>void;vi.stubGlobal("fetch",vi.fn().mockImplementationOnce(()=>new Promise<Response>(resolve=>{release=resolve})).mockResolvedValueOnce(new Response("B",{headers:{"x-execution-task-id":"durable-B"}})));
  const control=createChatTaskControl();const first=control.fetch("/api/chat",{body:JSON.stringify({trigger:"submit-message"})}).catch(error=>error);await Promise.resolve();
  // 不等待旧cancel完成，以独立覆盖旧A晚回盖B问题。
  void control.cancel().catch(()=>undefined);await Promise.resolve();await control.fetch("/api/chat",{body:JSON.stringify({trigger:"submit-message"})});
  release(new Response("A",{headers:{"x-execution-task-id":"durable-A"}}));await first;await Promise.resolve();
  expect(control.currentTaskId()).toBe("durable-B");
 });
});
