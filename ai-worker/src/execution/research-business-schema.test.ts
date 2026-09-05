import { it, expect } from "vitest";
import { resolveStructuredBusinessSchema } from "./structured-business-schema";
it("素材生成在Worker内拒绝空候选和清洗后全空的伪引用，保留合法创作候选", () => {
  const schema = resolveStructuredBusinessSchema({
    kind: "model.structured",
    operationKey: "research",
    capability: "research.gather",
    maxOutputTokens: 512,
    skillSnapshot: {
      snapshotVersion: 1,
      userId: "test",
      accountId: "test",
      resolvedAt: "2026-09-05T00:00:00Z",
      platformPolicyVersion: "1",
      platformPolicy: "只生成候选",
      skills: [],
    },
    skillId: "research.gather",
    facets: {
      __researchGather: JSON.stringify({
        topic: "真实选题",
        projectId: null,
        grounding: "model_memory",
      }),
    },
  });
  expect(schema).toBeDefined();
  expect(schema!.safeParse({}).success).toBe(false);
  expect(
    schema!.safeParse({
      cases: [{ title: "arxiv:2401.12345", source: "论文" }],
    }).success,
  ).toBe(false);
  expect(
    schema!.safeParse({ hooks: [{ text: "真实创作钩子", why: "开场" }] })
      .success,
  ).toBe(true);
});
