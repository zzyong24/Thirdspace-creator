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
});
