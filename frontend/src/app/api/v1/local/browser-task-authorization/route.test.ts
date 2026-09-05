import { beforeEach, it, expect, vi } from "vitest";
const mocks = vi.hoisted(() => ({
  grant: vi.fn(),
  resolve: vi.fn(),
  selection: vi.fn(),
}));
vi.mock("@/lib/loopback-guard.server", () => ({
  isTrustedLocalRequest: () => true,
  loopbackForbidden: () =>
    Response.json({ error: "forbidden" }, { status: 403 }),
}));
vi.mock("@/lib/request-context.server", () => ({
  readRequestAccountSelection: mocks.selection,
  resolveRequestContext: mocks.resolve,
  isAuthError: (e: any) => e?.name === "AuthenticationError",
  isOwnershipError: (e: any) => e?.name === "OwnershipError",
}));
vi.mock("../../auth/_session", () => ({ readSessionCookie: () => "session" }));
vi.mock("@/server/persistence-client", () => ({
  getBrowserTaskAuthorizationRuntime: async () => ({ grant: mocks.grant }),
}));
import { POST } from "./route";
beforeEach(() => {
  vi.clearAllMocks();
  mocks.grant.mockResolvedValue({ status: "granted" });
  mocks.resolve.mockResolvedValue({ userId: "u", accountId: "a" });
  mocks.selection.mockReturnValue({ mismatch: false, effectiveAccountId: "a" });
});
function request(
  headers: Record<string, string> = { origin: "http://localhost:3000" },
) {
  return new Request(
    "http://localhost:3000/api/v1/local/browser-task-authorization",
    {
      method: "POST",
      headers,
      body: JSON.stringify({
        taskId: "task",
        authorization: {
          allowedDomains: ["example.com"],
          allowInteraction: false,
        },
        idempotencyKey: "k",
      }),
    },
  );
}
it.each([
  {},
  { origin: "http://localhost:3001" },
  { origin: "https://evil.example" },
  { origin: "http://localhost:3000", "x-creatoros-cli-access": "anything" },
])("缺同源UI来源或CLI调用不得授权 %j", async (headers) => {
  expect((await POST(request(headers as Record<string, string>))).status).toBe(
    403,
  );
  expect(mocks.grant).not.toHaveBeenCalled();
});
it("真实账号上下文传到命名服务，cookie失效不降级", async () => {
  expect((await POST(request())).status).toBe(200);
  expect(mocks.resolve).toHaveBeenCalledWith("session", "a", {
    rejectInvalidToken: true,
  });
  expect(mocks.grant).toHaveBeenCalledWith(
    { userId: "u", accountId: "a" },
    "task",
    expect.objectContaining({ idempotencyKey: "k" }),
  );
});
it("账号切换冲突先拒绝", async () => {
  mocks.selection.mockReturnValue({ mismatch: true });
  expect((await POST(request())).status).toBe(409);
  expect(mocks.grant).not.toHaveBeenCalled();
});
