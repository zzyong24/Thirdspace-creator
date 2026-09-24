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
