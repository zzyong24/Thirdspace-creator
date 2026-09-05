import { beforeEach, afterEach, it, expect, vi } from "vitest";
import type {
  WorkerPort,
  TopicReadReceipt,
} from "@creatoros/contract/execution-worker";
const state = vi.hoisted(() => ({
  factory: vi.fn(),
  execute: vi.fn(),
  close: vi.fn(),
  sessionRead: undefined as
    undefined | ((id: string, signal?: AbortSignal) => Promise<unknown>),
}));
vi.mock("./research-worker-tools", () => ({
  createResearchWorkerTools: (deps: {
    sessionAccess: {
      read: (id: string, signal?: AbortSignal) => Promise<unknown>;
    };
  }) => {
    state.factory();
    state.sessionRead = deps.sessionAccess.read;
    return { execute: state.execute, close: state.close };
  },
}));
import {
  createTopicWorkerReads,
  closeTopicWorkerResources,
} from "./topic-worker-reads";
const request = {
  kind: "web",
  sourceId: "s",
  name: "源",
  domain: "example.com",
  url: "https://example.com",
};
const target = { kind: "source" as const, sourceId: "s" };
const ok: TopicReadReceipt = {
  kind: "web",
  status: "ok",
  data: { sourceUrl: "https://example.com", title: "原文", text: "持久正文" },
};
const reservation = (
  status = "reserved",
  receipt?: TopicReadReceipt,
  callId = "c",
) => ({
  callId,
  status,
  request,
  requestDigest: "sha256:" + "a".repeat(64),
  ...(receipt ? { receipt } : {}),
});
function fixture(
  handler: (port: WorkerPort, data: unknown) => unknown | Promise<unknown>,
  signal = new AbortController().signal,
) {
  const call = vi.fn(async (port: WorkerPort, data: unknown) =>
    handler(port, data),
  );
  return { call, reader: createTopicWorkerReads({ signal, call }) };
}
beforeEach(() => {
  state.factory.mockReset();
  state.sessionRead = undefined;
  state.execute.mockReset();
  state.close.mockReset();
  state.close.mockResolvedValue(undefined);
  state.execute.mockResolvedValue({
    status: "ok",
    data: {
      observation: {
        sourceUrl: "https://example.com",
        title: "原文",
        fullText: "持久正文",
      },
    },
  });
});
afterEach(async () => {
  await closeTopicWorkerResources();
});
it("登录态IPC超时未知不settle、不进入ordinal2，并可finally关闭资源", async () => {
  const { call, reader } = fixture((port) => {
    if (port === "reserveTopicRead") return reservation();
    if (port === "readTopicBrowserSession") throw Error("IPC timeout");
    return {};
  });
  state.execute.mockImplementation(async (_name, _input, scope) => {
    await state.sessionRead!(scope.callId, scope.signal);
    throw Error("unreachable");
  });
  try {
    await expect(reader.read(target)).rejects.toMatchObject({
      outcome: "unknown_result",
      errorCode: "TOPIC_READ_RECEIPT_UNKNOWN",
    });
  } finally {
    await reader.close();
  }
  expect(call.mock.calls.map((row) => row[0])).toEqual([
    "reserveTopicRead",
    "startTopicRead",
    "readTopicBrowserSession",
  ]);
  expect(state.execute).toHaveBeenCalledTimes(1);
  expect(state.factory).toHaveBeenCalledTimes(1);
  expect(state.close).toHaveBeenCalledTimes(1);
});
it("明确TRANSIENT结算后仅ordinal2再读成功", async () => {
  const { call, reader } = fixture((port, data) =>
    port === "reserveTopicRead"
      ? reservation(
          "reserved",
          undefined,
          "c" + (data as { ordinal: number }).ordinal,
        )
      : {},
  );
  state.execute.mockResolvedValueOnce({
    status: "error",
    error: { code: "transient" },
  });
  expect(await reader.read(target)).toEqual({ kind: "web", ...ok.data });
  expect(
    call.mock.calls
      .filter((row) => row[0] === "reserveTopicRead")
      .map((row) => (row[1] as { ordinal: number }).ordinal),
  ).toEqual([1, 2]);
  expect(state.execute).toHaveBeenCalledTimes(2);
  expect(state.factory).toHaveBeenCalledTimes(1);
  expect(
    call.mock.calls.filter((row) => row[0] === "settleTopicRead"),
  ).toHaveLength(2);
});
it("已结算NEEDS_LOGIN等待用户，不start也不重读", async () => {
  const { call, reader } = fixture(() =>
    reservation("settled", {
      kind: "web",
      status: "error",
      error: { code: "NEEDS_LOGIN", retryable: false },
    }),
  );
  await expect(reader.read(target)).rejects.toMatchObject({
    outcome: "waiting_user",
    errorCode: "NEEDS_LOGIN",
  });
  expect(call).toHaveBeenCalledTimes(1);
  expect(state.execute).not.toHaveBeenCalled();
});
it("已结算正文直接重放，从不初始化浏览器factory", async () => {
  const { call, reader } = fixture(() => reservation("settled", ok));
  expect(await reader.read(target)).toEqual({ kind: "web", ...ok.data });
  expect(call).toHaveBeenCalledTimes(1);
  expect(state.execute).not.toHaveBeenCalled();
  expect(state.factory).not.toHaveBeenCalled();
});
it("start回执丢失不执行外部读取或结算", async () => {
  const { call, reader } = fixture((port) => {
    if (port === "reserveTopicRead") return reservation();
    throw Error("start reply lost");
  });
  await expect(reader.read(target)).rejects.toMatchObject({
    outcome: "unknown_result",
  });
  expect(call.mock.calls.map((row) => row[0])).toEqual([
    "reserveTopicRead",
    "startTopicRead",
  ]);
  expect(state.execute).not.toHaveBeenCalled();
});
it("预算拒绝为failed，不开始外部读取", async () => {
  const { call, reader } = fixture(() => {
    throw Error("EXECUTION_BUDGET_EXHAUSTED");
  });
  await expect(reader.read(target)).rejects.toMatchObject({
    outcome: "failed",
    errorCode: "EXECUTION_BUDGET_EXHAUSTED",
  });
  expect(call).toHaveBeenCalledTimes(1);
  expect(state.execute).not.toHaveBeenCalled();
  expect(state.factory).not.toHaveBeenCalled();
});
it("取消发生在read前零IPC，close不初始化浏览器", async () => {
  const controller = new AbortController();
  controller.abort();
  const { call, reader } = fixture(() => reservation(), controller.signal);
  try {
    await expect(reader.read(target)).rejects.toThrow();
  } finally {
    await reader.close();
  }
  expect(call).not.toHaveBeenCalled();
  expect(state.execute).not.toHaveBeenCalled();
  expect(state.factory).not.toHaveBeenCalled();
  expect(state.close).not.toHaveBeenCalled();
});
it.each(["started", "unknown"])("历史%s不重做", async (status) => {
  const { call, reader } = fixture(() => reservation(status));
  await expect(reader.read(target)).rejects.toMatchObject({
    outcome: "unknown_result",
  });
  expect(call).toHaveBeenCalledTimes(1);
  expect(state.execute).not.toHaveBeenCalled();
  expect(state.factory).not.toHaveBeenCalled();
});
