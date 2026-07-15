import { describe, it, expect } from "vitest";
import { createDb } from "@creatoros/backend";
import {
  metricSnapshots,
  metricValues,
  retentionPoints,
  audienceSnapshots,
} from "./analytics.db-schema";

// Task 1 — append-only metric tables round-trip + UNIQUE idempotency anchor.
// Spins up a real pglite store (createDb applies ANALYTICS_DDL), inserts one row
// per table for a fixed user_id, reads it back and asserts every column round-trips
// (esp. jsonb raw_metrics/dimensions and ISO-8601 text), then proves the
// (publication_id, source, captured_at) UNIQUE index rejects a duplicate snapshot.

const USER = "user-schema-test";
const CAPTURED = "2026-06-12T10:00:00.000Z";
const CREATED = "2026-06-12T10:00:00.000Z";

describe("analytics db-schema round-trip", () => {
  it("round-trips every column for one row per table", async () => {
    const { db, client } = await createDb();
    try {
      await db.insert(metricSnapshots).values({
        id: "ms-1",
        userId: USER,
        accountId: "acct-schema-test", // [T-332 S1] account_id NOT NULL,插行必带号
        publicationId: "pub-1",
        ingestionRunId: "run-1",
        capturedAt: CAPTURED,
        source: "platform_api",
        rawMetrics: { views: 18420, conversionLink: "https://x" },
        createdAt: CREATED,
      });
      await db.insert(metricValues).values({
        id: "mv-1",
        userId: USER,
        accountId: "acct-schema-test", // [T-332 S1] account_id NOT NULL,插行必带号
        metricSnapshotId: "ms-1",
        metricKey: "conversion_clicks",
        numericValue: 312.5,
        unit: "count",
        dimensions: { platform: "bilibili", intent: "paying" },
      });
      await db.insert(retentionPoints).values({
        id: "rp-1",
        userId: USER,
        accountId: "acct-schema-test", // [T-332 S1] account_id NOT NULL,插行必带号
        publicationId: "pub-1",
        capturedAt: CAPTURED,
        positionMs: 60000,
        retentionRate: 0.78,
        viewerCount: 14368,
      });
      await db.insert(audienceSnapshots).values({
        id: "aud-1",
        userId: USER,
        accountId: "acct-schema-test", // [T-332 S1] account_id NOT NULL,插行必带号
        publicationId: "pub-1",
        capturedAt: CAPTURED,
        dimensionType: "intent",
        dimensionValue: "high",
        percentage: 0.41,
        audienceCount: 7552,
      });

      const [snap] = await db.select().from(metricSnapshots);
      expect(snap).toMatchObject({
        id: "ms-1",
        userId: USER,
        accountId: "acct-schema-test", // [T-332 S1] account_id NOT NULL,插行必带号
        publicationId: "pub-1",
        ingestionRunId: "run-1",
        capturedAt: CAPTURED,
        source: "platform_api",
        rawMetrics: { views: 18420, conversionLink: "https://x" },
        createdAt: CREATED,
      });

      const [value] = await db.select().from(metricValues);
      expect(value).toMatchObject({
        id: "mv-1",
        userId: USER,
        accountId: "acct-schema-test", // [T-332 S1] account_id NOT NULL,插行必带号
        metricSnapshotId: "ms-1",
        metricKey: "conversion_clicks",
        numericValue: 312.5,
        unit: "count",
        dimensions: { platform: "bilibili", intent: "paying" },
      });

      const [point] = await db.select().from(retentionPoints);
      expect(point).toMatchObject({
        id: "rp-1",
        userId: USER,
        accountId: "acct-schema-test", // [T-332 S1] account_id NOT NULL,插行必带号
        positionMs: 60000,
        retentionRate: 0.78,
        viewerCount: 14368,
      });

      const [aud] = await db.select().from(audienceSnapshots);
      expect(aud).toMatchObject({
        id: "aud-1",
        dimensionType: "intent",
        dimensionValue: "high",
        percentage: 0.41,
        audienceCount: 7552,
      });
      await client.close();
    } finally {
      // client closed above; nothing else to release
    }
  });

  it("rejects a duplicate (publication_id, source, captured_at) snapshot", async () => {
    const { db, client } = await createDb();
    const row = {
      id: "ms-a",
      userId: USER,
      accountId: "acct-schema-test", // [T-332 S1] account_id NOT NULL
      publicationId: "pub-1",
      ingestionRunId: null,
      capturedAt: CAPTURED,
      source: "platform_api",
      rawMetrics: {},
      createdAt: CREATED,
    };
    await db.insert(metricSnapshots).values(row);
    await expect(
      db.insert(metricSnapshots).values({ ...row, id: "ms-b" }),
    ).rejects.toThrow();
    await client.close();
  });
});
