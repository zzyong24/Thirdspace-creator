import { describe, it, expect } from "vitest";
import { createDb } from "@creatoros/backend";
import { createEncryptedLogReporting } from "./encrypted-log-reporting";
import { createSettingsTransport } from "./settings.transport";
import { ENDPOINTS, createClient } from "@creatoros/contract";
describe("T1255 canonical DB migration and settings consumer", () => {
  it("fresh migration has durable v2 state through public transport", async () => {
    const opened = await createDb();
    try {
      const collector = createEncryptedLogReporting(opened.db, {
        now: () => "2026-10-12T00:00:00.000Z",
        uploadAvailable: () => true,
        writeEncryptedContext: () => {},
      });
      const transport = createSettingsTransport(
        () => ({}) as never,
        undefined,
        undefined,
        undefined,
        collector,
      );
      const ctx = {
        userId: "fixture",
        requestId: "fixture",
        source: "user" as const,
      };
      const client = createClient(ENDPOINTS, transport, ctx);
      const parsed = await client.getLogReporting({
        params: undefined,
        query: undefined,
        body: undefined,
      });
      expect(parsed.enabled).toBe(false);
      const before = await transport.request(
        ENDPOINTS.getLogReporting,
        { params: undefined, query: undefined, body: undefined },
        ctx,
      );
      expect((before as any).data.enabled).toBe(false);
      const result = await transport.request(
        ENDPOINTS.setLogReporting,
        {
          params: undefined,
          query: undefined,
          body: { enabled: true, metricsEnabled: false, consentVersion: 2 },
        },
        ctx,
      );
      expect((result as any).data.enabled).toBe(true);
      expect((result as any).data.metricsEnabled).toBe(false);
      expect(
        (
          await client.getLogReporting({
            params: undefined,
            query: undefined,
            body: undefined,
          })
        ).enabled,
      ).toBe(true);
      const captured = await client.captureObservabilityException({
        params: undefined,
        query: undefined,
        body: {
          eventId: crypto.randomUUID(),
          module: "ui",
          code: "UNCLASSIFIED_EXCEPTION",
          occurredAt: "2026-10-12T00:01:00.000Z",
          referenceId: null,
          message: "fake",
          stack: "fake",
        },
      });
      expect(captured.captured).toBe(true);
      await expect(
        transport.request(
          ENDPOINTS.getLogReporting,
          { params: undefined, query: undefined, body: undefined },
          undefined,
        ),
      ).rejects.toThrow();
    } finally {
      await opened.client.close();
    }
  });
});
