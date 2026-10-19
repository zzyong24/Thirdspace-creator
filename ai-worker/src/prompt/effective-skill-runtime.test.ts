import { asSchema } from "ai";
import { describe, expect, it } from "vitest";
import { z } from "zod";
import type { PromptTemplate } from "./template";
import {
  _resetRegistry,
  getOfficialSkillBase,
  listOfficialSkillBases,
  registerTemplate,
} from "./registry";
import {
  CompletionPolicyRuntimeError,
  enforceCompletionPolicy,
  listOfficialCompletionPolicyAdapters,
  registerOfficialCompletionPolicyAdapter,
  validateCompletionPolicy,
} from "./completion-policy";
import {
  EffectiveSkillRuntimeError,
  getActiveEffectiveSkillSnapshot,
  getEffectiveContextRequirements,
  getEffectiveSkill,
  getEffectiveTemplate,
  getEffectiveTools,
  resolveEffectiveOutputSchema,
  runWithEffectiveSkillSnapshot,
  type CompletionPolicyV1,
  type EffectiveSkillSnapshotV1,
} from "./effective-skill-runtime";
import { USER_FACING_RESPONSE_POLICY } from "./user-facing-response-policy";

const policy = {
  schemaVersion: 1 as const,
  minSegments: 3,
  maxSegments: 4,
  requiredSequence: ["intro", "body", "end"],
  repairAttempts: 1,
};

function snapshot(
  accountId: string,
  marker: string,
): EffectiveSkillSnapshotV1 {
  return {
    snapshotVersion: 1,
    userId: "user-1",
    accountId,
    resolvedAt: "2026-07-24T00:00:00.000Z",
    platformPolicyVersion: "policy-v1",
    platformPolicy: `immutable:${marker}`,
    skills: [
      {
        skillId: "script.draft",
        baseVersion: "v5",
        overlayRevision: marker === "A" ? 3 : 7,
        overlayVersion: marker,
        effective: {
          methodSystem: `method-${marker}`,
          template: `{{positioning}}-${marker}`,
          tools: [`tool-${marker}`],
          requiredFacets: [`required_${marker}`],
          contextRequirements: [`context_${marker}`],
          outputSchema: {
            type: "object",
            properties: {
              marker: { const: marker },
              segments: { type: "array" },
            },
            required: ["marker", "segments"],
            additionalProperties: false,
          },
          completionPolicy: policy,
          completionPolicyAdapter: {
            id: "test.segment-list",
            version: "1",
          },
        },
      },
    ],
  };
}

describe("[T-513] effective Skill snapshot server runtime", () => {
  it("无 active snapshot 时 runtime API fail-closed", () => {
    expect(() => getEffectiveSkill("script.draft")).toThrowError(
      expect.objectContaining<Partial<EffectiveSkillRuntimeError>>({
        code: "SKILL_SNAPSHOT_MISSING",
      }),
    );
    expect(() => getEffectiveTemplate("script.draft")).toThrowError(
      /SKILL_SNAPSHOT_MISSING/,
    );
  });

  it("100 个双账号异步交错始终读取自己的 frozen snapshot，六类来源不串", async () => {
    const results = await Promise.all(
      Array.from({ length: 100 }, async (_, index) => {
        const marker = index % 2 === 0 ? "A" : "B";
        const accountId = `acct-${marker}`;
        return runWithEffectiveSkillSnapshot(
          snapshot(accountId, marker),
          async () => {
            await Promise.resolve();
            await new Promise((resolve) =>
              setTimeout(resolve, index % 3),
            );
            const active = getActiveEffectiveSkillSnapshot();
            const skill = getEffectiveSkill("script.draft");
            const template = getEffectiveTemplate("script.draft");
            const validator = asSchema(
              resolveEffectiveOutputSchema("script.draft"),
            );
            const schemaResult = await validator.validate?.({
              marker,
              segments: [],
            });
            return {
              marker,
              accountId: active.accountId,
              platformPolicy: active.platformPolicy,
              frozen:
                Object.isFrozen(active) &&
                Object.isFrozen(active.skills) &&
                Object.isFrozen(skill.effective.tools),
              method: template.system,
              template: template.template,
              tools: getEffectiveTools("script.draft"),
              required: template.requiredFacets,
              context: getEffectiveContextRequirements("script.draft"),
              policy: skill.effective.completionPolicy,
              schemaValid: schemaResult?.success,
            };
          },
        );
      }),
    );

    expect(results).toHaveLength(100);
    for (const result of results) {
      expect(result).toEqual({
        marker: result.marker,
        accountId: `acct-${result.marker}`,
        platformPolicy: `immutable:${result.marker}`,
        frozen: true,
        method: `method-${result.marker}\n\n${USER_FACING_RESPONSE_POLICY}`,
        template: `{{positioning}}-${result.marker}`,
        tools: [`tool-${result.marker}`],
        required: [`required_${result.marker}`],
        context: [`context_${result.marker}`],
        policy,
        schemaValid: true,
      });
    }
  });

  it("进入 scope 时深拷贝并冻结；调用方随后改原对象不影响在途读取", async () => {
    const source = snapshot("acct-A", "A");
    await runWithEffectiveSkillSnapshot(source, async () => {
      source.accountId = "acct-B";
      source.skills[0]!.effective.tools[0] = "tool-B";
      await Promise.resolve();
      expect(getActiveEffectiveSkillSnapshot().accountId).toBe("acct-A");
      expect(getEffectiveTools("script.draft")).toEqual(["tool-A"]);
    });
  });
});

describe("[T-513] CompletionPolicyV1 通用校验与 official adapter", () => {
  it("段数 + role 标准化/相邻去重后必须与 requiredSequence 完整相等", () => {
    expect(
      validateCompletionPolicy(policy, [
        { role: " Intro " },
        { role: "body" },
        { role: "BODY" },
        { role: "end" },
      ]),
    ).toEqual({ valid: true, errors: [] });

    const extra = validateCompletionPolicy(policy, [
      { role: "intro" },
      { role: "aside" },
      { role: "body" },
      { role: "end" },
    ]);
    expect(extra.valid).toBe(false);
    expect(extra.errors.map((error) => error.code)).toContain(
      "REQUIRED_SEQUENCE_MISMATCH",
    );
    expect(
      validateCompletionPolicy(policy, [{ role: "intro" }]).errors.map(
        (error) => error.code,
      ),
    ).toContain("MIN_SEGMENTS");
  });

  it("对持久化脏数据返回结构化错误而非原生异常", () => {
    const malformed = {
      schemaVersion: 1,
      minSegments: 1,
      maxSegments: null,
      requiredSequence: [42],
      repairAttempts: 0,
    } as unknown as CompletionPolicyV1;

    const malformedSegments = [null] as unknown as Array<{
      role?: string | null;
    }>;
    expect(() =>
      validateCompletionPolicy(malformed, malformedSegments),
    ).not.toThrow();
    expect(validateCompletionPolicy(malformed, malformedSegments).errors).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: "POLICY_INVALID",
          path: "requiredSequence.0",
        }),
        expect.objectContaining({
          code: "ROLE_INVALID",
          path: "segments.0.role",
        }),
      ]),
    );
  });

  it("adapter registry 以 id+version append-only；运行校验只取 snapshot 指定版本", async () => {
    registerOfficialCompletionPolicyAdapter({
      id: "test.segment-list",
      version: "1",
      supportsSchema: (schema) =>
        typeof schema === "object" && schema !== null && "properties" in schema,
      toSegments: (value) =>
        (value as { segments: Array<{ role?: string }> }).segments,
    });
    expect(
      listOfficialCompletionPolicyAdapters().filter(
        (adapter) => adapter.id === "test.segment-list",
      ),
    ).toEqual([{ id: "test.segment-list", version: "1" }]);
    expect(() =>
      registerOfficialCompletionPolicyAdapter({
        id: "test.segment-list",
        version: "1",
        supportsSchema: () => true,
        toSegments: () => [],
      }),
    ).toThrow(/append-only/);

    await runWithEffectiveSkillSnapshot(snapshot("acct-A", "A"), async () => {
      expect(() =>
        enforceCompletionPolicy("script.draft", {
          marker: "A",
          segments: [
            { role: "intro" },
            { role: "body" },
            { role: "end" },
          ],
        }),
      ).not.toThrow();
      expect(() =>
        enforceCompletionPolicy("script.draft", {
          marker: "A",
          segments: [{ role: "intro" }],
        }),
      ).toThrowError(
        expect.objectContaining<Partial<CompletionPolicyRuntimeError>>({
          code: "COMPLETION_POLICY_VIOLATION",
        }),
      );
    });

    const missingAdapter = snapshot("acct-A", "A");
    missingAdapter.skills[0]!.effective.completionPolicyAdapter = {
      id: "missing.adapter",
      version: "1",
    };
    await runWithEffectiveSkillSnapshot(missingAdapter, async () => {
      expect(() =>
        enforceCompletionPolicy("script.draft", {
          segments: [
            { role: "intro" },
            { role: "body" },
            { role: "end" },
          ],
        }),
      ).toThrowError(
        expect.objectContaining<Partial<CompletionPolicyRuntimeError>>({
          code: "COMPLETION_POLICY_UNSUPPORTED",
        }),
      );
    });
  });
});

describe("[T-513] official management API", () => {
  it("无需 runtime scope 即返回只读 official base、真实 availableFacets 与 schema", () => {
    _resetRegistry();
    const official: PromptTemplate = {
      id: "official.demo",
      version: "v9",
      system: "official-method",
      template: "{{required}}\n{{optional}}",
      requiredFacets: ["required"],
      contextRequirements: ["positioning"],
      tools: ["read"],
      outputSchema: z.object({ ok: z.boolean() }),
    };
    registerTemplate(official);

    const base = getOfficialSkillBase("official.demo");
    expect(base).toMatchObject({
      skillId: "official.demo",
      baseVersion: "v9",
      methodSystem: "official-method",
      tools: ["read"],
      requiredFacets: ["required"],
      contextRequirements: ["positioning"],
      availableFacets: ["optional", "required"],
    });
    expect(base?.outputSchema).toMatchObject({ type: "object" });
    expect(Object.isFrozen(base)).toBe(true);
    expect(Object.isFrozen(base?.outputSchema)).toBe(true);
    expect(listOfficialSkillBases().map((skill) => skill.skillId)).toEqual([
      "official.demo",
    ]);
  });
});
