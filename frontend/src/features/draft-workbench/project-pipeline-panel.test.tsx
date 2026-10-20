import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, fireEvent, cleanup } from "@testing-library/react";

const openChat = vi.fn();
vi.mock("./draft-chat-request", () => ({ useDraftChatRequest: () => ({ openChat }) }));
vi.mock("./transcribe-now-button", () => ({ TranscribeNowButton: () => <span data-slot="mock-transcribe-now" /> }));
vi.mock("next/link", () => ({ default: ({ href, children, ...p }: { href: string; children: React.ReactNode }) => <a href={href} {...p}>{children}</a> }));

import { ProjectPipelinePanel, transcriptStepState } from "./project-pipeline-panel";

const base = {
  projectId: "p-1", title: "选题A", origin: "topic" as const, sourceRefs: [],
  douyinExternalId: null, transcriptState: "none" as never, briefSettled: false, draftReady: false,
};

describe("ProjectPipelinePanel", () => {
  beforeEach(() => { openChat.mockReset(); sessionStorage.clear(); });
  afterEach(cleanup);

  it("transcriptStepState 映射真实状态", () => {
    expect(transcriptStepState("radar", false, "none" as never)).toBe("done");
    expect(transcriptStepState("topic", false, "none" as never)).toBe("skipped");
    expect(transcriptStepState("manual", true, "running" as never)).toBe("running");
    expect(transcriptStepState("manual", true, "failed" as never)).toBe("failed");
  });

  it("渲染三步并标注状态", () => {
    const { container } = render(<ProjectPipelinePanel {...base} briefSettled draftReady />);
    expect(container.querySelector('[data-slot="project-pipeline"]')).not.toBeNull();
    expect(container.querySelector('[data-step="brief"]')?.getAttribute("data-state")).toBe("done");
    expect(container.querySelector('[data-step="draft"]')?.getAttribute("data-state")).toBe("done");
    expect(container.querySelector('[data-step="transcript"]')?.getAttribute("data-state")).toBe("skipped");
  });

  it("from=topic 自动启动一次 brief.fill，刷新不重复", () => {
    const { unmount } = render(<ProjectPipelinePanel {...base} autoFillBrief />);
    expect(openChat).toHaveBeenCalledTimes(1);
    expect(openChat.mock.calls[0][0]).toMatchObject({ functionKey: "brief.fill", autoSend: true, selection: { kind: "project", id: "p-1" } });
    unmount();
    render(<ProjectPipelinePanel {...base} autoFillBrief />);
    expect(openChat).toHaveBeenCalledTimes(1);
  });

  it("选题卡已补全不自动启动；手动按钮可启动", () => {
    render(<ProjectPipelinePanel {...base} autoFillBrief briefSettled />);
    expect(openChat).not.toHaveBeenCalled();
    cleanup();
    const { container } = render(<ProjectPipelinePanel {...base} />);
    fireEvent.click(container.querySelector('[data-slot="pipeline-brief-fill"]')!);
    expect(openChat).toHaveBeenCalledTimes(1);
  });

  it("有抖音锚时转写步骤保留真实任务入口", () => {
    const { container } = render(<ProjectPipelinePanel {...base} origin="manual" douyinExternalId="d-1" transcriptState={"done" as never} />);
    expect(container.querySelector('[data-step="transcript"] [data-slot="mock-transcribe-now"]')).not.toBeNull();
    expect(container.querySelector('[data-step="transcript"]')?.getAttribute("data-state")).toBe("done");
  });
});
