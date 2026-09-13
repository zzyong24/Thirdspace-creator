import { createChatSkillLibrary } from "./chat-skill-library";
import type { RequestContext } from "@creatoros/contract";
import { describe, expect, it, vi } from "vitest";
import {
  listOfficialSkillBases,
  type OfficialSkillBase,
} from "@creatoros/ai-worker";
import {
  CHAT_METHOD_SKILL_IDS,
  EffectiveSkillSnapshotError,
  REGISTERED_SKILL_TASK_TYPES,
  createEffectiveSkillSnapshotResolver,
  parseEffectiveSkillSnapshot,
  requiredSkillIdsForTask,
  serializeEffectiveSkillSnapshot,
  type AccountSkillOverlayReader,
  type AccountSkillOverlayRuntimeRow,
  type OfficialSkillProvider,
} from "./effective-skill-snapshot";

const ctx: RequestContext = {
  userId: "user-1",
  accountId: "acct-a",
  requestId: "req-1",
  source: "user",
};

function official(
  skillId: string,
  overrides: Partial<OfficialSkillBase> = {},
): OfficialSkillBase {
  return {
    skillId,
    baseVersion: "v5",
    methodSystem: `官方方法:${skillId}`,
    template: "{{positioning}}",
    tools: ["search.web", "asset.read"],
    requiredFacets: ["positioning"],
    contextRequirements: ["project.positioning"],
    availableFacets: ["positioning", "topic"],
    editableFields: [
      "system",
      "template",
      "tools",
      "requiredFacets",
      "outputSchema",
      "completionPolicy",
    ],
    outputSchema: {
      type: "object",
      properties: { text: { type: "string" } },
      required: ["text"],
    },
    completionPolicy: null,
    completionPolicyAdapter: {
      id: "official.segments",
      version: "1",
    },
    ...overrides,
  };
}

function row(
  skillId: string,
  overlay: Record<string, unknown>,
  overrides: Partial<AccountSkillOverlayRuntimeRow> = {},
): AccountSkillOverlayRuntimeRow {
  return {
    userId: "user-1",
    accountId: "acct-a",
    skillId,
    rowRevision: 7,
    observedBaseVersion: "v5",
    overlayVersion: "7",
    overlay,
    ...overrides,
  };
}

function deps(
  bases: readonly OfficialSkillBase[],
  rows: readonly AccountSkillOverlayRuntimeRow[] = [],
) {
  const byId = new Map(bases.map((base) => [base.skillId, base]));
  const officialSkills: OfficialSkillProvider = {
    get: vi.fn((id) => byId.get(id) ?? null),
    list: vi.fn(() => [...bases]),
    platformPolicy: vi.fn(() => ({
      version: "policy-v9",
      text: "CreatorOS server policy",
    })),
  };
  const accountOverlays: AccountSkillOverlayReader = {
    listBySkillIds: vi.fn(async () => [...rows]),
  };
  return {
    officialSkills,
    accountOverlays,
    now: () => "2026-07-24T12:00:00.000Z",
  };
}

describe("[T-513] requiredSkillIdsForTask 确定性注册表", () => {
  it("热点选题冻结出题与信源抽取两个Skill，普通出题保持单Skill",()=>{
    expect(requiredSkillIdsForTask("topic.generate",{basis:"trend"})).toEqual(["topic.generate","trend.extract"]);
    expect(requiredSkillIdsForTask("topic.generate",{basis:"positioning"})).toEqual(["topic.generate"]);
  });
  it("同名、别名、video/chat 受控输入与非 Skill task 映射固定", () => {
    // T-730 恢复的可选论点骨架是真实 official Skill task；若遗漏这个
    // 同名映射，用户点“先梳理观点”会在创建任务前被 fail-closed 拦截。
    expect(requiredSkillIdsForTask("planning.thesis", {})).toEqual([
      "planning.thesis",
    ]);
    expect(requiredSkillIdsForTask("script.draft", {})).toEqual([
      "script.draft",
      "script.source_similarity",
      "script.storyboard.segment",
      "script.voiceover.compose",
    ]);
    // [T-730 regression] 恢复可选论点能力时必须同步恢复运行时 Skill 快照映射。
    expect(requiredSkillIdsForTask("planning.thesis", {})).toEqual([
      "planning.thesis",
    ]);
    expect(requiredSkillIdsForTask("review.analyze", {})).toEqual([
      "review.insights",
    ]);
    expect(requiredSkillIdsForTask("cover.generate", {})).toEqual([
      "cover.brief",
    ]);
    expect(requiredSkillIdsForTask("publish.platform_adapt", {})).toEqual([
      "platform.adapt",
    ]);
    expect(
      requiredSkillIdsForTask("video.decisions", { kind: "subtitles" }),
    ).toEqual(["video.subtitles"]);
    expect(
      requiredSkillIdsForTask("video.decisions", { kind: "broll" }),
    ).toEqual(["material.match", "video.broll"]);
    expect(requiredSkillIdsForTask("video.decisions", {})).toEqual([
      "material.match",
      "video.broll",
      "video.cards",
      "video.director",
      "video.scenes",
      "video.subtitles",
    ]);
    expect(requiredSkillIdsForTask("chat.sync", { surface: "review" })).toEqual([
      "chatbox.review",
      "research.plan",
      ...CHAT_METHOD_SKILL_IDS,
    ]);
    expect(requiredSkillIdsForTask("chat.sync", { surface: "topics" })).toEqual([
      "chatbox.topic",
      "creatoros.guide",
      "research.plan",
      ...CHAT_METHOD_SKILL_IDS,
    ]);
    expect(requiredSkillIdsForTask("chat.sync", { surface: "project" })).toEqual([
      "chatbox.topic",
      "creatoros.guide",
      "research.plan",
      ...CHAT_METHOD_SKILL_IDS,
    ]);
    expect(
      requiredSkillIdsForTask("chat.sync", { surface: "knowledge-distill" }),
    ).toEqual(["chatbox.distill", "research.plan", ...CHAT_METHOD_SKILL_IDS]);
    for (const surface of [
      "calibration",
      "positioning",
      "review",
      "knowledge-distill",
    ]) {
      expect(
        requiredSkillIdsForTask("chat.sync", { surface }),
      ).not.toContain("creatoros.guide");
    }
    expect(requiredSkillIdsForTask("asset.generate", {})).toEqual([]);
    expect(requiredSkillIdsForTask("scheduled.self.detail", {})).toEqual([
      "topic.attribution",
    ]);
    expect(requiredSkillIdsForTask("scheduled.self.metrics", {})).toEqual([
      "topic.attribution",
    ]);
    expect(requiredSkillIdsForTask("scheduled.intelligence.sync", {})).toEqual(
      [],
    );
    expect(requiredSkillIdsForTask("scheduled.benchmark", {})).toEqual([
      "benchmark.teardown",
    ]);
    expect(requiredSkillIdsForTask("scheduled.topic.daily", {})).toEqual([
      "topic.generate",
      "trend.extract",
    ]);
    expect(requiredSkillIdsForTask("scheduled.favorites", {})).toEqual([
      "favorites.triage",
      "knowledge.distill",
    ]);
    for (const taskType of [
      "exec.echo.manifest",
      "exec.video.render",
      "exec.agentic.research",
      "exec.agentic.collect",
      "exec.agentic.material",
    ]) {
      expect(requiredSkillIdsForTask(taskType, {})).toEqual([]);
    }
  });

  it("客户端任意 skillId 不影响受控映射；未知 taskType fail closed", () => {
    expect(
      requiredSkillIdsForTask("video.decisions", {
        kind: "cards",
        skillId: "evil.skill",
      }),
    ).toEqual(["video.cards"]);
    expect(() =>
      requiredSkillIdsForTask("chat.sync", { surface: "unknown" }),
    ).toThrowError(
      expect.objectContaining<Partial<EffectiveSkillSnapshotError>>({
        code: "SKILL_TASK_MAPPING_MISSING",
      }),
    );
    expect(() => requiredSkillIdsForTask("unknown.task", {})).toThrowError(
      expect.objectContaining<Partial<EffectiveSkillSnapshotError>>({
        code: "SKILL_TASK_MAPPING_MISSING",
        status: 422,
      }),
    );
    expect(() =>
      requiredSkillIdsForTask("exec.unknown", {}),
    ).toThrowError(
      expect.objectContaining<Partial<EffectiveSkillSnapshotError>>({
        code: "SKILL_TASK_MAPPING_MISSING",
      }),
    );
  });

  it("执行节点和聊天纯方法共同覆盖 official registry，纯方法不冒充独立任务", () => {
    for (const skillId of [...CHAT_METHOD_SKILL_IDS, "research.plan"]) {
      expect(() => requiredSkillIdsForTask(skillId, {})).toThrow("SKILL_TASK_MAPPING_MISSING");
    }
    expect([...REGISTERED_SKILL_TASK_TYPES, ...CHAT_METHOD_SKILL_IDS, "research.plan"].sort()).toEqual(
      listOfficialSkillBases()
        .map((base) => base.skillId)
        .sort(),
    );
  });
});

describe("[T-513] resolveEffectiveSkillSnapshot", () => {
  it("排序去重 required ids，合并账号增量，server 注入 policy，官方字段不可覆盖", async () => {
    const draft = official("script.draft");
    const review = official("review.insights", {
      contextRequirements: ["publication.transcript"],
    });
    const injected = deps(
      [draft, review],
      [
        row("script.draft", {
          system: "账号方法",
          template: "{{topic}}",
          tools: ["asset.read"],
          requiredFacets: ["topic"],
          outputSchema: {
            type: "object",
            properties: { accountText: { type: "string" } },
          },
          completionPolicy: {
            schemaVersion: 1,
            minSegments: 2,
            maxSegments: 4,
            requiredSequence: ["intro", "end"],
            repairAttempts: 1,
          },
        }),
      ],
    );
    const resolve = createEffectiveSkillSnapshotResolver(injected);

    const snapshot = await resolve(ctx, [
      "script.draft",
      "review.insights",
      "script.draft",
    ]);

    expect(injected.accountOverlays.listBySkillIds).toHaveBeenCalledWith(ctx, [
      "review.insights",
      "script.draft",
    ]);
    expect(snapshot).toMatchObject({
      snapshotVersion: 1,
      userId: "user-1",
      accountId: "acct-a",
      resolvedAt: "2026-07-24T12:00:00.000Z",
      platformPolicyVersion: "policy-v9",
      platformPolicy: "CreatorOS server policy",
    });
    expect(snapshot.skills.map((skill) => skill.skillId)).toEqual([
      "review.insights",
      "script.draft",
    ]);
    expect(snapshot.skills[0]!.effective.contextRequirements).toEqual([
      "publication.transcript",
    ]);
    expect(snapshot.skills[1]).toEqual({
      skillId: "script.draft",
      baseVersion: "v5",
      overlayRevision: 7,
      overlayVersion: "7",
      effective: {
        methodSystem: "账号方法",
        template: "{{topic}}",
        tools: ["asset.read"],
        requiredFacets: ["topic"],
        contextRequirements: ["project.positioning"],
        outputSchema: {
          type: "object",
          properties: { accountText: { type: "string" } },
        },
        completionPolicy: {
          schemaVersion: 1,
          minSegments: 2,
          maxSegments: 4,
          requiredSequence: ["intro", "end"],
          repairAttempts: 1,
        },
        completionPolicyAdapter: {
          id: "official.segments",
          version: "1",
        },
      },
    });
  });

  it("无 overlay 时仍产完整 inline official snapshot", async () => {
    const base = official("script.draft");
    const resolve = createEffectiveSkillSnapshotResolver(deps([base]));
    const snapshot = await resolve(ctx, ["script.draft"]);

    expect(snapshot.skills[0]).toEqual({
      skillId: "script.draft",
      baseVersion: "v5",
      overlayRevision: null,
      overlayVersion: null,
      effective: {
        methodSystem: base.methodSystem,
        template: base.template,
        tools: base.tools,
        requiredFacets: base.requiredFacets,
        contextRequirements: base.contextRequirements,
        outputSchema: base.outputSchema,
        completionPolicy: base.completionPolicy,
        completionPolicyAdapter: base.completionPolicyAdapter,
      },
    });
  });

  it("base 升级后针对当前 official 重验；仍兼容则使用新 base 且保留 overlay revision", async () => {
    const upgraded = official("script.draft", {
      baseVersion: "v6",
      methodSystem: "v6 官方方法",
    });
    const snapshot = await createEffectiveSkillSnapshotResolver(
      deps(
        [upgraded],
        [
          row(
            "script.draft",
            { system: "账号方法仍兼容" },
            { observedBaseVersion: "v5", rowRevision: 9 },
          ),
        ],
      ),
    )(ctx, ["script.draft"]);

    expect(snapshot.skills[0]).toMatchObject({
      skillId: "script.draft",
      baseVersion: "v6",
      overlayRevision: 9,
      effective: { methodSystem: "账号方法仍兼容" },
    });
  });

  it("缺 official、overlay 跨属主与真实不兼容字段均 fail closed", async () => {
    const base = official("script.draft");
    await expect(
      createEffectiveSkillSnapshotResolver(deps([]))(ctx, ["script.draft"]),
    ).rejects.toMatchObject({
      code: "SKILL_SNAPSHOT_INCOMPLETE",
      status: 422,
    });

    await expect(
      createEffectiveSkillSnapshotResolver(
        deps(
          [base],
          [row("script.draft", {}, { accountId: "acct-b" })],
        ),
      )(ctx, ["script.draft"]),
    ).rejects.toMatchObject({
      code: "SKILL_SNAPSHOT_ACCOUNT_MISMATCH",
      status: 403,
    });

    for (const incompatible of [
      row("script.draft", { tools: ["admin.shell"] }),
      row("script.draft", { requiredFacets: ["missing_reader"] }),
      row("script.draft", { contextRequirements: ["evil.reader"] }),
      row("script.draft", {
        completionPolicy: {
          schemaVersion: 1,
          minSegments: 1,
          maxSegments: null,
          requiredSequence: [],
          repairAttempts: 0,
        },
      }),
    ]) {
      await expect(
        createEffectiveSkillSnapshotResolver(
          deps(
            [
              incompatible.overlay &&
              typeof incompatible.overlay === "object" &&
              "completionPolicy" in incompatible.overlay
                ? official("script.draft", {
                    completionPolicyAdapter: null,
                  })
                : base,
            ],
            [incompatible],
          ),
        )(ctx, ["script.draft"]),
      ).rejects.toMatchObject({
        code: "SKILL_OVERLAY_INCOMPATIBLE",
        status: 422,
      });
    }
  });
});

describe("[T-513] snapshot serialization", () => {
  it("serialize/parse round trip，parse 重新校验 owner/排序/完整字段", async () => {
    const snapshot = await createEffectiveSkillSnapshotResolver(
      deps([official("script.draft")]),
    )(ctx, ["script.draft"]);
    const serialized = serializeEffectiveSkillSnapshot(snapshot);

    expect(Buffer.byteLength(serialized, "utf8")).toBeLessThanOrEqual(262_144);
    expect(parseEffectiveSkillSnapshot(serialized)).toEqual(snapshot);
    expect(() =>
      parseEffectiveSkillSnapshot(
        JSON.stringify({ ...snapshot, accountId: "" }),
      ),
    ).toThrowError(
      expect.objectContaining<Partial<EffectiveSkillSnapshotError>>({
        code: "SKILL_SNAPSHOT_INCOMPLETE",
      }),
    );
  });

  it("UTF-8 超过 256 KiB 时 resolve/serialize 都返回 413", async () => {
    const huge = official("script.draft", {
      methodSystem: "中".repeat(100_000),
    });
    await expect(
      createEffectiveSkillSnapshotResolver(deps([huge]))(ctx, [
        "script.draft",
      ]),
    ).rejects.toMatchObject({
      code: "SKILL_SNAPSHOT_TOO_LARGE",
      status: 413,
    });

    const snapshot = await createEffectiveSkillSnapshotResolver(
      deps([official("script.draft")]),
    )(ctx, ["script.draft"]);
    snapshot.platformPolicy = "中".repeat(100_000);
    expect(() => serializeEffectiveSkillSnapshot(snapshot)).toThrowError(
      expect.objectContaining<Partial<EffectiveSkillSnapshotError>>({
        code: "SKILL_SNAPSHOT_TOO_LARGE",
        status: 413,
      }),
    );
  });
});


describe("T-944 官方编导方法到聊天读取链路", () => {
  it("T-962 新聊天可发现并读取 RedFox 研究和运营复盘方法", async () => {
    const bases = listOfficialSkillBases();
    const resolver = createEffectiveSkillSnapshotResolver(deps(bases));
    for (const surface of ["project", "review", "topics"]) {
      const snapshot = await resolver(ctx, requiredSkillIdsForTask("chat.sync", {surface}));
      const library = createChatSkillLibrary(snapshot, ctx);
      for (const skillId of ["method.redfox.topic-research", "method.redfox.benchmark", "method.operations.review"]) {
        expect(library.catalog).toContain(skillId);
        const base = bases.find(item => item.skillId === skillId)!;
        expect(library.read({skillId}).text).toBe([base.methodSystem, base.template].join("\n\n"));
      }
    }
  });
  it("按真实官方注册表冻结后，目录可发现找对标方法，正文逐字来自同一官方版本", async () => {
    const bases = listOfficialSkillBases();
    const resolver = createEffectiveSkillSnapshotResolver(deps(bases));
    const ids = requiredSkillIdsForTask("chat.sync", {surface: "project"});
    const snapshot = await resolver(ctx, ids);
    const library = createChatSkillLibrary(snapshot, ctx);
    expect(library.catalog).toContain("method.research: 【找对标与素材研究】");
    for (const id of ["method.research", "method.writing", "method.review"]) {
      const base = bases.find(item => item.skillId === id)!;
      const result = library.read({skillId: id});
      expect(result.text).toBe([base.methodSystem, base.template].join("\n\n"));
      expect(result.version).toBe(base.baseVersion);
      expect(result.hasMore).toBe(false);
    }
  });
  it("新基线保留账号自定义写法，已冻结任务不随后续修改漂移", async () => {
    const rows = [row("method.writing", {system: "账号自定义写法：先讲维修现场"}, {observedBaseVersion: "v1"})];
    const resolver = createEffectiveSkillSnapshotResolver(deps(listOfficialSkillBases(), rows));
    const frozen = await resolver(ctx, ["method.writing"]);
    rows[0]!.overlay = {system: "账号下一版写法"};
    const next = await resolver(ctx, ["method.writing"]);
    expect(createChatSkillLibrary(frozen, ctx).read({skillId: "method.writing"}).text).toContain("先讲维修现场");
    expect(createChatSkillLibrary(frozen, ctx).read({skillId: "method.writing"}).text).not.toContain("账号下一版写法");
    expect(createChatSkillLibrary(next, ctx).read({skillId: "method.writing"}).text).toContain("账号下一版写法");
  });
});
