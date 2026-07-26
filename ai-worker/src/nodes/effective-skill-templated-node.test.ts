import type { LanguageModelV4GenerateResult } from "@ai-sdk/provider";
import { MockLanguageModelV4 } from "ai/test";
import { describe, expect, it } from "vitest";
import {
  runWithEffectiveSkillSnapshot,
  type EffectiveSkillSnapshotV1,
} from "../index";
import type { PromptTemplate } from "../prompt/template";
import { runTemplatedNode } from "./templated-node";

const forgedTemplate: PromptTemplate = {
  id: "test.templated-effective",
  version: "forged",
  system: "forged-system",
  template: "{{wrong}}",
  requiredFacets: ["wrong"],
};

function textResult(text: string): LanguageModelV4GenerateResult {
  return {
    content: [{ type: "text", text }],
    finishReason: { unified: "stop", raw: undefined },
    usage: {
      inputTokens: {
        total: 1,
        noCache: 1,
        cacheRead: undefined,
        cacheWrite: undefined,
      },
      outputTokens: { total: 1, text: 1, reasoning: undefined },
    },
    warnings: [],
  };
}

describe("[T-513] templated node 强制消费 active effective Skill", () => {
  it("method/template/required facets 来自当前账号 snapshot", async () => {
    const model = new MockLanguageModelV4({
      doGenerate: async () => textResult("来自账号 A"),
    });
    const snapshot: EffectiveSkillSnapshotV1 = {
      snapshotVersion: 1,
      userId: "user-1",
      accountId: "acct-A",
      resolvedAt: "2026-07-24T00:00:00.000Z",
      platformPolicyVersion: "policy-v1",
      platformPolicy: "immutable",
      skills: [
        {
          skillId: "test.templated-effective",
          baseVersion: "v1",
          overlayRevision: 1,
          overlayVersion: "overlay-A",
          effective: {
            methodSystem: "effective-system",
            template: "账号输入：{{right}}",
            tools: [],
            requiredFacets: ["right"],
            contextRequirements: [],
            outputSchema: null,
            completionPolicy: null,
            completionPolicyAdapter: null,
          },
        },
      ],
    };

    const result = await runWithEffectiveSkillSnapshot(snapshot, () =>
      runTemplatedNode({
        model,
        template: forgedTemplate,
        facets: { right: "A 的增量" },
      }),
    );

    expect(result.text).toBe("来自账号 A");
    expect(model.doGenerateCalls).toHaveLength(1);
  });
});
