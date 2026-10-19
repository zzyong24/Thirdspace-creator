import { afterEach, describe, expect, it, vi } from "vitest";
import { createChatTaskControl } from "./chat-task-control";

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("chat task receipt", () => {
  it("records the durable task receipt and keeps it while reconnecting the same turn", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        new Response("ok", {
          headers: { "x-execution-task-id": "execution-original" },
        }),
      )
      .mockResolvedValueOnce(new Response("temporary", { status: 503 }));
    vi.stubGlobal("fetch", fetchMock);
    const control = createChatTaskControl();

    await control.fetch("/api/chat", {
      method: "POST",
      body: JSON.stringify({ trigger: "submit-message" }),
    });
    expect(control.currentTaskId()).toBe("execution-original");

    await control.fetch("/api/chat", {
      method: "POST",
      body: JSON.stringify({ trigger: "regenerate-message" }),
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
