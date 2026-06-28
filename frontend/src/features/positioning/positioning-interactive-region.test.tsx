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
};
vi.mock("@/lib/contract-client", () => ({
  client: {
    upsertProfile: (input: unknown) => mockClient.upsertProfile(input),
    createStatement: (input: unknown) => mockClient.createStatement(input),
  },
}));

import {
  PositioningDraftDrawer,
  PositioningProfileForm,
  PositioningStatementForm,
} from "./positioning-interactive-region";

beforeEach(() => {
  mockRouter.refresh.mockClear();
  mockClient.upsertProfile.mockClear();
  mockClient.createStatement.mockClear();
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

  it("opens a drawer that houses BOTH real forms (账号画像 + 新版本定位)", () => {
    render(
      <PositioningDraftDrawer
        profile={PROFILE}
        triggerLabel="新建定位版本"
        title="新建定位版本"
        description="更新账号画像，或追加一条新的不可变定位陈述。"
      />,
    );
    // drawer body is mounted only on open.
    expect(screen.queryByTestId("positioning-profile-form")).toBeNull();
    fireEvent.click(
      screen.getByRole("button", { name: /新建定位版本/ }),
    );
    expect(screen.getByTestId("positioning-profile-form")).toBeTruthy();
    expect(screen.getByTestId("positioning-statement-form")).toBeTruthy();
    // profile form pre-filled from the current profile.
    expect((screen.getByLabelText("人设") as HTMLInputElement).value).toBe(
      "硬核科普",
    );
  });

  it("seeds the drawer's statement form when given a 复制为草稿 seed", () => {
    render(
      <PositioningDraftDrawer
        profile={PROFILE}
        triggerLabel="复制为草稿"
        triggerIcon="none"
        title="复制 v2 为草稿"
        description="基于该版本预填，编辑后保存为新版本。"
        statementSeed={{
          oneLiner: "v2 把论文变生产级代码",
          keywords: ["论文", "代码", "工程化"],
          productAnchorIds: [],
        }}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "复制为草稿" }));
    expect(
      (screen.getByLabelText("一句话定位") as HTMLTextAreaElement).value,
    ).toBe("v2 把论文变生产级代码");
  });
});
