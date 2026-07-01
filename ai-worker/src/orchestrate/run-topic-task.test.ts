import { describe, it, expect } from "vitest";
import { MockLanguageModelV4 } from "ai/test";
import type { LanguageModelV4GenerateResult } from "@ai-sdk/provider";
import { runTopicTask, type TopicTaskPorts } from "./run-topic-task";
import type { TopicItem } from "../nodes/topic-node";

function finalText(text: string): LanguageModelV4GenerateResult {
  return {
    content: [{ type: "text", text }],
    finishReason: { unified: "stop", raw: undefined },
    usage: {
      inputTokens: { total: 1, noCache: 1, cacheRead: undefined, cacheWrite: undefined },
      outputTokens: { total: 1, text: 1, reasoning: undefined },
    },
    warnings: [],
  };
}

function recordingPorts() {
  const calls: string[] = [];
  let candidate: TopicItem[] | null = null;
  let steps = 0;
  const ports: TopicTaskPorts = {
    async markRunning() {
      calls.push("markRunning");
    },
    async recordStep() {
      steps += 1;
      calls.push("recordStep");
    },
    async recordCandidate(_taskId, items) {
      candidate = items;
      calls.push("recordCandidate");
    },
    async cancelTask() {
      calls.push("cancelTask");
    },
  };
  return { ports, calls, get candidate() {
    return candidate;
  }, get steps() {
    return steps;
  } };
}

// T-025:topic.generate 改走 generateObject(顶层对象 { topics:[...] })。
const TOPICS = JSON.stringify({
  topics: [
    { title: "复现 MLA 把显存压 1/10", angle: "跑数", contentRole: "traffic", source: "trend", predictedScore: 88, reason: "省显存人人要" },
  ],
});

describe("runTopicTask", () => {
  it("成功:markRunning → 逐步 recordStep → recordCandidate(候选含选题)", async () => {
    const r = recordingPorts();
    const model = new MockLanguageModelV4({ doGenerate: async () => finalText(TOPICS) });
    await runTopicTask({
      taskId: "t1",
      model,
      positioningBrief: "AI 工程科普",
      basis: "trend",
      ports: r.ports,
    });
    expect(r.calls[0]).toBe("markRunning");
    expect(r.calls).toContain("recordStep");
    expect(r.calls).toContain("recordCandidate");
    expect(r.calls).not.toContain("cancelTask");
    expect(r.candidate?.[0]?.title).toContain("MLA");
    expect(r.steps).toBeGreaterThanOrEqual(1);
  });

  it("无可解析选题:cancelTask(不假成功,不 recordCandidate)", async () => {
    const r = recordingPorts();
    const model = new MockLanguageModelV4({ doGenerate: async () => finalText("无法完成") });
    await runTopicTask({
      taskId: "t2",
      model,
      positioningBrief: "x",
      basis: "positioning",
      ports: r.ports,
    });
    expect(r.calls).toContain("markRunning");
    expect(r.calls).toContain("cancelTask");
    expect(r.calls).not.toContain("recordCandidate");
  });
});
