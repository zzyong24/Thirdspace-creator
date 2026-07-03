import * as React from "react";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// [T-055c] 对话内 HOOK 候选卡:逐条「写入稿面」走 artifacts 版本门(append-only 物化),
// 撤销 = restoreArtifact 回滚到写入前版本。无项目上下文 → 禁用 + 显式提示(不静默)。

const getArtifact = vi.fn();
const listArtifactVersions = vi.fn();
const createArtifactVersion = vi.fn();
const restoreArtifact = vi.fn();
const listArtifacts = vi.fn();
const routerRefresh = vi.fn();

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: routerRefresh, push: vi.fn(), replace: vi.fn() }),
}));
vi.mock("@/lib/contract-client", () => ({
  client: {
    getArtifact: (...a: unknown[]) => getArtifact(...a),
    listArtifactVersions: (...a: unknown[]) => listArtifactVersions(...a),
    createArtifactVersion: (...a: unknown[]) => createArtifactVersion(...a),
    restoreArtifact: (...a: unknown[]) => restoreArtifact(...a),
    listArtifacts: (...a: unknown[]) => listArtifacts(...a),
    createArtifact: vi.fn(),
  },
}));

import { ChatHookCard, applyHookToSections } from "./chat-hook-card";

const ITEMS = [
  { text: "你们公司那堆文档,90% 没人看", angle: "反常识断言" },
  { text: "两小时,零基础做出能跑的小程序", angle: "利益承诺" },
];

afterEach(() => cleanup());
beforeEach(() => {
  vi.clearAllMocks();
  // 项目已有 output_script artifact(ensureScriptArtifact 走 list 命中路径)。
  listArtifacts.mockResolvedValue([
    { id: "art-1", artifactType: "output_script", stage: "script" },
  ]);
  getArtifact.mockResolvedValue({ id: "art-1", currentVersionId: "v-2" });
  listArtifactVersions.mockResolvedValue([
    {
      id: "v-2",
      versionNumber: 2,
      contentData: {
        sections: [
          { id: "s1", heading: "HOOK 开场", body: "旧 hook", role: "hook" },
          { id: "s2", heading: "正文", body: "价值段" },
        ],
      },
    },
    { id: "v-1", versionNumber: 1, contentData: { sections: [] } },
  ]);
  createArtifactVersion.mockResolvedValue({ id: "v-3" });
  restoreArtifact.mockResolvedValue({ id: "art-1" });
});

describe("applyHookToSections", () => {
  it("已有 hook 段 → 替换正文,其余段不动", () => {
    const next = applyHookToSections(
      [
        { id: "s1", heading: "HOOK 开场", body: "旧", role: "hook" },
        { id: "s2", heading: "正文", body: "价值段" },
      ],
      "新 hook",
    );
    expect(next[0]!.body).toBe("新 hook");
    expect(next[1]!.body).toBe("价值段");
    expect(next).toHaveLength(2);
  });

  it("没有 hook 段 → 置顶插入 role=hook 段", () => {
    const next = applyHookToSections([{ id: "s2", heading: "正文", body: "x" }], "开场白");
    expect(next[0]!.role).toBe("hook");
    expect(next[0]!.body).toBe("开场白");
    expect(next).toHaveLength(2);
  });
});

describe("ChatHookCard", () => {
  it("写入稿面 → 读当前版本、替换 hook 段、createArtifactVersion,出「已写入 · 撤销」系统行", async () => {
    const user = userEvent.setup();
    render(<ChatHookCard items={ITEMS} projectId="proj-1" />);

    await user.click(screen.getAllByText("写入稿面")[0]!);

    await waitFor(() => {
      expect(createArtifactVersion).toHaveBeenCalledTimes(1);
    });
    const call = createArtifactVersion.mock.calls[0]![0] as {
      params: { artifactId: string };
      body: { contentData: { sections: Array<{ body?: string; role?: string }> } };
    };
    expect(call.params.artifactId).toBe("art-1");
    // hook 段被替换为选中候选;正文段保留。
    const sections = call.body.contentData.sections;
    expect(sections[0]!.body).toBe(ITEMS[0]!.text);
    expect(sections[1]!.body).toBe("价值段");
    // 系统行 + refresh(稿面读侧重取)。
    expect(await screen.findByText(/已写入稿面\(新版本已保存\)/)).toBeTruthy();
    expect(screen.getByText("撤销")).toBeTruthy();
    expect(routerRefresh).toHaveBeenCalled();
  });

  it("撤销 → restoreArtifact 回滚到写入前版本(v-2)", async () => {
    const user = userEvent.setup();
    render(<ChatHookCard items={ITEMS} projectId="proj-1" />);
    await user.click(screen.getAllByText("写入稿面")[0]!);
    await screen.findByText("撤销");

    await user.click(screen.getByText("撤销"));

    await waitFor(() => {
      expect(restoreArtifact).toHaveBeenCalledWith(
        expect.objectContaining({
          params: { artifactId: "art-1" },
          body: { versionId: "v-2" },
        }),
      );
    });
    expect(await screen.findByText(/已撤销/)).toBeTruthy();
  });

  it("无项目上下文 → 按钮禁用 + 显式「未关联项目」提示(不静默)", () => {
    render(<ChatHookCard items={ITEMS} projectId={null} />);
    const btns = screen.getAllByText("写入稿面");
    for (const b of btns) {
      expect((b as HTMLButtonElement).disabled).toBe(true);
    }
    expect(screen.getByText(/未关联项目/)).toBeTruthy();
  });

  it("空候选 → 诚实空态(不摆假卡)", () => {
    render(<ChatHookCard items={[]} projectId="proj-1" />);
    expect(screen.getByText(/没生成出可用的 hook/)).toBeTruthy();
  });
});
