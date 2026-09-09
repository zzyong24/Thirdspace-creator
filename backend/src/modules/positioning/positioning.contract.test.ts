import { describe, it, expect, beforeEach } from "vitest";
import { createDb, type Db } from "@creatoros/backend";
import {
  ENDPOINTS,
  type Endpoint,
  type RequestContext,
  type Transport,
} from "@creatoros/contract";
import { createPositioningService } from "./positioning.service";
import { createPositioningTransport } from "./positioning.transport";

// Positioning contract test (Task 4) — for EACH of the 8 op ids, drive the transport
// with a seeded ctx + valid input and assert the op's contract response DTO
// .parse(envelope.data) succeeds (the output validates against the wire shape;
// per-item for the isList statements.list). Mirrors the learnings contract test.

const NOW = "2026-06-21T00:00:00.000Z";
const ctx: RequestContext = { userId: "user-a", requestId: "r1", source: "user", accountId: "acct-a" }; // [T-332 S2] strict 门下 ctx 必带号

const ep = (id: string) => ({ id }) as unknown as Endpoint;
async function call(
  transport: Transport,
  id: string,
  input: unknown,
  rctx?: RequestContext,
): Promise<{ data: unknown }> {
  const res = await transport.request(ep(id), input as never, rctx);
  return res as { data: unknown };
}

function makeTransport(db: Db) {
  let seq = 0;
  const service = createPositioningService({
    db,
    now: () => NOW,
    nextId: (prefix: string) => `${prefix}-${++seq}`,
    projects: {
      getProjectSubject: async () => ({
        title: "论文精读",
        brief: "工程化代码",
      }),
    },
  });
  return createPositioningTransport(() => service);
}

async function seedProfileAndStatement(transport: Transport) {
  await call(
    transport,
    "positioning.profile.upsert",
    {
      body: {
        persona: "p",
        field: "f",
        audience: "a",
        differentiation: "d",
        capabilities: ["x"],
      },
    },
    ctx,
  );
  const created = await call(
    transport,
    "positioning.statements.create",
    {
      body: {
        oneLiner: "把论文变代码",
        keywords: ["论文", "代码", "工程化"],
        productAnchorIds: ["product-1"],
      },
    },
    ctx,
  );
  return (created.data as { id: string }).id;
}

describe("positioning contract (each op validates against its DTO)", () => {
  let db: Db;
  beforeEach(async () => {
    ({ db } = await createDb());
  });

  it("positioning.profile.upsert → creatorProfileResource", async () => {
    const transport = makeTransport(db);
    const env = await call(
      transport,
      "positioning.profile.upsert",
      {
        body: {
          persona: "硬核",
          field: "AI",
          audience: "开发者",
          differentiation: "代码",
          capabilities: ["拆解"],
        },
      },
      ctx,
    );
    const parsed = ENDPOINTS.upsertProfile.response.parse(env.data);
    expect(parsed.field).toBe("AI");
  });

  it("positioning.discovery.start/update → persisted questionnaire DTO", async () => {
    const transport = makeTransport(db);
    const started = await call(
      transport,
      "positioning.discovery.start",
      { body: { sourceMode: "scratch" } },
      ctx,
    );
    const session = ENDPOINTS.startDiscovery.response.parse(started.data);
    expect(session.inputManifest).toEqual({
      legacyProfileId: null,
      legacyStatementIds: [],
      legacyWorkIds: [],
    });

    const updated = await call(
      transport,
      "positioning.discovery.answer.update",
      {
        params: { sessionId: session.id },
        body: {
          themeId: "goal",
          selectedOptionIds: ["personal-brand", "lead-generation"],
          customText: "先建立专业信任",
          skipped: false,
          expectedRevision: session.revision,
        },
      },
      ctx,
    );
    const next = ENDPOINTS.updateDiscoveryAnswer.response.parse(updated.data);
    expect(next.answers[0]?.selectedOptionIds).toEqual([
      "personal-brand",
      "lead-generation",
    ]);
    expect(next.revision).toBe(1);
  });

  it("positioning.discovery.confirm → atomic profile + statement + adopted session DTO", async () => {
    const transport = makeTransport(db);
    const currentStatementId = await seedProfileAndStatement(transport);
    const started = await call(
      transport,
      "positioning.discovery.start",
      { body: { sourceMode: "optimize" } },
      ctx,
    );
    let session = ENDPOINTS.startDiscovery.response.parse(started.data);
    for (const themeId of [
      "goal",
      "strength",
      "audience",
      "need",
      "proof",
      "expression",
    ] as const) {
      const updated = await call(
        transport,
        "positioning.discovery.answer.update",
        {
          params: { sessionId: session.id },
          body: {
            themeId,
            selectedOptionIds: [`${themeId}-choice`],
            customText: "",
            skipped: false,
            expectedRevision: session.revision,
          },
        },
        ctx,
      );
      session = ENDPOINTS.updateDiscoveryAnswer.response.parse(updated.data);
    }
    const confirmed = await call(
      transport,
      "positioning.discovery.confirm",
      {
        params: { sessionId: session.id },
        body: {
          candidateId: "candidate-a",
          candidateRevision: session.revision,
          expectedCurrentStatementId: currentStatementId,
          idempotencyKey: "confirm-attempt-a",
          proposal: {
            persona: "实战顾问",
            field: "家装",
            audience: "装修家庭",
            differentiation: "真实工地",
            capabilities: ["验收"],
            facets: {
              contentScope: "装修决策",
              avoid: "不夸大",
              corePain: "预算不透明",
              coreValue: "降低决策风险",
              tone: "直接",
              statusNote: "",
            },
            downstreamRules: {
              topicRule: "真实问题",
              scriptRule: "先场景",
              projectRule: "真实素材",
              forbidRule: "不虚构",
              expressionRule: "说人话",
            },
            oneLiner: "帮装修家庭看懂预算和施工",
            keywords: ["装修", "预算", "施工"],
            productAnchorIds: [],
          },
        },
      },
      ctx,
    );
    const parsed = ENDPOINTS.confirmDiscovery.response.parse(confirmed.data);
    expect(parsed.session.status).toBe("adopted");
    expect(parsed.session.adoptedCandidateId).toBe("candidate-a");
    expect(parsed.statement.versionNumber).toBe(2);
    expect(parsed.profile.persona).toBe("实战顾问");
  });

  it("positioning.profile.get → creatorProfileResource", async () => {
    const transport = makeTransport(db);
    await seedProfileAndStatement(transport);
    const env = await call(transport, "positioning.profile.get", {}, ctx);
    const parsed = ENDPOINTS.getProfile.response.parse(env.data);
    expect(parsed.userId).toBe("user-a");
  });

  it("[T-666] positioning.master.reset 对已有母版拒绝执行，正式定位保持不变", async () => {
    const transport = makeTransport(db);
    await seedProfileAndStatement(transport);
    await expect(
      call(transport, "positioning.master.reset", {}, ctx),
    ).rejects.toThrow(/不能被清空/u);

    const center = await call(transport, "pages.positioning.get", {}, ctx);
    const parsedCenter = ENDPOINTS.getPositioningCenter.response.parse(center.data);
    expect(parsedCenter.currentStatement?.oneLiner).toBe("把论文变代码");
    expect(parsedCenter.profile?.persona).toBe("p");
    expect(parsedCenter.history).toHaveLength(1);
  });

  it("positioning.master.restore → restored profile + selected original statement", async () => {
    const transport = makeTransport(db);
    const statementId = await seedProfileAndStatement(transport);
    const env = await call(
      transport,
      "positioning.master.restore",
      { body: { statementId } },
      ctx,
    );
    const parsed = ENDPOINTS.restorePositioningMaster.response.parse(env.data);
    expect(parsed.restoredFromVersion).toBe(1);
    expect(parsed.statement.versionNumber).toBe(1);
    expect(parsed.statement.id).toBe(statementId);
    expect(parsed.profile.persona).toBe("p");
  });

  it("positioning.statements.create → positioningStatementResource (version 1)", async () => {
    const transport = makeTransport(db);
    await call(
      transport,
      "positioning.profile.upsert",
      { body: { persona: "p", field: "f", audience: "a", differentiation: "d", capabilities: [] } },
      ctx,
    );
    const env = await call(
      transport,
      "positioning.statements.create",
      {
        body: {
          oneLiner: "x",
          keywords: ["a", "b", "c"],
          productAnchorIds: [],
        },
      },
      ctx,
    );
    const parsed = ENDPOINTS.createStatement.response.parse(env.data);
    expect(parsed.versionNumber).toBe(1);
    expect(parsed.createdByType).toBe("human");
  });

  it("positioning.statements.list → positioningStatementResource[] (each item validates)", async () => {
    const transport = makeTransport(db);
    await seedProfileAndStatement(transport);
    const env = await call(
      transport,
      "positioning.statements.list",
      { query: { page: 1, pageSize: 20 } },
      ctx,
    );
    const items = (env.data as unknown[]) ?? [];
    expect(items.length).toBeGreaterThan(0);
    for (const item of items) {
      ENDPOINTS.listStatements.response.parse(item);
    }
  });

  it("positioning.statements.get → positioningStatementResource", async () => {
    const transport = makeTransport(db);
    const id = await seedProfileAndStatement(transport);
    const env = await call(
      transport,
      "positioning.statements.get",
      { params: { statementId: id } },
      ctx,
    );
    const parsed = ENDPOINTS.getStatement.response.parse(env.data);
    expect(parsed.id).toBe(id);
  });

  it("positioning.gate.evaluate → positioningGateResultResource", async () => {
    const transport = makeTransport(db);
    await seedProfileAndStatement(transport);
    const env = await call(
      transport,
      "positioning.gate.evaluate",
      { body: { subjectType: "project", subjectId: "project-1" } },
      ctx,
    );
    const parsed = ENDPOINTS.evaluateGate.response.parse(env.data);
    expect(Number.isInteger(parsed.positioningFit)).toBe(true);
    expect(parsed.subjectId).toBe("project-1");
  });

  it("pages.positioning.get → positioningCenterResource (empty-state safe)", async () => {
    const transport = makeTransport(db);
    const env = await call(transport, "pages.positioning.get", {}, ctx);
    const parsed = ENDPOINTS.getPositioningCenter.response.parse(env.data);
    expect(parsed.profile).toBeNull();
    expect(parsed.history).toEqual([]);
  });

  it("no ctx → AuthenticationError", async () => {
    const transport = makeTransport(db);
    await expect(
      call(transport, "positioning.statements.list", { query: {} }),
    ).rejects.toThrow();
  });
});
