import { describe, it, expect, beforeEach, vi } from "vitest";
import { readFileSync, existsSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { createDb, type Db } from "@creatoros/backend";
import type { RequestContext } from "@creatoros/contract";
import { createAiService, type AiArtifactsPort } from "./ai.service";
import { OwnershipError } from "./ai.errors";
import { AI_OP_IDS } from "./ai.transport";

// SPEC §22 + foundation §5.6 acceptance for the AI module (plan Step 6/7). Asserts the
// structural invariants the plan's acceptance checklist calls out:
//   - foundation §5 module layout present (service + repository + schema + errors +
//     transport + index + db-schema + the test trio);
//   - NO cross-module repository import (Artifacts reached only via the injected port);
//   - the determinism boundary (design-spec §8): NO @anthropic-ai/claude-agent-sdk import
//     anywhere under the module — the SDK lives ONLY in @creatoros/ai-worker;
//   - the candidate-confirm gate (SPEC §18): confirmTask is the SOLE caller of
//     createVersion(createdByType:"ai"); the AI never writes a current version directly;
//   - the §12 AI Task state machine guard (valid + invalid transitions);
//   - idempotency (a duplicate create returns the existing task, no second row);
//   - multi-tenant smoke (A cannot read B's task);
//   - the six owned ops are registered.

const HERE = dirname(fileURLToPath(import.meta.url));
const NOW = "2026-06-21T00:00:00.000Z";
const ctxA: RequestContext = { userId: "user-a", requestId: "ra", source: "user" };
const ctxB: RequestContext = { userId: "user-b", requestId: "rb", source: "user" };

function makeService(db: Db, createVersion?: AiArtifactsPort["createVersion"]) {
  let seq = 0;
  const port: AiArtifactsPort = {
    createVersion: createVersion ?? vi.fn(async () => ({})),
  };
  return createAiService({
    db,
    now: () => NOW,
    nextId: (prefix: string) => `${prefix}-${++seq}`,
    artifacts: port,
    knowledge: { createKnowledge: vi.fn(async () => ({ id: "k-new" })) },
    candidate: {
      createFromAIResult: vi.fn(async () => ({ id: "cand-new" })),
      enrichCard: vi.fn(async () => ({ id: "cand-new" })),
    },
    learnings: { createLearning: vi.fn(async () => ({ id: "learn-new" })) },
    publishing: {
      createPublicationFromDraft: vi.fn(async () => ({ id: "pub-new" })),
    },
    materialLinks: { link: vi.fn(async () => ({ id: "mlink-new" })) },
    positioning: {
      upsertProfile: vi.fn(async () => ({ id: "profile-new" })),
      createStatementVersion: vi.fn(async () => ({ id: "stmt-new" })),
    },
    calibration: {
      createDraftPrediction: vi.fn(async () => ({ id: "pred-new" })),
    },
  });
}

describe("ai acceptance (SPEC §22)", () => {
  let db: Db;
  beforeEach(async () => {
    ({ db } = await createDb());
  });

  it("has the foundation §5 module layout files", () => {
    for (const f of [
      "ai.service.ts",
      "ai.repository.ts",
      "ai.schema.ts",
      "ai.errors.ts",
      "ai.transport.ts",
      "index.ts",
      "ai.db-schema.ts",
      "ai.service.test.ts",
      "ai.repository.integration.test.ts",
      "ai.contract.test.ts",
    ]) {
      expect(existsSync(join(HERE, f)), `${f} present`).toBe(true);
    }
  });

  it("imports NO peer module's repository (cross-module access only via injected ports)", () => {
    for (const f of [
      "ai.service.ts",
      "ai.repository.ts",
      "ai.transport.ts",
    ]) {
      const src = readFileSync(join(HERE, f), "utf8");
      expect(
        /from\s+["'][^"']*modules\/(?!ai)[^"']*\.repository["']/.test(src),
      ).toBe(false);
      expect(/from\s+["']@\/server\/modules\/artifacts["']/.test(src)).toBe(false);
    }
  });

  it("determinism boundary: NO Agent SDK import anywhere under the module", () => {
    // Scan the module's SOURCE files (exclude the test files — this acceptance file
    // names the SDK string in its assertions). An import is `from "@anthropic-ai/..."`.
    for (const f of readdirSync(HERE)) {
      if (!f.endsWith(".ts") || f.endsWith(".test.ts")) continue;
      const src = readFileSync(join(HERE, f), "utf8");
      expect(
        /from\s+["']@anthropic-ai\/claude-agent-sdk["']/.test(src),
        `${f} must not import the Agent SDK`,
      ).toBe(false);
    }
  });

  it("candidate-confirm gate: confirmTask is the SOLE createVersion(ai) caller; the worker write seam never calls it", () => {
    const serviceSrc = readFileSync(join(HERE, "ai.service.ts"), "utf8");
    // createVersion is reached only through the injected artifacts port.
    const callCount = (serviceSrc.match(/deps\.artifacts\.createVersion/g) ?? [])
      .length;
    expect(callCount).toBe(1);
    // recordCandidate (the worker write seam) only inserts a result + flips status — it
    // must NOT call the artifacts port.
    const recordBody = serviceSrc.slice(
      serviceSrc.indexOf("async recordCandidate"),
    );
    const nextMethod = recordBody.indexOf("\n    },");
    expect(
      recordBody.slice(0, nextMethod).includes("deps.artifacts.createVersion"),
    ).toBe(false);
  });

  it("candidate-confirm: confirmTask calls createVersion(createdByType:'ai') exactly once and flips to succeeded", async () => {
    const createVersion = vi.fn<AiArtifactsPort["createVersion"]>(
      async () => ({}),
    );
    const service = makeService(db, createVersion);
    const task = await service.createTask(ctxA, {
      taskType: "script.rewrite",
      inputData: { artifactId: "artifact-1", idempotencyKey: "k-a" },
    });
    await service.recordCandidate(ctxA, task.id, {
      resultType: "artifact_version",
      artifactId: "artifact-1",
      resultData: { body: "改写稿", summary: "s" },
    });
    const confirmed = await service.confirmTask(ctxA, task.id);
    expect(confirmed.status).toBe("succeeded");
    expect(createVersion).toHaveBeenCalledTimes(1);
    expect(createVersion.mock.calls[0]![2].createdByType).toBe("ai");
  });

  it("state machine: confirm from queued is rejected (no transition outside the table)", async () => {
    const service = makeService(db);
    const task = await service.createTask(ctxA, {
      taskType: "script.rewrite",
      inputData: { artifactId: "a", idempotencyKey: "k-q" },
    });
    await expect(service.confirmTask(ctxA, task.id)).rejects.toThrow();
  });

  it("idempotency: a duplicate create returns the existing task, no second row", async () => {
    const service = makeService(db);
    const a = await service.createTask(ctxA, {
      taskType: "script.rewrite",
      inputData: { artifactId: "a", idempotencyKey: "dup" },
    });
    const b = await service.createTask(ctxA, {
      taskType: "script.rewrite",
      inputData: { artifactId: "a", idempotencyKey: "dup" },
    });
    expect(b.id).toBe(a.id);
  });

  it("user scope: A cannot read B's task (OwnershipError → 404)", async () => {
    const service = makeService(db);
    const taskB = await service.createTask(ctxB, {
      taskType: "script.rewrite",
      inputData: { artifactId: "a", idempotencyKey: "b" },
    });
    await expect(service.getTask(ctxA, taskB.id)).rejects.toBeInstanceOf(
      OwnershipError,
    );
  });

  it("secretReference is env:ANTHROPIC_API_KEY (never hardcoded) in the seed catalog", async () => {
    const seedSrc = readFileSync(join(HERE, "ai.seed.ts"), "utf8");
    expect(seedSrc.includes("env:ANTHROPIC_API_KEY")).toBe(true);
    // No raw key literal (sk-ant-...) anywhere.
    expect(/sk-ant-[a-zA-Z0-9]/.test(seedSrc)).toBe(false);
  });

  it("registers the owned ops into the module op-id list", () => {
    expect([...AI_OP_IDS].sort()).toEqual([
      "ai.conversations.create",
      "ai.conversations.list",
      "ai.conversations.messages.create",
      "ai.conversations.messages.list",
      "ai.tasks.cancel",
      "ai.tasks.confirm",
      "ai.tasks.create",
      "ai.tasks.get",
      "ai.tasks.list",
      "ai.tasks.pending_topic_review",
      "ai.tasks.results.list",
      "ai.tasks.results.patch",
      "ai.tasks.steps.list",
    ]);
  });
});
