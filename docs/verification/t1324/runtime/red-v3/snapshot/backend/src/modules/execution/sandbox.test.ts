import { describe, it, expect, beforeEach, afterEach } from "vitest";
import * as fs from "node:fs/promises";
import * as os from "node:os";
import * as path from "node:path";
import {
  createSandbox,
  cleanupSandbox,
  harvestArtifacts,
  materializeInputs,
  readArtifactBytes,
  pruneSandboxIntermediates,
  resolveInsideDir,
  resolveWorkspacesRoot,
  sandboxDirFor,
  sweepInterruptedRenderFrames,
  sweepOrphanSandboxes,
  mimeForFileName,
  SandboxPathViolation,
  SandboxOutputLimitError,
} from "./sandbox";
import { isSensitiveFileName } from "./sensitive-files";

// [T-255a] 沙箱单测:物化/路径穿越防护/denylist/收割硬顶/清理/孤儿清扫。真临时目录跑。

let root: string;
beforeEach(async () => {
  root = await fs.mkdtemp(path.join(os.tmpdir(), "exec-sandbox-"));
});
afterEach(async () => {
  await fs.rm(root, { recursive: true, force: true });
});

const bytesOf = (s: string) => new TextEncoder().encode(s);

describe("resolveWorkspacesRoot", () => {
  it("uses env override, else ~/CreatorOS/workspaces", () => {
    expect(resolveWorkspacesRoot({ CREATOROS_WORKSPACES_ROOT: "/tmp/ws" })).toBe(
      path.resolve("/tmp/ws"),
    );
    expect(resolveWorkspacesRoot({})).toBe(
      path.join(os.homedir(), "CreatorOS", "workspaces"),
    );
  });
});

describe("path guards", () => {
  it("rejects malicious taskIds", () => {
    for (const bad of ["../up", "a/b", "", "a b", "..", "a\0b"]) {
      expect(() => sandboxDirFor(root, bad)).toThrow(SandboxPathViolation);
    }
    expect(sandboxDirFor(root, "ai-task-1")).toBe(
      path.join(path.resolve(root), "ai-task-1"),
    );
  });

  it("resolveInsideDir blocks traversal / absolute / NUL", () => {
    expect(() => resolveInsideDir(root, "../etc/passwd")).toThrow(
      SandboxPathViolation,
    );
    expect(() => resolveInsideDir(root, "/etc/passwd")).toThrow(
      SandboxPathViolation,
    );
    expect(() => resolveInsideDir(root, "a\0b")).toThrow(SandboxPathViolation);
    expect(() => resolveInsideDir(root, "a/../../b")).toThrow(
      SandboxPathViolation,
    );
    expect(resolveInsideDir(root, "sub/file.txt")).toBe(
      path.join(path.resolve(root), "sub", "file.txt"),
    );
  });
});

describe("sensitive denylist", () => {
  it("matches .env family / *key* / *secret* / credentials", () => {
    for (const bad of [
      ".env",
      ".ENV.local",
      "api-key.txt",
      "MY_SECRETS.json",
      "credentials.json",
      "id_rsa",
      "access_token.txt",
    ]) {
      expect(isSensitiveFileName(bad), bad).toBe(true);
    }
    for (const ok of ["manifest.json", "clip.mp4", "字幕.srt", "notes.md"]) {
      expect(isSensitiveFileName(ok), ok).toBe(false);
    }
  });
});

describe("materializeInputs", () => {
  it("writes read-only files under input/ and reports sizes", async () => {
    const sandbox = await createSandbox(root, "t1");
    const materialized = await materializeInputs(
      sandbox,
      [{ assetId: "a1", mountAs: "clips/raw.mp4" }],
      async (_assetId, destinationPath) => {
        await fs.writeFile(destinationPath, bytesOf("fake-video"));
        return { size: 10, mimeType: "video/mp4" };
      },
    );
    expect(materialized).toEqual([
      { assetId: "a1", mountAs: "clips/raw.mp4", size: 10, mimeType: "video/mp4" },
    ]);
    const abs = path.join(sandbox.inputDir, "clips", "raw.mp4");
    expect(await fs.readFile(abs, "utf8")).toBe("fake-video");
    const mode = (await fs.stat(abs)).mode & 0o777;
    expect(mode & 0o222).toBe(0); // 无写位 = 只读物化
  });

  it("rejects traversal mountAs and sensitive filenames", async () => {
    const sandbox = await createSandbox(root, "t2");
    await expect(
      materializeInputs(sandbox, [{ assetId: "a", mountAs: "../../evil" }], async () => ({
        size: 1,
        mimeType: "text/plain",
      })),
    ).rejects.toThrow(SandboxPathViolation);
    await expect(
      materializeInputs(sandbox, [{ assetId: "a", mountAs: "api-key.txt" }], async () => ({
        size: 1,
        mimeType: "text/plain",
      })),
    ).rejects.toThrow(SandboxPathViolation);
  });

  it("fails honestly when the asset has no bytes", async () => {
    const sandbox = await createSandbox(root, "t3");
    await expect(
      materializeInputs(sandbox, [{ assetId: "gone", mountAs: "a.txt" }], async () => null),
    ).rejects.toThrow(/输入资产读取失败/);
  });
});

describe("harvestArtifacts", () => {
  it("collects files recursively, skips symlinks + sensitive names, stable order", async () => {
    const sandbox = await createSandbox(root, "t4");
    await fs.mkdir(path.join(sandbox.outDir, "sub"), { recursive: true });
    await fs.writeFile(path.join(sandbox.outDir, "manifest.json"), "{}");
    await fs.writeFile(path.join(sandbox.outDir, "sub", "b.txt"), "bb");
    await fs.writeFile(path.join(sandbox.outDir, "api-key.txt"), "nope");
    await fs.symlink("/etc/hosts", path.join(sandbox.outDir, "link.txt"));
    const artifacts = await harvestArtifacts(sandbox, { maxOutputMB: 1 });
    expect(artifacts.map((a) => a.path)).toEqual(["manifest.json", "sub/b.txt"]);
    expect(artifacts[0]!.mimeType).toBe("application/json");
    expect(artifacts[1]!.size).toBe(2);
  });

  it("throws SandboxOutputLimitError over maxOutputMB", async () => {
    const sandbox = await createSandbox(root, "t5");
    await fs.writeFile(
      path.join(sandbox.outDir, "big.bin"),
      Buffer.alloc(1024 * 1024 + 1),
    );
    await expect(harvestArtifacts(sandbox, { maxOutputMB: 1 })).rejects.toThrow(
      SandboxOutputLimitError,
    );
  });
});

describe("readArtifactBytes / cleanupSandbox / sweepOrphanSandboxes", () => {
  it("reads inside out/ only; missing → null; cleanup removes dir", async () => {
    const sandbox = await createSandbox(root, "t6");
    await fs.writeFile(path.join(sandbox.outDir, "m.json"), "{}");
    expect(await readArtifactBytes(root, "t6", "m.json")).not.toBeNull();
    expect(await readArtifactBytes(root, "t6", "missing.json")).toBeNull();
    await expect(readArtifactBytes(root, "t6", "../input/x")).rejects.toThrow(
      SandboxPathViolation,
    );
    await cleanupSandbox(root, "t6");
    expect(await fs.stat(sandbox.dir).catch(() => null)).toBeNull();
    await cleanupSandbox(root, "t6"); // 幂等
  });

  it("sweeps only stale sandboxes (>maxAge)", async () => {
    await createSandbox(root, "old-task");
    await createSandbox(root, "new-task");
    const past = new Date(Date.now() - 8 * 24 * 60 * 60 * 1000);
    await fs.utimes(path.join(root, "old-task"), past, past);
    const removed = await sweepOrphanSandboxes(root, {
      maxAgeMs: 7 * 24 * 60 * 60 * 1000,
    });
    expect(removed).toBe(1);
    expect(await fs.stat(path.join(root, "old-task")).catch(() => null)).toBeNull();
    expect(await fs.stat(path.join(root, "new-task")).catch(() => null)).not.toBeNull();
  });

  it("[T-869 RED] keeps only confirmable outputs after a successful execution", async () => {
    const sandbox = await createSandbox(root, "render-success");
    await fs.writeFile(path.join(sandbox.inputDir, "source.mov"), "source");
    await fs.mkdir(path.join(sandbox.dir, "work", "work-render", "captured-frames"), {
      recursive: true,
    });
    await fs.writeFile(
      path.join(sandbox.dir, "work", "work-render", "captured-frames", "frame_000001.jpg"),
      "frame",
    );
    await fs.writeFile(path.join(sandbox.dir, "work", "render_raw.mp4"), "raw");
    await fs.writeFile(path.join(sandbox.outDir, "final.mp4"), "final");

    await pruneSandboxIntermediates(root, "render-success");

    expect(await fs.stat(sandbox.inputDir).catch(() => null)).toBeNull();
    expect(await fs.stat(path.join(sandbox.dir, "work")).catch(() => null)).toBeNull();
    expect(await fs.readFile(path.join(sandbox.outDir, "final.mp4"), "utf8")).toBe("final");
  });

  it("[T-869 RED] removes interrupted HyperFrames frame directories on startup without touching outputs", async () => {
    const interrupted = await createSandbox(root, "render-interrupted");
    const framesDir = path.join(
      interrupted.dir,
      "work",
      "work-render-abcd",
      "captured-frames",
    );
    await fs.mkdir(framesDir, { recursive: true });
    await fs.writeFile(path.join(framesDir, "frame_000001.jpg"), "frame");
    await fs.writeFile(path.join(interrupted.outDir, "partial-diagnostic.txt"), "keep");

    const result = await sweepInterruptedRenderFrames(root);

    expect(result).toEqual({ directoriesRemoved: 1, filesRemoved: 1, bytesRemoved: 5 });
    expect(await fs.stat(framesDir).catch(() => null)).toBeNull();
    expect(
      await fs.readFile(path.join(interrupted.outDir, "partial-diagnostic.txt"), "utf8"),
    ).toBe("keep");
  });
});

describe("mimeForFileName", () => {
  it("maps known extensions and returns null for unknown", () => {
    expect(mimeForFileName("a.mp4")).toBe("video/mp4");
    expect(mimeForFileName("a.SRT")).toBe("application/x-subrip");
    expect(mimeForFileName("a.weird")).toBeNull();
  });
});
it("T-850 沙箱透传精确文件并核验实际字节摘要",async()=>{
 const {createHash}=await import("node:crypto");const data=bytesOf("原始冻结视频"),fileDigest=createHash("sha256").update(data).digest("hex");
 const sandbox=await createSandbox(root,"frozen-media");let received:unknown;
 const input={assetId:"a",assetFileId:"history-file",fileDigest,mountAs:"instance.mp4"};
 await materializeInputs(sandbox,[input],async(_id,dest,exact)=>{received=exact;await fs.writeFile(dest,data);return {size:data.length,mimeType:"video/mp4"};});
 expect(received).toEqual({assetFileId:"history-file",fileDigest});
 await expect(materializeInputs(sandbox,[{...input,mountAs:"corrupt.mp4"}],async(_id,dest)=>{await fs.writeFile(dest,"不同文件");return {size:12,mimeType:"video/mp4"};})).rejects.toThrow("字节");
});
