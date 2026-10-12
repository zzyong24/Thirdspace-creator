import { describe, it, expect, vi } from "vitest";
const mocks = vi.hoisted(() => ({
  trusted: vi.fn(),
  resolve: vi.fn(),
  capture: vi.fn(),
}));
vi.mock("@/lib/loopback-guard.server", () => ({
  isTrustedLocalRequest: mocks.trusted,
  loopbackForbidden: () =>
    Response.json({ error: "forbidden" }, { status: 403 }),
}));
vi.mock("@/lib/request-context.server", () => ({
  resolveRequestContext: mocks.resolve,
}));
vi.mock("../../auth/_session", () => ({ readSessionCookie: () => null }));
vi.mock("@/server/persistence-client", () => ({
  getObservabilityCollector: async () => ({ recordException: mocks.capture }),
}));
import { POST } from "./route";
const event = {
  eventId: crypto.randomUUID(),
  module: "ui",
  code: "UNCLASSIFIED_EXCEPTION",
  occurredAt: "2026-10-12T00:00:00.000Z",
  referenceId: null,
  stack: "fake fixture stack",
  message: "fake fixture message",
};
describe("T1255 actual local exception route", () => {
  it("forbids untrusted and invalid identity before collector", async () => {
    mocks.trusted.mockReturnValue(false);
    expect(
      (
        await POST(
          new Request("http://127.0.0.1/api/v1/local/observability", {
            method: "POST",
            body: JSON.stringify(event),
          }),
        )
      ).status,
    ).toBe(403);
    expect(mocks.capture).not.toHaveBeenCalled();
    mocks.trusted.mockReturnValue(true);
    mocks.resolve.mockRejectedValueOnce(Error("invalid"));
    expect(
      (
        await POST(
          new Request("http://127.0.0.1/api/v1/local/observability", {
            method: "POST",
            body: JSON.stringify(event),
          }),
        )
      ).status,
    ).toBe(401);
  });
  it("rejects streamed oversize and closed fields, accepts exact fake event", async () => {
    mocks.trusted.mockReturnValue(true);
    mocks.resolve.mockResolvedValue({
      userId: "local",
      requestId: "fixture",
      source: "user",
    });
    mocks.capture.mockResolvedValue(true);
    for (const body of [
      JSON.stringify({ ...event, path: "/private/file" }),
      "x".repeat(32769),
    ]) {
      const response = await POST(
        new Request("http://127.0.0.1/api/v1/local/observability", {
          method: "POST",
          body,
        }),
      );
      expect([413, 422]).toContain(response.status);
    }
    expect(mocks.capture).not.toHaveBeenCalled();
    const response = await POST(
      new Request("http://127.0.0.1/api/v1/local/observability", {
        method: "POST",
        body: JSON.stringify(event),
      }),
    );
    expect(await response.json()).toEqual({ captured: true });
    expect(mocks.capture).toHaveBeenCalledTimes(1);
  });
});
