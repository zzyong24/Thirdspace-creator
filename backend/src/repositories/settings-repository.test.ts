import { describe, it, expect, beforeEach } from "vitest";
import { createDb, type Db } from "../db";
import {
  createSettingsRepository,
  type SettingsRepository,
} from "./settings-repository";

const FIXED_NOW = "2026-06-13T10:00:00+08:00";

// Deterministic deps; ids are namespaced per userId so two users' repos never
// collide on the agent/model text PKs (mirrors the project repo's nextId scheme).
function deterministicDeps(userId: string) {
  const counters = new Map<string, number>();
  return {
    now: () => FIXED_NOW,
    nextId: (prefix: string) => {
      const n = (counters.get(prefix) ?? 0) + 1;
      counters.set(prefix, n);
      return `${prefix}-${userId}-${n}`;
    },
    userId,
  };
}

let db: Db;
let repo: SettingsRepository;

beforeEach(async () => {
  ({ db } = await createDb()); // fresh in-memory pglite per test
  repo = createSettingsRepository(db, deterministicDeps("user-1"));
});

describe("SettingsRepository (pglite-backed real persistence)", () => {
  it("creates an agent and reads it back via get + list", async () => {
    const created = await repo.createAgent({
      name: "改写助手",
      agentType: "rewriter",
    });
    expect(created.id).toBe("agent-user-1-1");
    expect(created.status).toBe("active");
    expect(created.createdAt).toBe(FIXED_NOW);

    const fetched = await repo.getAgent("agent-user-1-1");
    expect(fetched.name).toBe("改写助手");

    const list = await repo.listAgents();
    expect(list.map((a) => a.id)).toEqual(["agent-user-1-1"]);
  });

  it("throws OwnershipError-style not-found for a missing agent", async () => {
    await expect(repo.getAgent("nope")).rejects.toThrow(/not found/);
  });

  it("lazily materializes preferences with schema defaults then patches durably", async () => {
    const prefs = await repo.getPreferences();
    expect(prefs.id).toBe("pref-user-1");
    expect(prefs.userId).toBe("user-1");
    expect(prefs.defaultCreationMode).toBe("guided");
    expect(prefs.autosaveEnabled).toBe(true);

    const patched = await repo.patchPreferences({
      defaultHome: "projects",
      defaultVisibility: "public",
      analyticsEnabled: false,
    });
    expect(patched.defaultHome).toBe("projects");
    expect(patched.defaultVisibility).toBe("public");
    expect(patched.analyticsEnabled).toBe(false);
    // unchanged field retains its default
    expect(patched.defaultCreationMode).toBe("guided");

    // persisted: a fresh read reflects it and does NOT create a duplicate row
    const reread = await repo.getPreferences();
    expect(reread.defaultHome).toBe("projects");
    expect(reread.analyticsEnabled).toBe(false);
  });

  it("upserts a model config idempotently on (user, capability) — key invariant", async () => {
    const first = await repo.putModel("draft", {
      provider: "anthropic",
      modelName: "claude-3",
    });
    expect(first.capability).toBe("draft");
    expect(first.provider).toBe("anthropic");
    expect(first.secretReference).toBe("");

    // A second PUT for the SAME capability mutates the existing row in place —
    // no second row is created (ON CONFLICT DO UPDATE on the UNIQUE index).
    const second = await repo.putModel("draft", {
      provider: "openai",
      modelName: "gpt-4o",
      isDefault: true,
    });
    expect(second.provider).toBe("openai");
    expect(second.modelName).toBe("gpt-4o");
    expect(second.isDefault).toBe(true);

    const models = await repo.listModels();
    expect(models).toHaveLength(1);
    expect(models[0]!.provider).toBe("openai");

    // A different capability is a distinct row.
    await repo.putModel("research", {
      provider: "anthropic",
      modelName: "claude-3",
    });
    expect(await repo.listModels()).toHaveLength(2);
  });

  it("scopes ownership: user-2 cannot see or get user-1's agent (404 surface)", async () => {
    const mine = await repo.createAgent({ name: "我的", agentType: "x" });

    const otherRepo = createSettingsRepository(db, deterministicDeps("user-2"));
    // cross-user get → same not-found surface as the reference repos
    await expect(otherRepo.getAgent(mine.id)).rejects.toThrow(/not found/);
    // and it is invisible in the other user's list
    expect(await otherRepo.listAgents()).toHaveLength(0);

    // each user's preferences are independent singletons
    await otherRepo.patchPreferences({ defaultHome: "settings" });
    expect((await repo.getPreferences()).defaultHome).toBe("dashboard");
    expect((await otherRepo.getPreferences()).defaultHome).toBe("settings");
  });
});
