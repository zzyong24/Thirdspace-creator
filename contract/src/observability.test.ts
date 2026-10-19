import { describe, it, expect } from "vitest";
import {
  observabilityBatch,
  observabilityConfig,
  exceptionCapture,
  logReportingConsent,
  boundedExceptionContext,
} from "./observability";
describe("T1255 closed public protocol", () => {
  it("forbids remote high frequency and arbitrary receivers", () => {
    expect(
      observabilityConfig.safeParse({
        revision: 1,
        enabled: true,
        reportIntervalHours: 1,
        url: "https://evil.test",
      }).success,
    ).toBe(false);
  });
  it("does not upgrade original local consent", () => {
    expect(
      logReportingConsent.safeParse({
        enabled: true,
        metricsEnabled: true,
        consentVersion: 1,
      }).success,
    ).toBe(false);
  });
  it("forbids exception text in metric envelope", () => {
    expect(
      observabilityBatch.safeParse({
        schemaVersion: "creatoros-observability-v1",
        stack: "secret",
      }).success,
    ).toBe(false);
  });
  it("bounds encrypted exception ingress", () => {
    expect(
      exceptionCapture.safeParse({
        eventId: crypto.randomUUID(),
        module: "ui",
        code: "UNCLASSIFIED_EXCEPTION",
        occurredAt: new Date().toISOString(),
        referenceId: null,
        stack: "x".repeat(32769),
        message: "m",
      }).success,
    ).toBe(false);
  });
});

it("bounds actual Unicode and escaped JSON attachment bytes while retaining protocol identity", () => {
  const value = boundedExceptionContext({
    eventId: crypto.randomUUID(),
    module: "backend" as const,
    code: "UNCLASSIFIED_EXCEPTION",
    occurredAt: new Date().toISOString(),
    referenceId: null,
    stack: "\\\n中文💥".repeat(9000),
    message: "中文💥".repeat(3000),
  });
  expect(
    new TextEncoder().encode(JSON.stringify(value)).length,
  ).toBeLessThanOrEqual(32768);
  expect(exceptionCapture.safeParse(value).success).toBe(true);
  expect(value.module).toBe("backend");
});
