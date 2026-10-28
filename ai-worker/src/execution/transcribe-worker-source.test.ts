import { beforeEach, describe, expect, it, vi } from "vitest";

const io = vi.hoisted(() => ({
  anonymous: vi.fn(),
  detail: vi.fn(),
}));

vi.mock("../runtime/douyin-transcribe-source", () => ({
  fetchDouyinVideoSource: async (
    _opts: unknown,
    deps: { fetchViaDetail: () => Promise<unknown> },
  ) => deps.fetchViaDetail(),
}));
vi.mock("../runtime/douyin-transcribe-anonymous", () => ({
  fetchDouyinVideoUrlAnonymously: (
    ...args: Parameters<typeof io.anonymous>
  ) => io.anonymous(...args),
  openAnonymousDouyinContext: vi.fn(),
}));
vi.mock("../runtime/douyin-transcribe-detail", () => ({
  fetchDouyinVideoUrlViaDetail: (...args: Parameters<typeof io.detail>) =>
    io.detail(...args),
}));
vi.mock("../runtime/browser/profile-directory", () => ({
  resolveDouyinProfileIdentity: async () => ({
    authDir: "D:/auth/douyin-profile",
    profileKey: "ab".repeat(32),
  }),
}));
vi.mock("../runtime/browser/douyin-profile-context", () => ({
  openDouyinProfileContext: vi.fn(),
}));

import { createTranscribeWorkerSource } from "./transcribe-worker-source";

const profile = {
  authDir: "D:/auth/douyin-profile",
  profileKey: "ab".repeat(32),
  leaseId: "6f1b5c2e-9a40-4d1e-8c77-2b0a9e5d4c31",
};

function harness() {
  const calls: Array<{ port: string; data: unknown }> = [];
  const source = createTranscribeWorkerSource(
    new AbortController().signal,
    async (port, data) => {
      calls.push({ port, data });
      if (port === "acquireTranscribeProfile") return profile;
      return { ok: true };
    },
  );
  return { calls, source };
}

describe("游客转写不占用 creator-center", () => {
  beforeEach(() => {
    io.anonymous.mockReset();
    io.detail.mockReset();
  });

  it("游客成功时不申请、不上报账号通道", async () => {
    io.anonymous.mockImplementation(
      async (
        _opts: unknown,
        deps: { channel: (run: () => Promise<unknown>) => Promise<unknown> },
      ) =>
        deps.channel(async () => ({
          kind: "video",
          playUrl: "https://cdn.example/guest",
        })),
    );
    const { calls, source } = harness();

    await expect(source("111")).resolves.toEqual({
      kind: "video",
      playUrl: "https://cdn.example/guest",
    });
    expect(calls).toEqual([]);
    expect(io.detail).not.toHaveBeenCalled();
  });

  it("游客验证码不写入账号通道，随后才走登录详情", async () => {
    io.anonymous.mockImplementation(
      async (
        _opts: unknown,
        deps: { channel: (run: () => Promise<unknown>) => Promise<unknown> },
      ) => {
        await deps.channel(async () => {
          throw new Error("验证码");
        });
      },
    );
    io.detail.mockImplementation(
      async (
        _opts: unknown,
        deps: { channel: (run: () => Promise<unknown>) => Promise<unknown> },
      ) =>
        deps.channel(async () => ({
          kind: "video",
          playUrl: "https://cdn.example/login",
        })),
    );
    const { calls, source } = harness();

    await expect(source("111")).resolves.toEqual({
      kind: "video",
      playUrl: "https://cdn.example/login",
    });
    expect(calls).toEqual([
      { port: "acquireTranscribeProfile", data: { awemeId: "111" } },
      {
        port: "acquireTranscribeChannel",
        data: { awemeId: "111", channel: "creator-center" },
      },
      {
        port: "reportTranscribeChannel",
        data: {
          awemeId: "111",
          channel: "creator-center",
          result: { kind: "success" },
        },
      },
    ]);
  });
});
