import * as React from "react";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// [T-253] 本机文件读取卡:needApproval → 运行时确认卡(允许一次 / 总是允许该目录 / 拒绝),
// 允许 → POST /api/v1/local/read-grant + onDecision 发「重调同一路径」话术;拒绝 → 本地渲已拒 +
// onDecision 发「别再试」话术。file/listing/error 三态直渲。

import {
  ChatLocalReadCard,
  type LocalReadApproval,
} from "./chat-local-read-card";

const APPROVAL: LocalReadApproval = {
  path: "/Users/u/Desktop/稿子.md",
  size: 2048,
  type: "md",
};

const fetchMock = vi.fn();

afterEach(() => cleanup());
beforeEach(() => {
  vi.clearAllMocks();
  fetchMock.mockResolvedValue({
    ok: true,
    json: async () => ({ ok: true }),
  });
  vi.stubGlobal("fetch", fetchMock);
});

describe("ChatLocalReadCard — needApproval 确认卡", () => {
  it("渲路径 + 大小/类型 + 三按钮(渲染不授权)", () => {
    render(
      <ChatLocalReadCard
        needApproval={APPROVAL}
        file={null}
        listing={null}
        error={null}
      />,
    );
    expect(screen.getByText("/Users/u/Desktop/稿子.md")).toBeTruthy();
    expect(screen.getByText(/2\.0 KB/)).toBeTruthy();
    expect(screen.getByText("允许一次")).toBeTruthy();
    expect(screen.getByText("总是允许该目录")).toBeTruthy();
    expect(screen.getByText("拒绝")).toBeTruthy();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("允许一次 → POST read-grant(mode=once)+ onDecision 发「重调同一路径」话术", async () => {
    const onDecision = vi.fn();
    render(
      <ChatLocalReadCard
        needApproval={APPROVAL}
        file={null}
        listing={null}
        error={null}
        onDecision={onDecision}
      />,
    );
    await userEvent.click(screen.getByText("允许一次"));
    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    const [url, init] = fetchMock.mock.calls[0]! as [string, RequestInit];
    expect(url).toBe("/api/v1/local/read-grant");
    expect(JSON.parse(init.body as string)).toEqual({
      path: APPROVAL.path,
      mode: "once",
    });
    await waitFor(() =>
      expect(onDecision).toHaveBeenCalledWith(
        expect.stringContaining("local.read"),
      ),
    );
    expect(onDecision.mock.calls[0]![0]).toContain(APPROVAL.path);
  });

  it("总是允许该目录 → mode=dir", async () => {
    render(
      <ChatLocalReadCard
        needApproval={APPROVAL}
        file={null}
        listing={null}
        error={null}
        onDecision={vi.fn()}
      />,
    );
    await userEvent.click(screen.getByText("总是允许该目录"));
    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    const [, init] = fetchMock.mock.calls[0]! as [string, RequestInit];
    expect(JSON.parse(init.body as string).mode).toBe("dir");
  });

  it("拒绝 → 不打授权接口,onDecision 发「别再试」话术,卡渲已拒绝", async () => {
    const onDecision = vi.fn();
    render(
      <ChatLocalReadCard
        needApproval={APPROVAL}
        file={null}
        listing={null}
        error={null}
        onDecision={onDecision}
      />,
    );
    await userEvent.click(screen.getByText("拒绝"));
    expect(fetchMock).not.toHaveBeenCalled();
    expect(onDecision).toHaveBeenCalledWith(
      expect.stringContaining("拒绝"),
    );
    expect(screen.getByText(/已拒绝/)).toBeTruthy();
  });

  it("授权接口 403(敏感路径不进授权表)→ 卡渲服务端原因,不发 onDecision", async () => {
    fetchMock.mockResolvedValue({
      ok: false,
      json: async () => ({ error: "「.env」环境变量文件通常含密钥/凭据,无论是否授权都不读取。" }),
    });
    const onDecision = vi.fn();
    render(
      <ChatLocalReadCard
        needApproval={{ path: "/Users/u/.env", size: 10, type: "env" }}
        file={null}
        listing={null}
        error={null}
        onDecision={onDecision}
      />,
    );
    await userEvent.click(screen.getByText("允许一次"));
    await waitFor(() => expect(screen.getByText(/无论是否授权都不读取/)).toBeTruthy());
    expect(onDecision).not.toHaveBeenCalled();
  });
});

describe("ChatLocalReadCard — 结果态", () => {
  it("file 态:文件名/路径 + 窗口进度(hasMore 提示继续翻窗)+ 正文预览", () => {
    render(
      <ChatLocalReadCard
        needApproval={null}
        file={{
          path: "/Users/u/notes/long.md",
          name: "long.md",
          text: "正文".repeat(10),
          offset: 0,
          totalChars: 9000,
          hasMore: true,
        }}
        listing={null}
        error={null}
      />,
    );
    expect(screen.getByText("long.md")).toBeTruthy();
    expect(screen.getByText(/全文 9000 字/)).toBeTruthy();
  });

  it("listing 态:目录清单 + 超 50 项截断提示", () => {
    render(
      <ChatLocalReadCard
        needApproval={null}
        file={null}
        listing={{
          path: "/Users/u/notes",
          entries: [
            { name: "a.md", kind: "file", size: 12 },
            { name: "sub", kind: "dir", size: null },
          ],
          total: 2,
        }}
        error={null}
      />,
    );
    expect(screen.getByText(/a\.md/)).toBeTruthy();
    expect(screen.getByText(/本机目录 · 2 项/)).toBeTruthy();
  });

  it("error 态(denylist 硬拒等):诚实渲原因", () => {
    render(
      <ChatLocalReadCard
        needApproval={null}
        file={null}
        listing={null}
        error="「.env」环境变量文件通常含密钥/凭据,无论是否授权都不读取。"
      />,
    );
    expect(screen.getByText(/无论是否授权都不读取/)).toBeTruthy();
  });
});
