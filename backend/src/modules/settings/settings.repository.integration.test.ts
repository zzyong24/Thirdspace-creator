import { describe, it, expect, beforeEach } from "vitest";
import { createDb, type Db, type RequestContext } from "@creatoros/backend";
import { createSettingsRepository } from "./settings.repository";
import { createAssetRepository } from "@creatoros/backend/modules/assets";

// Settings repository integration tests (plan Step 1 schema-slice + Step 2
// ownership/upsert/patch), pglite-backed. EVERY query is user-scoped: user A can
// never read user B (foundation §5.2). putModel is idempotent on
// (userId, capability); patchPreferences is insert-then-update on the provided
// keys only.

const DEPS = {
  now: () => "2026-06-21T00:00:00.000Z",
  nextId: (() => {
    let n = 0;
    return (prefix: string) => `${prefix}-t-${++n}`;
  })(),
};

const ctxA: RequestContext = { userId: "user-a", requestId: "req-a", source: "user" };
const ctxB: RequestContext = { userId: "user-b", requestId: "req-b", source: "user" };

describe("settings.repository (schema slice — round-trips)", () => {
  let db: Db;

  beforeEach(async () => {
    ({ db } = await createDb());
  });

  it("round-trips a preference, model, and agent row", async () => {
    const repo = createSettingsRepository(db, DEPS);

    const pref = await repo.patchPreferences(ctxA, {
      defaultHome: "dashboard",
      defaultCreationMode: "guided",
      defaultVisibility: "private",
    });
    expect(pref.userId).toBe("user-a");
    expect(pref.defaultHome).toBe("dashboard");

    const model = await repo.putModel(ctxA, "script", {
      provider: "anthropic",
      modelName: "claude-opus-4-8",
    });
    expect(model.userId).toBe("user-a");
    expect(model.capability).toBe("script");

    const agent = await repo.createAgent(ctxA, {
      name: "研究助理",
      agentType: "research",
    });
    expect(agent.userId).toBe("user-a");
    expect(agent.name).toBe("研究助理");
    expect(agent.status).toBe("active");
  });

  it("putModel persists baseUrl + apiFormat and getModel reads them back", async () => {
    const repo = createSettingsRepository(db, DEPS);
    await repo.putModel(ctxA, "planning.thesis", {
      provider: "minimax",
      modelName: "MiniMax-M3",
      baseUrl: "https://api.minimaxi.com/anthropic",
      apiFormat: "anthropic",
      secretReference: "env:MINIMAX_AUTH_TOKEN",
    });
    const row = await repo.getModel(ctxA, "planning.thesis");
    expect(row?.baseUrl).toBe("https://api.minimaxi.com/anthropic");
    expect(row?.apiFormat).toBe("anthropic");
  });

  it("putModel defaults apiFormat to 'anthropic' and baseUrl to null when omitted", async () => {
    const repo = createSettingsRepository(db, DEPS);
    await repo.putModel(ctxA, "copy.generate", {
      provider: "anthropic",
      modelName: "claude-opus-4-8",
    });
    const row = await repo.getModel(ctxA, "copy.generate");
    expect(row?.apiFormat).toBe("anthropic");
    expect(row?.baseUrl ?? null).toBeNull();
  });
});

describe("settings.repository (ownership — user A ≠ user B)", () => {
  let db: Db;

  beforeEach(async () => {
    ({ db } = await createDb());
  });

  it("never returns another user's preference / model / agent", async () => {
    const repo = createSettingsRepository(db, DEPS);

    await repo.patchPreferences(ctxA, {
      defaultHome: "projects",
      defaultCreationMode: "flexible",
      defaultVisibility: "unlisted",
    });
    await repo.patchPreferences(ctxB, {
      defaultHome: "dashboard",
      defaultCreationMode: "guided",
      defaultVisibility: "private",
    });
    await repo.putModel(ctxA, "script", { provider: "anthropic", modelName: "a-model" });
    await repo.putModel(ctxB, "script", { provider: "openai", modelName: "b-model" });

    // getPreferences is scoped: B never sees A's defaultHome.
    const prefB = await repo.getPreferences(ctxB);
    expect(prefB?.defaultHome).toBe("dashboard");
    const prefA = await repo.getPreferences(ctxA);
    expect(prefA?.defaultHome).toBe("projects");

    // getModel is scoped: B's "script" model is B's only.
    const modelB = await repo.getModel(ctxB, "script");
    expect(modelB?.modelName).toBe("b-model");
    expect(modelB?.provider).toBe("openai");

    // listModels(ctxA) excludes B's rows.
    const listA = await repo.listModels(ctxA);
    expect(listA).toHaveLength(1);
    expect(listA[0]!.modelName).toBe("a-model");
  });
});

describe("settings.repository (putModel upsert)", () => {
  let db: Db;

  beforeEach(async () => {
    ({ db } = await createDb());
  });

  it("inserts then updates in place on the same (userId, capability)", async () => {
    const repo = createSettingsRepository(db, DEPS);

    await repo.putModel(ctxA, "script", {
      provider: "anthropic",
      modelName: "claude-sonnet",
      settings: { temperature: 0.6 },
    });
    const after = await repo.putModel(ctxA, "script", {
      provider: "openai",
      modelName: "gpt-4o",
      settings: { temperature: 0.2 },
    });

    // Row count stays 1 (upsert, not insert).
    const list = await repo.listModels(ctxA);
    expect(list).toHaveLength(1);
    expect(after.provider).toBe("openai");
    expect(after.modelName).toBe("gpt-4o");
    expect(after.settings).toEqual({ temperature: 0.2 });
  });

  it("defaults secretReference to '' and settings to {} when omitted", async () => {
    const repo = createSettingsRepository(db, DEPS);
    const model = await repo.putModel(ctxA, "research", {
      provider: "anthropic",
      modelName: "claude-opus",
    });
    expect(model.secretReference).toBe("");
    expect(model.settings).toEqual({});
    expect(model.isDefault).toBe(false);
  });

  it("stores an inline secret value and a partial update preserves it", async () => {
    const repo = createSettingsRepository(db, DEPS);
    await repo.putModel(ctxA, "default", {
      provider: "minimax",
      modelName: "MiniMax-M3",
      baseUrl: "https://api.minimaxi.com/anthropic",
      apiFormat: "anthropic",
      secret: "sk-real",
    });
    const row = await repo.getModel(ctxA, "default");
    expect(row?.secretValue).toBe("sk-real");

    // A partial update (provider/model only, no secret) keeps the stored key.
    const after = await repo.putModel(ctxA, "default", {
      provider: "minimax",
      modelName: "MiniMax-M3-v2",
    });
    expect(after.modelName).toBe("MiniMax-M3-v2");
    const row2 = await repo.getModel(ctxA, "default");
    expect(row2?.secretValue).toBe("sk-real");
  });
});

describe("settings.repository (patchPreferences insert-then-update)", () => {
  let db: Db;

  beforeEach(async () => {
    ({ db } = await createDb());
  });

  it("seeds defaults+patch first, then mutates only provided keys", async () => {
    const repo = createSettingsRepository(db, DEPS);

    // First patch: no row exists → insert with patch over defaults.
    const first = await repo.patchPreferences(ctxA, {
      fileNamingRule: "{project}-{stage}",
      autosaveEnabled: false,
    });
    expect(first.fileNamingRule).toBe("{project}-{stage}");
    expect(first.autosaveEnabled).toBe(false);
    // Unset keys take schema defaults (analytics 默认关 · PROTECTION.md §4).
    expect(first.analyticsEnabled).toBe(false);

    // Second patch: only analyticsEnabled — fileNamingRule untouched.
    const second = await repo.patchPreferences(ctxA, { analyticsEnabled: false });
    expect(second.analyticsEnabled).toBe(false);
    expect(second.fileNamingRule).toBe("{project}-{stage}");
    expect(second.autosaveEnabled).toBe(false);

    // Still one row.
    const pref = await repo.getPreferences(ctxA);
    expect(pref?.fileNamingRule).toBe("{project}-{stage}");
  });
});

describe("settings.repository (storage config — item B)", () => {
  let db: Db;

  beforeEach(async () => {
    ({ db } = await createDb());
  });

  it("upserts storage_config on the user_id PK (partial patch preserves other column)", async () => {
    const repo = createSettingsRepository(db, DEPS);
    // First put sets the rootPath; backend defaults to 'local'.
    const a = await repo.putStorageConfig(ctxA, { rootPath: "/tmp/a-media" });
    expect(a.userId).toBe("user-a");
    expect(a.backend).toBe("local");
    expect(a.rootPath).toBe("/tmp/a-media");
    // Second put changes only the backend → rootPath is preserved.
    const b = await repo.putStorageConfig(ctxA, { backend: "s3" });
    expect(b.backend).toBe("s3");
    expect(b.rootPath).toBe("/tmp/a-media");
    // Still one row, scoped to user-a.
    const got = await repo.getStorageConfig(ctxA);
    expect(got?.rootPath).toBe("/tmp/a-media");
    expect(await repo.getStorageConfig(ctxB)).toBeNull();
  });

  it("sumUsageByAssetType returns real SUM(file_size) grouped by asset_type, user-scoped", async () => {
    const settings = createSettingsRepository(db, DEPS);
    const assetsRepo = createAssetRepository(db, DEPS);

    async function seedAssetWithFile(
      ctx: RequestContext,
      assetType: string,
      bytes: number,
    ) {
      const asset = await assetsRepo.insertAsset(ctx.userId, {
        assetType,
        name: `${assetType}-asset`,
        currentFileId: null,
      });
      await assetsRepo.insertAssetFile(ctx.userId, {
        assetId: asset.id,
        storageKey: `${assetType}/${asset.id}`,
        mimeType: "application/octet-stream",
        fileSize: bytes,
        checksum: "",
        width: null,
        height: null,
        durationMs: null,
        mediaMetadata: {},
      });
    }

    await seedAssetWithFile(ctxA, "image", 1000);
    await seedAssetWithFile(ctxA, "image", 500); // two image files → SUM 1500
    await seedAssetWithFile(ctxA, "video", 4000);
    await seedAssetWithFile(ctxB, "image", 9999); // user B — must NOT leak into A

    const usage = await settings.sumUsageByAssetType(ctxA);
    const byType = new Map(usage.map((u) => [u.assetType, u.bytes]));
    expect(byType.get("image")).toBe(1500);
    expect(byType.get("video")).toBe(4000);
    // user B's bytes are excluded from A's aggregation.
    const totalA = usage.reduce((s, u) => s + u.bytes, 0);
    expect(totalA).toBe(5500);
  });
});
