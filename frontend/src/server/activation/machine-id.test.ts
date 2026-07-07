import { describe, it, expect } from "vitest";
import { resolveMachineId, type MachineIdFs } from "./machine-id";

// T-147 P5 —— 机器指纹解析单测。fs 注内存桩,零磁盘。
// 覆盖:Rust 注入优先 / 落盘回退首次生成+持久 / 二次读回同值 / 空注入走回退。

function memFs(seed: Record<string, string> = {}): {
  fs: MachineIdFs;
  store: Record<string, string>;
  writes: number;
} {
  const store: Record<string, string> = { ...seed };
  let writes = 0;
  const fs: MachineIdFs = {
    readFile: async (p) => (p in store ? store[p]! : null),
    writeFile: async (p, c) => {
      store[p] = c;
      writes++;
    },
  };
  return {
    fs,
    store,
    get writes() {
      return writes;
    },
  } as { fs: MachineIdFs; store: Record<string, string>; writes: number };
}

describe("resolveMachineId", () => {
  it("Rust 注入的指纹优先直接用(不落盘)", async () => {
    const { fs } = memFs();
    const id = await resolveMachineId({
      injectedMachineId: "rust-fingerprint-abc",
      persistPath: "/x/machine-id",
      fs,
    });
    expect(id).toBe("rust-fingerprint-abc");
  });

  it("无注入 → 落盘回退:首次生成并写盘", async () => {
    const mem = memFs();
    const id = await resolveMachineId({
      persistPath: "/x/machine-id",
      fs: mem.fs,
      generateId: () => "fixed-uuid",
    });
    expect(id).toHaveLength(32); // sha256 前 32 hex
    expect(mem.store["/x/machine-id"]).toBe(id);
  });

  it("二次解析读回同一值(持久稳定)", async () => {
    const mem = memFs();
    const first = await resolveMachineId({
      persistPath: "/x/machine-id",
      fs: mem.fs,
      generateId: () => "uuid-1",
    });
    const second = await resolveMachineId({
      persistPath: "/x/machine-id",
      fs: mem.fs,
      generateId: () => "uuid-2-should-not-be-used",
    });
    expect(second).toBe(first);
  });

  it("注入空串 → 走回退", async () => {
    const mem = memFs();
    const id = await resolveMachineId({
      injectedMachineId: "   ",
      persistPath: "/x/machine-id",
      fs: mem.fs,
      generateId: () => "uuid-x",
    });
    expect(id).not.toBe("   ");
    expect(id).toHaveLength(32);
  });
});
