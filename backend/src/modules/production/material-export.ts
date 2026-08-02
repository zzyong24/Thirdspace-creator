// [T-366b] 素材包统一导出(SPEC 2026-07-17 §4.2)—— 纯函数层:
//   - store-mode zip 打包(零依赖手搓;见 buildStoreZip 注释的选型说明);
//   - 编导说明 readme(video_decisions 候选 → 人话 markdown,非 JSON dump);
//   - manifest.txt(文件名 → 是什么 → 来源);
//   - aggregateMaterialExport 编排(经注入 ports 取数,可 stub 单测,不碰 db)。
//
// 诚实门(VP-05 / §5.1②):
//   - readme 头明写「原素材 + 编导说明,供手动在剪映等工具重建,不是可一键导入的剪映工程」;
//   - 项目没跑四决策 → readme 明写空态,只出素材清单,不给空段冒充完整说明;
//   - 单个素材读不出字节 → 跳过打包但在 manifest 里写明「读取失败,未打包」,不无声吞。
//
// P-04 本地打包不出网:全部字节在进程内组装,产物经 AssetsService 落本地/用户配置的
// 对象存储,由既有签名下载 URL 通道给前端。

import type { RequestContext } from "@creatoros/contract";

// ── zip(store 模式,零依赖)────────────────────────────────────────────────────
//
// 选型说明(SPEC §5 待决点 3):仓内无直接 zip 依赖(jszip/adm-zip 只是 exceljs/mammoth
// 等的传递依赖,pnpm 下不可直接 import);而素材主体是 mp4/mov/图片 —— 本就是压缩过的
// 字节,deflate 再压收益≈0。故手搓 **store 模式(method=0,不压缩)** zip 容器:
// 局部文件头 + 中央目录 + EOCD,~100 行、结构可单测、不给桌面打包链引新依赖
// (Tauri sidecar 打包对新依赖的解析坑见 docs/engineering-notes)。文件名走 UTF-8
// (通用位标志 bit11),中文名在 macOS/Windows 解压器下正确显示。
// 上限诚实:单文件/总偏移超 4GB 或条目数超 65535 需 zip64 —— 不支持,直接报错引导分批。

export interface ZipEntry {
  /** zip 内文件名(UTF-8,不含目录前缀之外的路径穿越)。 */
  name: string;
  bytes: Uint8Array;
}

const ZIP32_MAX = 0xffff_ffff;
const ZIP_MAX_ENTRIES = 0xffff;

/** 标准 CRC-32(IEEE 802.3 反射多项式 0xEDB88320),查表实现。 */
export function crc32(bytes: Uint8Array): number {
  let crc = 0xffff_ffff;
  for (let i = 0; i < bytes.length; i++) {
    crc ^= bytes[i]!;
    for (let k = 0; k < 8; k++) {
      crc = (crc >>> 1) ^ (0xedb8_8320 & -(crc & 1));
    }
  }
  return (crc ^ 0xffff_ffff) >>> 0;
}

/** ISO 时间 → DOS date/time 对(zip 头用;解析失败回退 1980-01-01)。 */
function dosDateTime(iso: string): { date: number; time: number } {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime()) || d.getFullYear() < 1980) {
    return { date: (1 << 5) | 1, time: 0 }; // 1980-01-01 00:00:00
  }
  const date =
    ((d.getFullYear() - 1980) << 9) | ((d.getMonth() + 1) << 5) | d.getDate();
  const time =
    (d.getHours() << 11) | (d.getMinutes() << 5) | (d.getSeconds() >> 1);
  return { date, time };
}

class ByteWriter {
  private chunks: Uint8Array[] = [];
  private len = 0;
  get length(): number {
    return this.len;
  }
  u16(v: number): void {
    this.push(new Uint8Array([v & 0xff, (v >>> 8) & 0xff]));
  }
  u32(v: number): void {
    this.push(
      new Uint8Array([
        v & 0xff,
        (v >>> 8) & 0xff,
        (v >>> 16) & 0xff,
        (v >>> 24) & 0xff,
      ]),
    );
  }
  push(bytes: Uint8Array): void {
    this.chunks.push(bytes);
    this.len += bytes.length;
  }
  concat(): Uint8Array {
    const out = new Uint8Array(this.len);
    let off = 0;
    for (const c of this.chunks) {
      out.set(c, off);
      off += c.length;
    }
    return out;
  }
}

const UTF8_FLAG = 0x0800; // 通用位标志 bit11:文件名按 UTF-8 解释(中文名必需)。

/**
 * store 模式 zip:每条 [local header + name + data],尾接中央目录 + EOCD。
 * 超 zip32 上限(4GB / 65535 条)诚实抛错(不产坏包)。
 */
export function buildStoreZip(entries: ZipEntry[], nowIso: string): Uint8Array {
  if (entries.length > ZIP_MAX_ENTRIES) {
    throw new Error(`素材包条目数超出 zip 上限(${ZIP_MAX_ENTRIES}),请精简素材后重试`);
  }
  const { date, time } = dosDateTime(nowIso);
  const enc = new TextEncoder();
  const w = new ByteWriter();
  const central: {
    nameBytes: Uint8Array;
    crc: number;
    size: number;
    offset: number;
  }[] = [];

  for (const entry of entries) {
    const nameBytes = enc.encode(entry.name);
    const crc = crc32(entry.bytes);
    const size = entry.bytes.length;
    const offset = w.length;
    if (size > ZIP32_MAX) {
      throw new Error(
        `单个素材「${entry.name}」超出 zip 4GB 上限,无法打包 —— 请单独下载该素材`,
      );
    }
    // Local file header
    w.u32(0x0403_4b50);
    w.u16(20); // version needed
    w.u16(UTF8_FLAG);
    w.u16(0); // method = store
    w.u16(time);
    w.u16(date);
    w.u32(crc);
    w.u32(size); // compressed = uncompressed(store)
    w.u32(size);
    w.u16(nameBytes.length);
    w.u16(0); // extra len
    w.push(nameBytes);
    w.push(entry.bytes);
    central.push({ nameBytes, crc, size, offset });
    if (w.length > ZIP32_MAX) {
      throw new Error(
        "素材总量超出 zip 4GB 上限,无法一次打包 —— 请分批(如先剔除部分 B-roll)导出",
      );
    }
  }

  const cdOffset = w.length;
  for (const c of central) {
    w.u32(0x0201_4b50);
    w.u16(20); // version made by
    w.u16(20); // version needed
    w.u16(UTF8_FLAG);
    w.u16(0); // method
    w.u16(time);
    w.u16(date);
    w.u32(c.crc);
    w.u32(c.size);
    w.u32(c.size);
    w.u16(c.nameBytes.length);
    w.u16(0); // extra
    w.u16(0); // comment
    w.u16(0); // disk start
    w.u16(0); // internal attrs
    w.u32(0); // external attrs
    w.u32(c.offset);
    w.push(c.nameBytes);
  }
  const cdSize = w.length - cdOffset;
  // EOCD
  w.u32(0x0605_4b50);
  w.u16(0);
  w.u16(0);
  w.u16(central.length);
  w.u16(central.length);
  w.u32(cdSize);
  w.u32(cdOffset);
  w.u16(0);
  return w.concat();
}

// ── 编导说明 readme(video_decisions → 人话 markdown)──────────────────────────

// 结构化四决策候选的最小消费形状(与 ai-runtime video-decisions-runner 的
// VideoDecisions 结构对齐,但按「模块只经公开缝取数」原则不跨模块 import 类型:
// port 交来的是 unknown,这里做诚实的结构收窄 —— 收不进就当没有,绝不硬渲)。
export interface DecisionsShape {
  scenes: { title: string; startSec: number; endSec: number; summary: string }[];
  cards: { sceneIdx: number; kind: string; content: string; at: number }[];
  broll: {
    sceneIdx: number;
    assetId: string;
    at: number;
    durationSec: number;
  }[];
  subtitles: { index: number; startSec: number; endSec: number; zh: string; en: string }[];
}

/** unknown → DecisionsShape | null(缺 scenes 或形状不对 → null,诚实空态)。 */
export function coerceDecisions(value: unknown): DecisionsShape | null {
  if (typeof value !== "object" || value === null) return null;
  const o = value as Record<string, unknown>;
  if (!Array.isArray(o.scenes) || o.scenes.length === 0) return null;
  const arr = <T>(v: unknown): T[] => (Array.isArray(v) ? (v as T[]) : []);
  const scenes = (o.scenes as Record<string, unknown>[])
    .filter(
      (s) =>
        typeof s?.title === "string" &&
        typeof s?.startSec === "number" &&
        typeof s?.endSec === "number",
    )
    .map((s) => ({
      title: s.title as string,
      startSec: s.startSec as number,
      endSec: s.endSec as number,
      summary: typeof s.summary === "string" ? s.summary : "",
    }));
  if (scenes.length === 0) return null;
  return {
    scenes,
    cards: arr<DecisionsShape["cards"][number]>(o.cards),
    broll: arr<DecisionsShape["broll"][number]>(o.broll),
    subtitles: arr<DecisionsShape["subtitles"][number]>(o.subtitles),
  };
}

function fmtClock(sec: number): string {
  const s = Math.max(0, Math.round(sec));
  const m = Math.floor(s / 60);
  return `${String(m).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;
}

/** 诚实门头部文案(readme 头 + 前端导出说明共用措辞;单一真值在此)。 */
export const MATERIAL_EXPORT_HONESTY_NOTE =
  "本素材包是「原素材 + 编导说明」,供你手动在剪映等剪辑工具里重建成片;不是可一键导入的剪映工程(剪映没有通用的工程导入格式)。";

/** §5.1② 空态诚实文案(项目没跑四决策时 readme 用)。 */
export const NO_DECISIONS_NOTE =
  "本项目未跑四决策,无编导决策可导;以下为素材清单。";

/**
 * 编导说明 readme(人话 markdown):分场 + 每场信息卡/B-roll「几秒出、放什么」+
 * 字幕校正稿。decisions=null → §5.1② 空态(只指向素材清单,不给空段冒充)。
 * assetNames:B-roll assetId → zip 内文件名(让「放什么」指到包里的具体文件)。
 */
export function renderDirectorReadme(input: {
  projectTitle: string;
  decisions: DecisionsShape | null;
  assetNames: ReadonlyMap<string, string>;
  nowIso: string;
}): string {
  const lines: string[] = [];
  lines.push(`# 编导说明 — ${input.projectTitle || "未命名项目"}`);
  lines.push("");
  lines.push(`> ${MATERIAL_EXPORT_HONESTY_NOTE}`);
  lines.push(`> 导出时间:${input.nowIso}`);
  lines.push("");
  if (!input.decisions) {
    lines.push(NO_DECISIONS_NOTE);
    lines.push("");
    lines.push("素材清单见 manifest.txt。");
    lines.push("");
    return lines.join("\n");
  }
  const d = input.decisions;
  lines.push("## 分场");
  lines.push("");
  d.scenes.forEach((scene, i) => {
    lines.push(
      `### 第 ${i + 1} 场 ${scene.title}(${fmtClock(scene.startSec)} – ${fmtClock(scene.endSec)})`,
    );
    if (scene.summary) lines.push(scene.summary);
    const cards = d.cards.filter((c) => c.sceneIdx === i);
    for (const c of cards) {
      lines.push(
        `- 信息卡:第 ${Math.round(c.at)} 秒出「${c.kind}」卡 —— ${c.content}`,
      );
    }
    const brolls = d.broll.filter((b) => b.sceneIdx === i);
    for (const b of brolls) {
      const fileName = input.assetNames.get(b.assetId);
      const what = fileName ? `素材「${fileName}」(见素材包)` : `素材 ${b.assetId}(不在本包内,可能已删除)`;
      lines.push(
        `- B-roll:第 ${Math.round(b.at)} 秒起插入${what},持续约 ${Math.round(b.durationSec)} 秒`,
      );
    }
    if (cards.length === 0 && brolls.length === 0) {
      lines.push("- 本场无信息卡 / B-roll,保持口播画面");
    }
    lines.push("");
  });
  if (d.subtitles.length > 0) {
    lines.push("## 字幕校正稿(双语)");
    lines.push("");
    for (const s of d.subtitles) {
      lines.push(
        `${s.index}. [${fmtClock(s.startSec)}–${fmtClock(s.endSec)}] ${s.zh}${s.en ? ` / ${s.en}` : ""}`,
      );
    }
    lines.push("");
  }
  return lines.join("\n");
}

// ── manifest ──────────────────────────────────────────────────────────────────

export interface ManifestLine {
  fileName: string;
  /** 是什么(人话:粗剪人物视频 / SRT 字幕 / B-roll 素材 / 口播稿 / 编导说明…)。 */
  kind: string;
  /** 来源(素材库 asset id / 项目口播稿 / 本导出生成)。 */
  source: string;
}

export function renderManifest(input: {
  included: ManifestLine[];
  /** 读取失败未打包的素材(诚实列出,不无声吞)。 */
  missing: { name: string; reason: string }[];
  nowIso: string;
}): string {
  const lines: string[] = [];
  lines.push("素材包清单(文件名 → 是什么 → 来源)");
  lines.push(`导出时间:${input.nowIso}`);
  lines.push("");
  for (const f of input.included) {
    lines.push(`${f.fileName} | ${f.kind} | ${f.source}`);
  }
  if (input.missing.length > 0) {
    lines.push("");
    lines.push("以下素材读取失败,未打包(诚实列出,可回素材库单独下载):");
    for (const m of input.missing) {
      lines.push(`${m.name} | ${m.reason}`);
    }
  }
  lines.push("");
  return lines.join("\n");
}

// ── 聚合编排(ports 注入,可 stub 单测)────────────────────────────────────────

/** 用料链 role → 人话说明(manifest 用)。 */
function roleLabel(role: string): string {
  switch (role) {
    case "clip":
      return "粗剪人物视频";
    case "reference":
      return "SRT 字幕 / 参考文件";
    case "broll":
      return "B-roll 素材";
    case "cover":
      return "项目封面";
    case "final":
      return "成片视频";
    default:
      return `素材(role=${role})`;
  }
}

/** zip 内文件名净化:去路径分隔/控制字符,防路径穿越;空名给占位。 */
export function sanitizeZipName(name: string): string {
  const cleaned = name
    .replace(/[\u0000-\u001f]/g, "")
    .replace(/[\\/:*?"<>|]/g, "_")
    .replace(/^\.+/, "")
    .trim();
  return cleaned || "未命名文件";
}

/**
 * 把 output_script 的结构稿确定性投影成拍摄/提词器用纯口播。
 *
 * 与制作页预览使用同一口径：命中「口播：」后只保留口播及续行，遇到画面、字幕、
 * 时长等制作字段即停止；原稿本来就是纯文本时原样返回。导出层必须自己守住这个
 * 边界，不能假设上游 artifact 永远已经是纯文本。
 */
export function extractVoiceoverText(script: string): string {
  const normalized = script.replace(/\r\n?/g, "\n").trim();
  if (!normalized) return "";

  const blocks: string[] = [];
  let current: string[] = [];
  let collecting = false;
  let foundVoiceoverLabel = false;
  const flush = () => {
    const block = current.join("\n").trim();
    if (block) blocks.push(block);
    current = [];
  };

  for (const rawLine of normalized.split("\n")) {
    const line = rawLine.trim();
    const voiceover = line.match(/^口播\s*[：:]\s*(.*)$/i);
    if (voiceover) {
      flush();
      collecting = true;
      foundVoiceoverLabel = true;
      if (voiceover[1]?.trim()) current.push(voiceover[1].trim());
      continue;
    }
    if (
      /^(画面|字幕|时长|镜头|景别|动作|素材|音效|配乐|BGM)\s*[：:]/i.test(
        line,
      )
    ) {
      flush();
      collecting = false;
      continue;
    }
    if (!collecting) continue;
    if (!line) {
      flush();
      collecting = false;
      continue;
    }
    if (/^(?:#{1,6}\s*)?\d+[.、]\s+/.test(line)) {
      flush();
      collecting = false;
      continue;
    }
    current.push(line);
  }
  flush();

  return foundVoiceoverLabel ? blocks.join("\n\n").trim() : normalized;
}

export interface MaterialExportPorts {
  /** 项目关联素材(materialLinks entityType=asset 全量,不挑不减 VP-04)。 */
  listMaterialAssets(
    ctx: RequestContext,
    projectId: string,
  ): Promise<{ assetId: string; role: string }[]>;
  /** 素材元数据(名字);读不到 → null(该素材进 missing)。 */
  getAssetName(ctx: RequestContext, assetId: string): Promise<string | null>;
  /** 素材字节;读不到 → null(该素材进 missing,不炸整包)。 */
  getAssetBytes(
    ctx: RequestContext,
    assetId: string,
  ): Promise<{ bytes: Uint8Array; mimeType?: string } | null>;
  /** 口播稿全文(output_script 当前版本);无稿 → 空串。 */
  getScriptText(ctx: RequestContext, projectId: string): Promise<string>;
  /** 最近一次 video.decisions 候选产物(unknown,内部 coerce);没跑过 → null。 */
  getVideoDecisions(ctx: RequestContext, projectId: string): Promise<unknown | null>;
  /** 项目标题(readme/zip 名用);读不到 → 空串。 */
  getProjectTitle(ctx: RequestContext, projectId: string): Promise<string>;
}

export interface MaterialExportBundle {
  zipBytes: Uint8Array;
  zipFileName: string;
  fileCount: number;
  totalBytes: number;
  hasDecisions: boolean;
}

const MATERIAL_EXT_BY_MIME: Readonly<Record<string, string>> = {
  "image/jpeg": ".jpg",
  "image/jpg": ".jpg",
  "image/png": ".png",
  "image/webp": ".webp",
  "image/gif": ".gif",
  "video/mp4": ".mp4",
  "video/quicktime": ".mov",
  "video/webm": ".webm",
  "audio/mpeg": ".mp3",
  "audio/wav": ".wav",
  "application/pdf": ".pdf",
  "application/x-subrip": ".srt",
  "text/plain": ".txt",
  "text/markdown": ".md",
};

/** 展示名常常是「提示词 · 生成图」而没有后缀；ZIP 必须按真实 MIME 补扩展名。 */
function materialFileName(display: string, mimeType?: string): string {
  const safe = sanitizeZipName(display);
  if (/\.[a-z0-9]{1,8}$/i.test(safe)) return safe;
  const normalizedMime = mimeType?.split(";")[0]?.trim().toLowerCase() ?? "";
  return safe + (MATERIAL_EXT_BY_MIME[normalizedMime] ?? "");
}

/**
 * 聚合 + 打包:素材 asset 字节 + 口播稿 + 编导说明 readme + manifest → store zip。
 * 全程只经 ports 取数(service 在组合根接线到各模块公开 service,无跨模块 repo)。
 */
export async function aggregateMaterialExport(
  ctx: RequestContext,
  input: { projectId: string; nowIso: string },
  ports: MaterialExportPorts,
): Promise<MaterialExportBundle> {
  const enc = new TextEncoder();
  const { projectId, nowIso } = input;
  const title = await ports.getProjectTitle(ctx, projectId);

  // 1. 素材 asset(全量;逐个取名 + 字节,失败进 missing 诚实列出)。
  const links = await ports.listMaterialAssets(ctx, projectId);
  const entries: ZipEntry[] = [];
  const included: ManifestLine[] = [];
  const missing: { name: string; reason: string }[] = [];
  const assetNames = new Map<string, string>(); // assetId → zip 内文件名(readme B-roll 引用)
  const usedNames = new Set<string>();
  const uniqueName = (base: string): string => {
    let name = base;
    let n = 2;
    while (usedNames.has(name)) {
      const dot = base.lastIndexOf(".");
      name =
        dot > 0
          ? `${base.slice(0, dot)}-${n}${base.slice(dot)}`
          : `${base}-${n}`;
      n++;
    }
    usedNames.add(name);
    return name;
  };
  for (const link of links) {
    const rawName = await ports.getAssetName(ctx, link.assetId);
    const display = rawName ?? link.assetId;
    const blob = rawName ? await ports.getAssetBytes(ctx, link.assetId) : null;
    if (!blob) {
      missing.push({
        name: display,
        reason: rawName ? "字节读取失败" : "素材不存在或已删除",
      });
      continue;
    }
    const fileName = uniqueName(
      `素材/${materialFileName(display, blob.mimeType)}`,
    );
    entries.push({ name: fileName, bytes: blob.bytes });
    included.push({
      fileName,
      kind: roleLabel(link.role),
      source: `素材库 asset ${link.assetId}`,
    });
    assetNames.set(link.assetId, fileName);
  }

  // 2. 口播稿(当前版本全文;无稿跳过,manifest 不冒充)。
  const script = extractVoiceoverText(
    await ports.getScriptText(ctx, projectId),
  );
  if (script.trim()) {
    const name = uniqueName("口播稿.md");
    entries.push({ name, bytes: enc.encode(script) });
    included.push({
      fileName: name,
      kind: "纯口播稿(当前版本)",
      source: "项目稿面 output_script",
    });
  }

  // 3. 编导说明 readme(§5.1②:没跑四决策 → 空态诚实,不给空段)。
  const rawDecisions = await ports.getVideoDecisions(ctx, projectId);
  const decisions = coerceDecisions(rawDecisions);
  const readmeName = uniqueName("README-编导说明.md");
  const readme = renderDirectorReadme({
    projectTitle: title,
    decisions,
    assetNames,
    nowIso,
  });
  // readme/manifest 先登记进 manifest 行,再生成 manifest 本体(它列出包内一切)。
  included.push({
    fileName: readmeName,
    kind: decisions
      ? "编导说明(分场/信息卡/B-roll/字幕校正稿,人话版四决策)"
      : "编导说明(本项目未跑四决策 —— 空态说明)",
    source: "本导出生成",
  });
  const manifestName = uniqueName("manifest.txt");
  included.push({
    fileName: manifestName,
    kind: "素材包清单",
    source: "本导出生成",
  });
  entries.push({ name: readmeName, bytes: enc.encode(readme) });
  entries.push({
    name: manifestName,
    bytes: enc.encode(renderManifest({ included, missing, nowIso })),
  });

  const zipBytes = buildStoreZip(entries, nowIso);
  const day = nowIso.slice(0, 10).replace(/-/g, "");
  const safeTitle = sanitizeZipName(title || projectId).slice(0, 40);
  return {
    zipBytes,
    zipFileName: `素材包-${safeTitle}-${day}.zip`,
    fileCount: entries.length,
    totalBytes: zipBytes.length,
    hasDecisions: decisions !== null,
  };
}
