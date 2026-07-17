// [T-366b] 素材包导出纯函数层单测:
//   - crc32 已知向量;store zip 结构可解(局部头/中央目录/EOCD/CRC/字节还原/UTF-8 名);
//   - 编导说明 readme:有决策 → 人话分场/信息卡/B-roll/字幕;无决策 → §5.1② 空态诚实;
//   - manifest:清单行 + 读取失败诚实列出;
//   - aggregateMaterialExport:stub ports 聚合(全素材 + 口播稿 + readme + manifest)。

import { describe, it, expect } from "vitest";
import type { RequestContext } from "@creatoros/contract";
import {
  crc32,
  buildStoreZip,
  coerceDecisions,
  renderDirectorReadme,
  renderManifest,
  sanitizeZipName,
  aggregateMaterialExport,
  MATERIAL_EXPORT_HONESTY_NOTE,
  NO_DECISIONS_NOTE,
  type MaterialExportPorts,
  type DecisionsShape,
} from "./material-export";

const NOW = "2026-07-17T08:00:00.000Z";
const enc = new TextEncoder();
const dec = new TextDecoder();

// ── zip 结构解析辅助(测试专用最小 reader:按 EOCD → 中央目录 → 局部头还原)────

function u16(b: Uint8Array, off: number): number {
  return b[off]! | (b[off + 1]! << 8);
}
function u32(b: Uint8Array, off: number): number {
  return (
    (b[off]! | (b[off + 1]! << 8) | (b[off + 2]! << 16) | (b[off + 3]! << 24)) >>>
    0
  );
}

interface ParsedEntry {
  name: string;
  crc: number;
  bytes: Uint8Array;
  flags: number;
}

function parseStoreZip(zip: Uint8Array): ParsedEntry[] {
  // EOCD 定长 22(无 comment)且我们不写 comment → 直接取末 22 字节。
  const eocd = zip.length - 22;
  expect(u32(zip, eocd)).toBe(0x0605_4b50);
  const count = u16(zip, eocd + 10);
  const cdOffset = u32(zip, eocd + 16);
  const out: ParsedEntry[] = [];
  let off = cdOffset;
  for (let i = 0; i < count; i++) {
    expect(u32(zip, off)).toBe(0x0201_4b50);
    const flags = u16(zip, off + 8);
    const crc = u32(zip, off + 16);
    const size = u32(zip, off + 24);
    const nameLen = u16(zip, off + 28);
    const localOff = u32(zip, off + 42);
    const name = dec.decode(zip.subarray(off + 46, off + 46 + nameLen));
    // 局部头校验 + 数据还原(store:数据紧跟 [30+nameLen])。
    expect(u32(zip, localOff)).toBe(0x0403_4b50);
    const lNameLen = u16(zip, localOff + 26);
    const lExtraLen = u16(zip, localOff + 28);
    const dataOff = localOff + 30 + lNameLen + lExtraLen;
    out.push({
      name,
      crc,
      flags,
      bytes: zip.subarray(dataOff, dataOff + size),
    });
    off += 46 + nameLen;
  }
  return out;
}

describe("crc32 / buildStoreZip", () => {
  it("crc32 已知向量('123456789' → 0xCBF43926)", () => {
    expect(crc32(enc.encode("123456789"))).toBe(0xcbf4_3926);
  });

  it("store zip 结构完整:可按中央目录解出全部条目,字节还原一致,CRC 对得上,UTF-8 中文名", () => {
    const entries = [
      { name: "素材/粗剪.mp4", bytes: enc.encode("fake-mp4-bytes") },
      { name: "口播稿.md", bytes: enc.encode("大家好,今天讲上下文工程。") },
      { name: "manifest.txt", bytes: new Uint8Array([0, 1, 2, 255]) },
    ];
    const zip = buildStoreZip(entries, NOW);
    const parsed = parseStoreZip(zip);
    expect(parsed.map((p) => p.name)).toEqual(entries.map((e) => e.name));
    for (const [i, p] of parsed.entries()) {
      expect(Array.from(p.bytes)).toEqual(Array.from(entries[i]!.bytes));
      expect(p.crc).toBe(crc32(entries[i]!.bytes));
      // UTF-8 名标志(bit11)必须置位,否则中文名在解压器里乱码。
      expect(p.flags & 0x0800).toBe(0x0800);
    }
  });

  it("空条目也产合法 zip(EOCD 计数 0)", () => {
    const zip = buildStoreZip([], NOW);
    expect(parseStoreZip(zip)).toEqual([]);
  });
});

describe("sanitizeZipName", () => {
  it("清路径分隔与穿越前缀,空名给占位", () => {
    expect(sanitizeZipName("../../etc/passwd")).toBe("_.._etc_passwd");
    expect(sanitizeZipName("a/b\\c:d.mp4")).toBe("a_b_c_d.mp4");
    expect(sanitizeZipName("   ")).toBe("未命名文件");
  });
});

const DECISIONS: DecisionsShape = {
  scenes: [
    { title: "开场", startSec: 0, endSec: 10, summary: "抛出问题" },
    { title: "论证", startSec: 10, endSec: 70, summary: "三个证据" },
  ],
  cards: [{ sceneIdx: 0, kind: "quote", content: "模型只看得到窗口", at: 2 }],
  broll: [{ sceneIdx: 1, assetId: "asset-broll-1", at: 14, durationSec: 3 }],
  subtitles: [{ index: 1, startSec: 0, endSec: 5, zh: "大家好", en: "Hello" }],
};

describe("renderDirectorReadme", () => {
  it("有决策 → 人话分场 + 信息卡/B-roll 几秒出放什么 + 字幕校正稿 + 诚实门头", () => {
    const md = renderDirectorReadme({
      projectTitle: "上下文工程",
      decisions: DECISIONS,
      assetNames: new Map([["asset-broll-1", "素材/演示.mp4"]]),
      nowIso: NOW,
    });
    expect(md).toContain(MATERIAL_EXPORT_HONESTY_NOTE);
    expect(md).toContain("第 1 场 开场(00:00 – 00:10)");
    expect(md).toContain("第 2 秒出「quote」卡 —— 模型只看得到窗口");
    expect(md).toContain("第 14 秒起插入素材「素材/演示.mp4」(见素材包),持续约 3 秒");
    expect(md).toContain("字幕校正稿(双语)");
    expect(md).toContain("[00:00–00:05] 大家好 / Hello");
    expect(md).not.toContain(NO_DECISIONS_NOTE);
  });

  it("无决策 → §5.1② 空态诚实:明写未跑四决策,只指素材清单,不渲空分场段", () => {
    const md = renderDirectorReadme({
      projectTitle: "上下文工程",
      decisions: null,
      assetNames: new Map(),
      nowIso: NOW,
    });
    expect(md).toContain(NO_DECISIONS_NOTE);
    expect(md).toContain("manifest.txt");
    expect(md).not.toContain("## 分场");
    expect(md).not.toContain("字幕校正稿");
  });

  it("B-roll 引用不在包内的素材 → 诚实标注可能已删除", () => {
    const md = renderDirectorReadme({
      projectTitle: "t",
      decisions: DECISIONS,
      assetNames: new Map(),
      nowIso: NOW,
    });
    expect(md).toContain("不在本包内,可能已删除");
  });
});

describe("coerceDecisions", () => {
  it("合法形状收窄;缺 scenes / 非对象 → null(诚实空态,不硬渲)", () => {
    expect(coerceDecisions(DECISIONS)).not.toBeNull();
    expect(coerceDecisions(null)).toBeNull();
    expect(coerceDecisions({})).toBeNull();
    expect(coerceDecisions({ scenes: [] })).toBeNull();
    expect(coerceDecisions({ scenes: [{ bad: true }] })).toBeNull();
  });
});

describe("renderManifest", () => {
  it("清单行(文件名|是什么|来源)+ 读取失败诚实列出", () => {
    const text = renderManifest({
      included: [
        { fileName: "素材/a.mp4", kind: "粗剪人物视频", source: "素材库 asset a1" },
      ],
      missing: [{ name: "b.mp4", reason: "字节读取失败" }],
      nowIso: NOW,
    });
    expect(text).toContain("素材/a.mp4 | 粗剪人物视频 | 素材库 asset a1");
    expect(text).toContain("读取失败,未打包");
    expect(text).toContain("b.mp4 | 字节读取失败");
  });
});

// ── aggregateMaterialExport(stub ports)─────────────────────────────────────

const CTX = { userId: "u1", accountId: "acc1", requestId: "r1" } as RequestContext;

function makePorts(overrides: Partial<MaterialExportPorts> = {}): MaterialExportPorts {
  return {
    listMaterialAssets: async () => [
      { assetId: "a-clip", role: "clip" },
      { assetId: "a-srt", role: "reference" },
      { assetId: "a-broll", role: "broll" },
    ],
    getAssetName: async (_c, id) =>
      ({ "a-clip": "粗剪.mp4", "a-srt": "字幕.srt", "a-broll": "演示.mp4" })[id] ??
      null,
    getAssetBytes: async (_c, id) => ({ bytes: enc.encode(`bytes-of-${id}`) }),
    getScriptText: async () => "大家好,今天讲上下文工程。",
    // broll 决策指向本项目素材 a-broll(readme 才能把它映射成包内文件名)。
    getVideoDecisions: async () => ({
      ...DECISIONS,
      broll: [{ sceneIdx: 1, assetId: "a-broll", at: 14, durationSec: 3 }],
    }),
    getProjectTitle: async () => "上下文工程",
    ...overrides,
  };
}

describe("aggregateMaterialExport", () => {
  it("聚合全素材 + 口播稿 + readme + manifest 成 zip;readme 的 B-roll 指到包内文件", async () => {
    const bundle = await aggregateMaterialExport(
      CTX,
      { projectId: "p1", nowIso: NOW },
      makePorts(),
    );
    expect(bundle.hasDecisions).toBe(true);
    expect(bundle.zipFileName).toBe("素材包-上下文工程-20260717.zip");
    const files = parseStoreZip(bundle.zipBytes);
    const names = files.map((f) => f.name);
    expect(names).toEqual([
      "素材/粗剪.mp4",
      "素材/字幕.srt",
      "素材/演示.mp4",
      "口播稿.md",
      "README-编导说明.md",
      "manifest.txt",
    ]);
    expect(bundle.fileCount).toBe(6);
    expect(bundle.totalBytes).toBe(bundle.zipBytes.length);
    // 素材字节原样进包。
    expect(dec.decode(files[0]!.bytes)).toBe("bytes-of-a-clip");
    // readme B-roll 指向包内文件名(不是裸 assetId)。
    const readme = dec.decode(files[4]!.bytes);
    expect(readme).toContain("素材「素材/演示.mp4」(见素材包)");
    // manifest 覆盖包内全部文件(含 readme/manifest 自身)。
    const manifest = dec.decode(files[5]!.bytes);
    for (const n of names) expect(manifest).toContain(n);
  });

  it("没跑四决策 → hasDecisions=false,readme 空态诚实(§5.1②)", async () => {
    const bundle = await aggregateMaterialExport(
      CTX,
      { projectId: "p1", nowIso: NOW },
      makePorts({ getVideoDecisions: async () => null }),
    );
    expect(bundle.hasDecisions).toBe(false);
    const files = parseStoreZip(bundle.zipBytes);
    const readme = dec.decode(
      files.find((f) => f.name.startsWith("README"))!.bytes,
    );
    expect(readme).toContain(NO_DECISIONS_NOTE);
    expect(readme).not.toContain("## 分场");
    // manifest 标注 readme 是空态说明,不冒充完整编导说明。
    const manifest = dec.decode(
      files.find((f) => f.name === "manifest.txt")!.bytes,
    );
    expect(manifest).toContain("未跑四决策");
  });

  it("单个素材读不出字节 → 跳过打包但 manifest 诚实列出;无口播稿 → 不塞空文件", async () => {
    const bundle = await aggregateMaterialExport(
      CTX,
      { projectId: "p1", nowIso: NOW },
      makePorts({
        getAssetBytes: async (_c, id) =>
          id === "a-broll" ? null : { bytes: enc.encode(`bytes-of-${id}`) },
        getScriptText: async () => "",
      }),
    );
    const files = parseStoreZip(bundle.zipBytes);
    const names = files.map((f) => f.name);
    expect(names).not.toContain("素材/演示.mp4");
    expect(names).not.toContain("口播稿.md");
    const manifest = dec.decode(
      files.find((f) => f.name === "manifest.txt")!.bytes,
    );
    expect(manifest).toContain("读取失败,未打包");
    expect(manifest).toContain("演示.mp4 | 字节读取失败");
  });

  it("同名素材去重(-2 后缀),不静默互相覆盖", async () => {
    const bundle = await aggregateMaterialExport(
      CTX,
      { projectId: "p1", nowIso: NOW },
      makePorts({
        listMaterialAssets: async () => [
          { assetId: "x1", role: "broll" },
          { assetId: "x2", role: "broll" },
        ],
        getAssetName: async () => "同名.mp4",
      }),
    );
    const names = parseStoreZip(bundle.zipBytes).map((f) => f.name);
    expect(names).toContain("素材/同名.mp4");
    expect(names).toContain("素材/同名-2.mp4");
  });
});
