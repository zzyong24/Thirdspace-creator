import { describe, expect, it } from "vitest";

import { createAiTaskAttemptId } from "./ai-task-attempt";

const UUID_V4 =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

describe("createAiTaskAttemptId (T-513)", () => {
  it("每个动作生成独立 UUID", () => {
    const first = createAiTaskAttemptId();
    const second = createAiTaskAttemptId();

    expect(first).toMatch(UUID_V4);
    expect(second).toMatch(UUID_V4);
    expect(second).not.toBe(first);
  });
});
