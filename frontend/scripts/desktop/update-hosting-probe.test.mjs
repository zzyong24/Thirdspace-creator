import { describe, expect, it } from "vitest";
import { probeUpdateObject, validateUpdateOrigin } from "./update-hosting-probe.mjs";

describe("增量更新静态托管探针", () => {
  it("拒绝非 HTTPS、IP、端口和带路径 origin", () => {
    for (const value of ["http://cdn.example.com", "https://127.0.0.1", "https://cdn.example.com:8443", "https://cdn.example.com/a"]) {
      expect(() => validateUpdateOrigin(value)).toThrow();
    }
  });

  it("要求 HEAD 元数据与 206 Range", async () => {
    const fetchImpl = async (_url, init) => init.method === "HEAD"
      ? new Response(null, { status: 200, headers: { "content-length": "42", etag: '"abc"' } })
      : new Response(new Uint8Array([1]), { status: 206, headers: { "content-range": "bytes 0-0/42" } });
    await expect(probeUpdateObject("https://cdn.example.com/probe.bin", fetchImpl)).resolves.toMatchObject({ range: true, contentLength: 42 });
  });
});
