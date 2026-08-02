import {
  mkdirSync,
  mkdtempSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { gzipSync } from "node:zlib";
import { afterEach, describe, expect, it } from "vitest";

import {
  assertFileHasNoForbidden,
  assertGunzipTarHasNoForbidden,
  assertGunzipTarVerdictHardening,
  forbiddenVerdictNeedles,
  resolveWindowsInstalledRuntime,
  scanWindowsInstalledRuntime,
} from "./verdict-artifact-hardening.mjs";

function makeTarEntry(name, content) {
  const body = Buffer.from(content);
  const header = Buffer.alloc(512);
  header.write(name, 0, 100, "utf8");
  header.write(`${body.length.toString(8).padStart(11, "0")}\0`, 124, 12, "ascii");
  header[156] = 0x30;
  const padding = Buffer.alloc((512 - (body.length % 512)) % 512);
  return Buffer.concat([header, body, padding, Buffer.alloc(1024)]);
}

const roots = [];
function fixtureRoot() {
  const root = mkdtempSync(join(tmpdir(), "creatoros-verdict-scan-"));
  roots.push(root);
  return root;
}

afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

describe("T-656 verdict 最终产物扫描", () => {
  it("文件流跨 chunk 仍能命中原始 signing seed，错误不回显 seed", async () => {
    const root = fixtureRoot();
    const seed = "A".repeat(43);
    const file = join(root, "CreatorOS");
    writeFileSync(file, Buffer.concat([Buffer.alloc(65_520, 0x78), Buffer.from(seed)]));

    await expect(
      assertFileHasNoForbidden(file, forbiddenVerdictNeedles(seed)),
    ).rejects.toThrow(/raw-signing-seed/);
    try {
      await assertFileHasNoForbidden(file, forbiddenVerdictNeedles(seed));
    } catch (error) {
      expect(String(error)).not.toContain(seed);
    }
  });

  it("扫描 gunzip 后的 tar 字节而不是 gzip 压缩外壳", async () => {
    const root = fixtureRoot();
    const tarball = join(root, "sidecar.tar.gz");
    writeFileSync(
      tarball,
      gzipSync(Buffer.from("prefix-CREATOROS_SMOKE_BYPASS_VERDICT-suffix")),
    );
    await expect(
      assertGunzipTarHasNoForbidden(tarball, forbiddenVerdictNeedles("")),
    ).rejects.toThrow(/removed-smoke-bypass/);
  });

  it("sidecar tar 必须仍包含与签名 seed 配对校验过的 verdict 公钥", async () => {
    const root = fixtureRoot();
    const tarball = join(root, "sidecar.tar.gz");
    writeFileSync(
      tarball,
      gzipSync(
        makeTarEntry(
          "sidecar/frontend/.next/server/verdict-verify-key.json",
          JSON.stringify({ publicKeyB64: "public-key-b64" }),
        ),
      ),
    );
    await expect(
      assertGunzipTarVerdictHardening(
        tarball,
        forbiddenVerdictNeedles("private-seed"),
        "public-key-b64",
      ),
    ).resolves.toBeUndefined();

    await expect(
      assertGunzipTarVerdictHardening(
        tarball,
        forbiddenVerdictNeedles("private-seed"),
        "different-public-key",
      ),
    ).rejects.toThrow(/公钥与构建输入不匹配/);
    await expect(
      assertGunzipTarVerdictHardening(
        tarball,
        forbiddenVerdictNeedles("private-seed"),
        "",
      ),
    ).rejects.toThrow(/缺 CREATOROS_VERDICT_PUBKEY_B64/);
  });

  it("Windows current pointer 只允许受限单行 runtimeId，并扫描实体目录", async () => {
    const root = fixtureRoot();
    const images = join(root, "runtime-images");
    const sidecar = join(images, "runtime-20260802", "sidecar");
    mkdirSync(sidecar, { recursive: true });
    mkdirSync(join(sidecar, "frontend", ".next", "server"), {
      recursive: true,
    });
    writeFileSync(join(images, "runtime-current.txt"), "runtime-20260802\n");
    writeFileSync(join(sidecar, "server.js"), "safe-runtime");
    writeFileSync(
      join(sidecar, "frontend", ".next", "server", "verdict-verify-key.json"),
      JSON.stringify({ publicKeyB64: "public-key-b64" }),
    );

    expect(resolveWindowsInstalledRuntime(root)).toBe(sidecar);
    await expect(
      scanWindowsInstalledRuntime(root, "private-seed", "public-key-b64"),
    ).resolves.toBe(sidecar);

    await expect(
      scanWindowsInstalledRuntime(root, "private-seed", "wrong-key"),
    ).rejects.toThrow(/公钥与构建输入不匹配/);

    writeFileSync(join(images, "runtime-current.txt"), "../escape\n");
    expect(() => resolveWindowsInstalledRuntime(root)).toThrow(/非法 runtimeId/);
    writeFileSync(join(images, "runtime-current.txt"), "one\ntwo\n");
    expect(() => resolveWindowsInstalledRuntime(root)).toThrow(/只有一行/);
  });

  it("目标文件、tar 或 current runtime 缺失时 fail-closed", async () => {
    const root = fixtureRoot();
    await expect(
      assertFileHasNoForbidden(join(root, "missing"), forbiddenVerdictNeedles("x")),
    ).rejects.toThrow(/不存在/);
    await expect(
      assertGunzipTarHasNoForbidden(
        join(root, "missing.tar.gz"),
        forbiddenVerdictNeedles("x"),
      ),
    ).rejects.toThrow(/不存在/);
    expect(() => resolveWindowsInstalledRuntime(root)).toThrow(/runtime-current/);
  });
});
