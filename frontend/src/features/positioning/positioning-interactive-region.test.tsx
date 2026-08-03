import * as React from "react";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Positioning island wiring test (Task 6.4). Proves the needs-backend forms call
// their mapped contract op then router.refresh() (the island → client.* →
// router.refresh seam, mirroring settings/project-overview). Deterministic — the
// mock client resolves immediately, no network/clock.

const mockRouter = { refresh: vi.fn(), push: vi.fn(), replace: vi.fn() };
vi.mock("next/navigation", () => ({ useRouter: () => mockRouter }));

const mockClient = {
  upsertProfile: vi.fn((input: unknown): Promise<unknown> => Promise.resolve(input)),
  createStatement: vi.fn((input: unknown): Promise<unknown> => Promise.resolve(input)),
  resetPositioningMaster: vi.fn(
    (input: unknown): Promise<unknown> => Promise.resolve(input),
  ),
  restorePositioningMaster: vi.fn(
    (input: unknown): Promise<unknown> => Promise.resolve(input),
  ),
};
vi.mock("@/lib/contract-client", () => ({
  client: {
    upsertProfile: (input: unknown) => mockClient.upsertProfile(input),
    createStatement: (input: unknown) => mockClient.createStatement(input),
    resetPositioningMaster: (input: unknown) =>
      mockClient.resetPositioningMaster(input),
    restorePositioningMaster: (input: unknown) =>
      mockClient.restorePositioningMaster(input),
  },
}));

import {
  PositioningDraftDrawer,
  PositioningProfileForm,
  ResetPositioningMasterButton,
  RestorePositioningMasterButton,
  PositioningStatementForm,
} from "./positioning-interactive-region";

beforeEach(() => {
  mockRouter.refresh.mockClear();
  mockRouter.push.mockClear();
  mockClient.upsertProfile.mockClear();
  mockClient.createStatement.mockClear();
  mockClient.resetPositioningMaster.mockClear();
  mockClient.restorePositioningMaster.mockClear();
});
afterEach(cleanup);

describe("PositioningProfileForm", () => {
  it("calls client.upsertProfile with the parsed body then router.refresh", async () => {
    render(<PositioningProfileForm profile={null} ctaLabel="创建定位" />);
    fireEvent.change(screen.getByLabelText("人设"), {
      target: { value: "硬核科普" },
    });
    fireEvent.change(screen.getByLabelText("能力清单"), {
      target: { value: "拆解、演示" },
    });
    fireEvent.click(screen.getByRole("button", { name: "创建定位" }));
    await waitFor(() => expect(mockClient.upsertProfile).toHaveBeenCalledTimes(1));
    const arg = mockClient.upsertProfile.mock.calls[0]![0] as {
      body: { persona: string; capabilities: string[] };
    };
    expect(arg.body.persona).toBe("硬核科普");
    expect(arg.body.capabilities).toEqual(["拆解", "演示"]);
    await waitFor(() => expect(mockRouter.refresh).toHaveBeenCalledTimes(1));
  });
});

describe("PositioningStatementForm", () => {
  it("requires exactly 3 keywords + a one-liner before enabling submit", () => {
    render(<PositioningStatementForm />);
    const submit = screen.getByRole("button", { name: "保存新版本定位" });
    expect(submit).toBeDisabled();
  });

  it("calls client.createStatement with 3 keywords then router.refresh (append-only)", async () => {
    render(<PositioningStatementForm />);
    fireEvent.change(screen.getByLabelText("一句话定位"), {
      target: { value: "把论文变代码" },
    });
    fireEvent.change(screen.getByLabelText("关键词 1"), {
      target: { value: "论文" },
    });
    fireEvent.change(screen.getByLabelText("关键词 2"), {
      target: { value: "代码" },
    });
    fireEvent.change(screen.getByLabelText("关键词 3"), {
      target: { value: "工程化" },
    });
    const submit = screen.getByRole("button", { name: "保存新版本定位" });
    expect(submit).not.toBeDisabled();
    fireEvent.click(submit);
    await waitFor(() =>
      expect(mockClient.createStatement).toHaveBeenCalledTimes(1),
    );
    const arg = mockClient.createStatement.mock.calls[0]![0] as {
      body: { oneLiner: string; keywords: string[] };
    };
    expect(arg.body.keywords).toEqual(["论文", "代码", "工程化"]);
    expect(arg.body.oneLiner).toBe("把论文变代码");
    await waitFor(() => expect(mockRouter.refresh).toHaveBeenCalledTimes(1));
  });

  it("pre-fills the statement form from a 复制为草稿 seed", () => {
    render(
      <PositioningStatementForm
        seed={{
          oneLiner: "把论文变代码",
          keywords: ["论文", "代码", "工程化"],
          productAnchorIds: ["product-1"],
        }}
      />,
    );
    expect((screen.getByLabelText("一句话定位") as HTMLTextAreaElement).value).toBe(
      "把论文变代码",
    );
    expect((screen.getByLabelText("关键词 1") as HTMLInputElement).value).toBe(
      "论文",
    );
    expect((screen.getByLabelText("产品锚") as HTMLInputElement).value).toBe(
      "product-1",
    );
    // already valid → submit enabled with no further typing.
    expect(
      screen.getByRole("button", { name: "保存新版本定位" }),
    ).not.toBeDisabled();
  });
});

describe("PositioningDraftDrawer", () => {
  const PROFILE = {
    id: "profile-1",
    userId: "user-a",
    persona: "硬核科普",
    field: "AI 工程",
    audience: "开发者",
    differentiation: "论文到代码",
    capabilities: ["拆解", "演示"],
    facets: {
      contentScope: "",
      avoid: "",
      corePain: "",
      coreValue: "",
      tone: "",
      statusNote: "",
    },
    downstreamRules: {
      topicRule: "",
      scriptRule: "",
      projectRule: "",
      forbidRule: "",
      expressionRule: "",
    },
    createdAt: "2026-06-21T00:00:00.000Z",
    updatedAt: "2026-06-21T00:00:00.000Z",
  };

  it("opens a CENTERED dialog with 3 tabs that house BOTH real forms (账号画像 + 定位陈述)", () => {
    render(
      <PositioningDraftDrawer
        profile={PROFILE}
        triggerLabel="新建定位版本"
        title="新建定位版本"
        description="更新账号画像，或追加一条新的不可变定位陈述。"
      />,
    );
    // dialog body is mounted only on open.
    expect(screen.queryByTestId("positioning-profile-form")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: /新建定位版本/ }));
    // dialog (not a side sheet) is open.
    expect(screen.getByTestId("positioning-draft-dialog")).toBeTruthy();
    // default tab = 账号画像 → the profile form is mounted + pre-filled.
    expect(screen.getByTestId("positioning-profile-form")).toBeTruthy();
    expect((screen.getByLabelText("人设") as HTMLInputElement).value).toBe(
      "硬核科普",
    );
    // sticky footer 取消 + 保存 are present.
    expect(screen.getByTestId("positioning-draft-cancel")).toBeTruthy();
    expect(screen.getByTestId("positioning-draft-save")).toBeTruthy();
    // switching to the 定位陈述 tab mounts the statement form.
    fireEvent.click(screen.getByRole("tab", { name: /定位陈述/ }));
    expect(screen.getByTestId("positioning-statement-form")).toBeTruthy();
    expect(screen.getByLabelText("一句话定位")).toBeTruthy();
  });

  it("规则入口打开时直达定位规则，而不是让用户再猜第三个 tab", () => {
    render(
      <PositioningDraftDrawer
        profile={PROFILE}
        triggerLabel="编辑定位规则"
        title="编辑定位规则"
        description="修改后续 AI 必须遵守的规则。"
        initialTab="rules"
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "编辑定位规则" }));
    expect(screen.getByRole("tab", { name: /定位规则/ })).toHaveAttribute(
      "aria-selected",
      "true",
    );
    expect(screen.getByLabelText("选题规则")).toBeVisible();
  });

  it("编辑时点击弹窗外部不会直接退出，只有显式取消才关闭", () => {
    render(
      <PositioningDraftDrawer
        profile={PROFILE}
        triggerLabel="编辑定位规则"
        title="编辑定位规则"
        description="修改规则。"
        initialTab="rules"
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "编辑定位规则" }));
    fireEvent.change(screen.getByLabelText("选题规则"), {
      target: { value: "正在编辑的新规则" },
    });

    fireEvent.pointerDown(document.body);
    expect(screen.getByTestId("positioning-draft-dialog")).toBeVisible();
    expect(
      (screen.getByLabelText("选题规则") as HTMLTextAreaElement).value,
    ).toBe("正在编辑的新规则");

    fireEvent.click(screen.getByTestId("positioning-draft-cancel"));
    expect(screen.queryByTestId("positioning-draft-dialog")).toBeNull();
  });

  it("先后保存画像与规则时，不用隐藏表单的旧快照覆盖刚保存的数据", async () => {
    render(
      <PositioningDraftDrawer
        profile={PROFILE}
        triggerLabel="编辑定位"
        title="编辑定位"
        description="修改画像或规则。"
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "编辑定位" }));
    fireEvent.change(screen.getByLabelText("人设"), {
      target: { value: "刚保存的新画像" },
    });
    fireEvent.click(screen.getByTestId("positioning-draft-save"));
    await waitFor(() => expect(mockClient.upsertProfile).toHaveBeenCalledTimes(1));
    await waitFor(() =>
      expect(screen.queryByTestId("positioning-draft-dialog")).toBeNull(),
    );

    fireEvent.click(screen.getByRole("button", { name: "编辑定位" }));
    const rulesTab = screen.getByRole("tab", { name: /定位规则/ });
    fireEvent.mouseDown(rulesTab);
    fireEvent.click(rulesTab);
    await waitFor(() =>
      expect(screen.getByTestId("positioning-draft-save")).toHaveAttribute(
        "form",
        "positioning-form-rules",
      ),
    );
    fireEvent.change(screen.getByLabelText("选题规则"), {
      target: { value: "刚保存的新规则" },
    });
    expect(
      (screen.getByLabelText("选题规则") as HTMLTextAreaElement).value,
    ).toBe("刚保存的新规则");
    fireEvent.click(screen.getByTestId("positioning-draft-save"));
    await waitFor(() => expect(mockClient.upsertProfile).toHaveBeenCalledTimes(2));

    const secondBody = (
      mockClient.upsertProfile.mock.calls[1]![0] as {
        body: {
          persona: string;
          downstreamRules: { topicRule: string };
        };
      }
    ).body;
    expect(secondBody.persona).toBe("刚保存的新画像");
    expect(secondBody.downstreamRules.topicRule).toBe("刚保存的新规则");

    await waitFor(() =>
      expect(screen.queryByTestId("positioning-draft-dialog")).toBeNull(),
    );
    fireEvent.click(screen.getByRole("button", { name: "编辑定位" }));
    fireEvent.change(screen.getByLabelText("领域"), {
      target: { value: "刚保存的新领域" },
    });
    fireEvent.click(screen.getByTestId("positioning-draft-save"));
    await waitFor(() => expect(mockClient.upsertProfile).toHaveBeenCalledTimes(3));
    const thirdBody = (
      mockClient.upsertProfile.mock.calls[2]![0] as {
        body: {
          field: string;
          downstreamRules: { topicRule: string };
        };
      }
    ).body;
    expect(thirdBody.field).toBe("刚保存的新领域");
    expect(thirdBody.downstreamRules.topicRule).toBe("刚保存的新规则");
  });

  it("seeds the dialog's statement form when given a 复制为草稿 seed", () => {
    render(
      <PositioningDraftDrawer
        profile={PROFILE}
        triggerLabel="复制为草稿"
        triggerIcon="none"
        title="复制 v2 为草稿"
        description="基于该版本预填，编辑后保存为新版本。"
        initialTab="statement"
        statementSeed={{
          oneLiner: "v2 把论文变生产级代码",
          keywords: ["论文", "代码", "工程化"],
          productAnchorIds: [],
        }}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "复制为草稿" }));
    expect(screen.getByRole("tab", { name: /定位陈述/ })).toHaveAttribute(
      "aria-selected",
      "true",
    );
    expect(
      (screen.getByLabelText("一句话定位") as HTMLTextAreaElement).value,
    ).toBe("v2 把论文变生产级代码");
  });
});

describe("ResetPositioningMasterButton", () => {
  it("重新定位只跳到非破坏式前采，不再调用清空母版 operation", () => {
    render(<ResetPositioningMasterButton />);
    const link = screen.getByRole("link", { name: "重新定位" });
    expect(link).toHaveAttribute("href", "#positioning-discovery");
    fireEvent.click(link);
    expect(mockClient.resetPositioningMaster).not.toHaveBeenCalled();
  });
});

describe("RestorePositioningMasterButton", () => {
  it("确认后调用完整母版恢复并刷新，取消不写入", async () => {
    render(
      <RestorePositioningMasterButton
        statementId="posstmt-old"
        versionNumber={3}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "恢复此版本" }));
    expect(
      screen.getByRole("heading", { name: "恢复 v3 为当前母版？" }),
    ).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "取消" }));
    expect(mockClient.restorePositioningMaster).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: "恢复此版本" }));
    fireEvent.click(screen.getByRole("button", { name: "确认恢复" }));
    await waitFor(() =>
      expect(mockClient.restorePositioningMaster).toHaveBeenCalledWith({
        params: undefined,
        query: undefined,
        body: { statementId: "posstmt-old" },
      }),
    );
    expect(mockRouter.refresh).toHaveBeenCalledTimes(1);
  });
});
