import * as React from "react";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Topics (选题候选池) island wiring test (Task 6/8). Proves the needs-backend controls
// each issue their mapped contract op then the right navigation (promote → push to
// the new /projects/:id; drop/create/link → router.refresh()), and that the pure
// render + selectors are deterministic (no Date.now / Math.random / fetch). The mock
// client resolves immediately — no network/clock.

const mockRouter = { refresh: vi.fn(), push: vi.fn(), replace: vi.fn() };
vi.mock("next/navigation", () => ({ useRouter: () => mockRouter }));

const mockClient = {
  createCandidate: vi.fn((i: unknown): Promise<unknown> => Promise.resolve(i)),
  promoteCandidate: vi.fn(
    (_i: unknown): Promise<unknown> =>
      Promise.resolve({ projectId: "proj-99" }),
  ),
  patchCandidate: vi.fn((i: unknown): Promise<unknown> => Promise.resolve(i)),
  linkSignalToCandidate: vi.fn(
    (i: unknown): Promise<unknown> => Promise.resolve(i),
  ),
};
vi.mock("@/lib/contract-client", () => ({
  client: {
    createCandidate: (i: unknown) => mockClient.createCandidate(i),
    promoteCandidate: (i: unknown) => mockClient.promoteCandidate(i),
    patchCandidate: (i: unknown) => mockClient.patchCandidate(i),
    linkSignalToCandidate: (i: unknown) => mockClient.linkSignalToCandidate(i),
  },
}));

import {
  CreateCandidateForm,
  CandidateCard,
  CandidateSortControl,
} from "./topics-interactive-region";
import { LinkSignalButton } from "./audience-questions-interactive-region";
import { TopicsView } from "./topics-page";
import type {
  CandidateResource,
  AudienceSignalResource,
} from "@/server/modules/candidate";

const ISO = "2026-06-21T00:00:00.000Z";

function candidate(over: Partial<CandidateResource> = {}): CandidateResource {
  return {
    id: "cand-1",
    userId: "user-a",
    title: "选题标题",
    angle: "切入角度",
    source: "idea",
    contentRole: null,
    productAnchorId: null,
    positioningFit: 80,
    predictedScore: 70,
    demandCount: 2,
    status: "pool",
    aiTaskId: null,
    createdAt: ISO,
    updatedAt: ISO,
    ...over,
  };
}

function signal(over: Partial<AudienceSignalResource> = {}): AudienceSignalResource {
  return {
    id: "sig-1",
    userId: "user-a",
    source: "comment",
    rawText: "怎么入门？",
    demandTag: "入门",
    payingIntent: null,
    linkedCandidateId: null,
    ingestionRunId: "run-1",
    createdAt: ISO,
    ...over,
  };
}

beforeEach(() => {
  mockRouter.refresh.mockClear();
  mockRouter.push.mockClear();
  for (const fn of Object.values(mockClient)) fn.mockClear();
});
afterEach(() => cleanup());

describe("topics view (pure render, deterministic)", () => {
  it("renders the candidate pool sorted-as-given and surfaces the three scores", () => {
    render(
      <TopicsView
        viewModel={{
          candidates: [candidate(), candidate({ id: "cand-2", title: "另一个" })],
          signals: [signal()],
          sort: "predictedScore",
        }}
      />,
    );
    const pool = screen.getByTestId("candidate-pool");
    expect(pool).toHaveAttribute("data-sort", "predictedScore");
    expect(screen.getAllByTestId("candidate-card")).toHaveLength(2);
    expect(screen.getAllByText("需求热度 2")).toHaveLength(2);
  });

  it("hides dropped candidates from the pool board", () => {
    render(
      <TopicsView
        viewModel={{
          candidates: [
            candidate({ id: "cand-1", status: "pool" }),
            candidate({ id: "cand-2", status: "dropped", title: "已丢" }),
          ],
          signals: [],
          sort: "predictedScore",
        }}
      />,
    );
    expect(screen.getAllByTestId("candidate-card")).toHaveLength(1);
  });

  it("renders the audience-signal empty state when there are no signals", () => {
    render(
      <TopicsView
        viewModel={{ candidates: [], signals: [], sort: "predictedScore" }}
      />,
    );
    expect(
      screen.getByTestId("audience-signal-empty-state"),
    ).toBeInTheDocument();
  });
});

describe("topics islands (needs-backend wiring)", () => {
  it("新增候选 → client.createCandidate(source:'idea') then router.refresh", async () => {
    render(<CreateCandidateForm />);
    fireEvent.change(screen.getByLabelText("选题标题"), {
      target: { value: "新选题" },
    });
    fireEvent.submit(screen.getByTestId("create-candidate-form"));
    await waitFor(() =>
      expect(mockClient.createCandidate).toHaveBeenCalledTimes(1),
    );
    const arg = mockClient.createCandidate.mock.calls[0]![0] as {
      body: { source: string; title: string };
    };
    expect(arg.body).toMatchObject({ source: "idea", title: "新选题" });
    expect(mockRouter.refresh).toHaveBeenCalled();
  });

  it("晋升为 Project → client.promoteCandidate then push to the new /projects/:id", async () => {
    render(<CandidateCard candidate={candidate()} sourceLabel="灵感" />);
    fireEvent.click(screen.getByText("晋升为 Project"));
    await waitFor(() =>
      expect(mockClient.promoteCandidate).toHaveBeenCalledTimes(1),
    );
    expect(mockRouter.push).toHaveBeenCalledWith("/projects/proj-99");
  });

  it("丢弃 → client.patchCandidate{status:'dropped'} then router.refresh", async () => {
    render(<CandidateCard candidate={candidate()} sourceLabel="灵感" />);
    fireEvent.click(screen.getByText("丢弃"));
    await waitFor(() =>
      expect(mockClient.patchCandidate).toHaveBeenCalledTimes(1),
    );
    const arg = mockClient.patchCandidate.mock.calls[0]![0] as {
      body: { status: string };
    };
    expect(arg.body.status).toBe("dropped");
    expect(mockRouter.refresh).toHaveBeenCalled();
  });

  it("排序控制 → navigates /topics?sort=<key> (re-issues the sorted list)", () => {
    render(<CandidateSortControl sort="predictedScore" />);
    fireEvent.change(screen.getByTestId("candidate-sort-control"), {
      target: { value: "demandCount" },
    });
    expect(mockRouter.push).toHaveBeenCalledWith("/topics?sort=demandCount");
  });

  it("一键转 Candidate → client.linkSignalToCandidate (omit candidateId) then refresh", async () => {
    render(<LinkSignalButton signalId="sig-7" />);
    fireEvent.click(screen.getByTestId("link-signal-button"));
    await waitFor(() =>
      expect(mockClient.linkSignalToCandidate).toHaveBeenCalledTimes(1),
    );
    const arg = mockClient.linkSignalToCandidate.mock.calls[0]![0] as {
      params: { signalId: string };
      body: Record<string, unknown>;
    };
    expect(arg.params.signalId).toBe("sig-7");
    expect(arg.body).toEqual({});
    expect(mockRouter.refresh).toHaveBeenCalled();
  });

  it("promote button is disabled for an already-promoted candidate", () => {
    render(
      <CandidateCard
        candidate={candidate({ status: "promoted" })}
        sourceLabel="灵感"
      />,
    );
    const card = screen.getByTestId("candidate-card");
    const promote = within(card).getByText("晋升为 Project");
    expect(promote).toBeDisabled();
  });
});
