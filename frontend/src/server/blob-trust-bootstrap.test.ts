import { PassThrough } from "node:stream";
import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@creatoros/backend/modules/assets", () => ({
  installBlobTrustRoot: vi.fn(),
}));
vi.mock("@creatoros/backend", () => ({
  primeMasterKeyFromInheritedFd: vi.fn(),
}));

import { installBlobTrustRoot } from "@creatoros/backend/modules/assets";
import { primeMasterKeyFromInheritedFd } from "@creatoros/backend";
import { installBlobTrustRootFromInheritedFd } from "./blob-trust-bootstrap";

describe("blob trust fd bootstrap", () => {
  it("从同一 stdin 分帧安装 blob trust 与 master key，并把后续停机哨兵留给生命周期守护", async () => {
    const stdin = new PassThrough();
    const ready = installBlobTrustRootFromInheritedFd(
      {
        CREATOROS_BLOB_SECRET_FD: "0",
        CREATOROS_MASTER_KEY_FD: "0",
      },
      { stdin, timeoutMs: 100 },
    );
    stdin.write(`BLOBV2:${"s".repeat(43)}:${"b".repeat(22)}\n`);
    stdin.write(`${Buffer.alloc(32, 7).toString("base64")}\n`);
    await ready;

    expect(installBlobTrustRoot).toHaveBeenCalledWith({
      secret: "s".repeat(43),
      bootId: "b".repeat(22),
    });
    expect(primeMasterKeyFromInheritedFd).toHaveBeenCalledWith(
      0,
      Buffer.alloc(32, 7).toString("base64"),
    );

    const later = vi.fn();
    stdin.on("data", later);
    stdin.resume();
    stdin.write("__CREATOROS_SHUTDOWN__\n");
    await vi.waitFor(() => expect(later).toHaveBeenCalled());
    expect(Buffer.concat(later.mock.calls.map(([chunk]) => Buffer.from(chunk))).toString())
      .toContain("__CREATOROS_SHUTDOWN__");
  });

  it("同一 chunk 中启动帧后的停机哨兵不会被启动读取器吞掉", async () => {
    const stdin = new PassThrough();
    const ready = installBlobTrustRootFromInheritedFd(
      { CREATOROS_BLOB_SECRET_FD: "0" },
      { stdin, timeoutMs: 100 },
    );
    stdin.write(
      `BLOBV2:${"s".repeat(43)}:${"b".repeat(22)}\n__CREATOROS_SHUTDOWN__\n`,
    );
    await ready;

    const later = vi.fn();
    stdin.on("data", later);
    stdin.resume();
    await vi.waitFor(() => expect(later).toHaveBeenCalled());
    expect(Buffer.concat(later.mock.calls.map(([chunk]) => Buffer.from(chunk))).toString())
      .toBe("__CREATOROS_SHUTDOWN__\n");
  });

  it("缺 fd、坏启动帧或主密钥帧缺失时失败关闭", async () => {
    await expect(installBlobTrustRootFromInheritedFd({})).rejects.toThrow(/required/);

    const malformed = new PassThrough();
    const malformedReady = installBlobTrustRootFromInheritedFd(
      { CREATOROS_BLOB_SECRET_FD: "0" },
      { stdin: malformed, timeoutMs: 100 },
    );
    malformed.end("known-default\n");
    await expect(malformedReady).rejects.toThrow(/invalid/);

    const missingMaster = new PassThrough();
    const missingMasterReady = installBlobTrustRootFromInheritedFd(
      {
        CREATOROS_BLOB_SECRET_FD: "0",
        CREATOROS_MASTER_KEY_FD: "0",
      },
      { stdin: missingMaster, timeoutMs: 100 },
    );
    missingMaster.end(`BLOBV2:${"s".repeat(43)}:${"b".repeat(22)}\n`);
    await expect(missingMasterReady).rejects.toThrow(/master key|stdin/i);
  });
});
