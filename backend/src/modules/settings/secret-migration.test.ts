import { describe, it, expect, beforeEach } from "vitest";
import { createDb, type Db } from "@creatoros/backend";
import { eq } from "drizzle-orm";
import { migratePlaintextSecrets } from "./secret-migration";
import { modelConfigurations } from "./settings.db-schema";
import { isEncrypted, decryptSecret } from "@creatoros/backend";

// T-147 P2 —— 存量明文加密迁移:就地加密 + 幂等 + 跳过已密/NULL。

const KEY = Buffer.alloc(32, 7);

async function insertRow(
  db: Db,
  id: string,
  secretValue: string | null,
  capability = id,
) {
  await db.insert(modelConfigurations).values({
    id,
    userId: "user-a",
    capability,
    provider: "minimax",
    modelName: "m",
    secretReference: "",
    secretValue,
    settings: {},
    apiFormat: "anthropic",
    isDefault: false,
  });
}

describe("migratePlaintextSecrets", () => {
  let db: Db;
  beforeEach(async () => {
    ({ db } = await createDb());
  });

  it("encrypts legacy plaintext rows in place; leaves NULL/empty/already-encrypted alone", async () => {
    await insertRow(db, "plain-1", "sk-legacy-1", "default");
    await insertRow(db, "plain-2", "sk-legacy-2", "image.default");
    await insertRow(db, "null-1", null, "video.default");
    await insertRow(db, "empty-1", "", "search.default");

    const res = await migratePlaintextSecrets(db, KEY);
    expect(res.total).toBe(4);
    expect(res.encrypted).toBe(2);
    expect(res.emptyOrNull).toBe(2); // NULL + empty
    expect(res.alreadyEncrypted).toBe(0);

    // The two plaintext rows are now ciphertext at rest but decrypt back.
    const p1 = (
      await db
        .select()
        .from(modelConfigurations)
        .where(eq(modelConfigurations.id, "plain-1"))
    )[0]!;
    expect(isEncrypted(p1.secretValue!)).toBe(true);
    expect(decryptSecret(p1.secretValue, KEY)).toBe("sk-legacy-1");
  });

  it("is idempotent — a second run encrypts nothing", async () => {
    await insertRow(db, "plain-1", "sk-legacy-1", "default");
    await migratePlaintextSecrets(db, KEY);
    const second = await migratePlaintextSecrets(db, KEY);
    expect(second.encrypted).toBe(0);
    expect(second.alreadyEncrypted).toBe(1);
  });

  it("empty table → all zeros, no crash", async () => {
    const res = await migratePlaintextSecrets(db, KEY);
    expect(res).toEqual({
      total: 0,
      encrypted: 0,
      alreadyEncrypted: 0,
      emptyOrNull: 0,
    });
  });
});
