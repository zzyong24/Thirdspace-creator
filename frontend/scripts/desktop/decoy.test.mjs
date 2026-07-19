// [T-399a] decoy.mjs 单测 —— 被动欺骗诱饵注入的 R2/R3/R5 机器可判性质。
//
// 覆盖:
//   R5 确定性:同 seed+版本逐字节一致;不同 seed 不同。
//   反剪枝(SA-1):诱饵间无共享业务标记(不可一 grep 批量识别);无注释、无中文(混入 minified)。
//   R2/R3:注入后零引用、未进 manifest 即报错;seed 派生 purge 精准;删除即字节等价(真实文件零改动)。
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  generateDecoys, decoyNames, injectDecoys, purgeDecoys, verifyDecoysUnreferenced,
} from "./decoy.mjs";

const SEED = "unit-seed-xyz";

describe("decoy R5 确定性", () => {
  it("同 seed → 逐字节一致;不同 seed → 不同", () => {
    expect(generateDecoys(SEED)).toEqual(generateDecoys(SEED));
    expect(generateDecoys(SEED)).not.toEqual(generateDecoys("other-seed"));
  });
  it("decoyNames 与 generateDecoys 的键一致(purge 靠名重算)", () => {
    expect(decoyNames(SEED).sort()).toEqual(Object.keys(generateDecoys(SEED)).sort());
  });
});

describe("decoy 反剪枝 / 混入 craft", () => {
  const bodies = Object.values(generateDecoys(SEED));
  it("诱饵无注释、无中文(minified static chunk 无注释,加了即异常)", () => {
    for (const b of bodies) {
      expect(b.includes("/*")).toBe(false);
      expect(/[一-鿿]/.test(b)).toBe(false);
    }
  });
  it("诱饵间无共享业务/常量标记(不可一 grep 批量识别全部诱饵)", () => {
    // 真安全属性:跨全部诱饵共享的子串里,不得含**授权锚词 / 诱饵专属结构 / 固定假常量**——
    //   否则攻击者一条 grep 即批量圈定全部诱饵后整体剪枝(SA-1 命门)。纯 JS 语法(真 chunk 也有)不算。
    const first = bodies[0];
    const shared = [];
    for (let i = 0; i <= first.length - 6; i++) {
      const sub = first.slice(i, i + 6);
      if (bodies.every((b) => b.includes(sub))) shared.push(sub);
    }
    const decoyMarker = shared.filter((s) =>
      /license|verify|entitl|grant|token|grace|expire|signat|pub|claim|1893456|604800/i.test(s),
    );
    expect(decoyMarker).toEqual([]);
    // 全局 key / 假常量应因随机化而各异(否则成批量剪标记)。
    const keys = bodies.map((b) => (b.match(/globalThis\.(\w+)=/) || [])[1]);
    expect(new Set(keys).size).toBeGreaterThan(1);
    const exps = bodies.map((b) => (b.match(/=(\d{13})/) || [])[1]);
    expect(new Set(exps).size).toBeGreaterThan(1);
  });
  it("符号名 grep 命中授权锚词(快攻污染面),但个个不同", () => {
    const hit = bodies.filter((b) => /verifyLicense|validateGrant|ensureEntitlement|checkSignature|assertLicense/.test(b));
    expect(hit.length).toBe(bodies.length);
  });
});

describe("decoy R2/R3 注入/自审/回滚(fixture 往返)", () => {
  let root;
  const chunks = () => join(root, "frontend", ".next", "static", "chunks");
  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), "decoy-"));
    mkdirSync(chunks(), { recursive: true });
    // 一个"真实" client chunk(purge 后必须原封不动)
    writeFileSync(join(chunks(), "real-3wck9vu.js"), 'globalThis.TURBOPACK||(globalThis.TURBOPACK=[]);/*real*/');
  });
  afterEach(() => rmSync(root, { recursive: true, force: true }));

  it("注入 → --verify 零引用通过;purge 后真实文件字节等价", () => {
    const realBefore = readFileSync(join(chunks(), "real-3wck9vu.js"), "utf8");
    const realCntBefore = readdirSync(chunks()).length;

    const written = injectDecoys(root, SEED);
    expect(written.length).toBeGreaterThan(0);
    expect(readdirSync(chunks()).length).toBe(realCntBefore + written.length);
    // 无 manifest / 无真实引用 → 零 problem
    expect(verifyDecoysUnreferenced(root, written)).toEqual([]);

    const purged = purgeDecoys(root, SEED);
    expect(purged).toBe(written.length);
    expect(readdirSync(chunks()).length).toBe(realCntBefore);
    expect(readFileSync(join(chunks(), "real-3wck9vu.js"), "utf8")).toBe(realBefore); // 真实文件零改动
  });

  it("若 build manifest 引用了诱饵名 → 自审报错(违 R2 会被浏览器加载)", () => {
    const names = decoyNames(SEED);
    const feNext = join(root, "frontend", ".next");
    writeFileSync(join(feNext, "build-manifest.json"), JSON.stringify({ rootMainFiles: [`static/chunks/${names[0]}`] }));
    const problems = verifyDecoysUnreferenced(root, names);
    expect(problems.length).toBeGreaterThan(0);
    expect(problems[0]).toContain(names[0]);
  });
});
