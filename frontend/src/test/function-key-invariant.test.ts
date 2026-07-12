import { readdirSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { describe, expect, it } from "vitest";

import { ALL_CHAT_TOOL_NAMES } from "@creatoros/backend/modules/ai-runtime";

// [T-265 附:审计新发现②] functionKey ↔ ALL_CHAT_TOOL_NAMES 构建期不变量。
//
// 病例:稿面「立论点」深链带 functionKey="planning.thesis",但它此前不在 ALL_CHAT_TOOL_NAMES
// → chat-runner 的 forcedTool 恒 undefined、functionKey 静默丢弃(chat-runner.ts:550/1340)→
// 点了 = 纯文本无工具,编导抓最近的 topic.enrich 冒充论点树。同类:「搜素材」曾带
// research.gather_material(也不在白名单 → 空点)。
//
// 根治:凡前端源码里作为 openChat/深链 functionKey 用的字符串字面量,**必须 ∈ ALL_CHAT_TOOL_NAMES**
// (否则 forcedTool 命不中 = 死链)。本测扫全部 src/ 生产源码(排除 .test.),抽出所有
// `functionKey: "..."` 字面量断言成员资格。新增 CTA 指向不存在工具 = 本测红,死链无法复发。

const SRC_DIR = resolve(process.cwd(), "src");

// 递归收集 src/ 下的 .ts/.tsx 生产源码(排除测试文件与类型声明)。
function collectSourceFiles(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === "node_modules" || entry.name.startsWith(".")) continue;
      out.push(...collectSourceFiles(full));
      continue;
    }
    if (!/\.tsx?$/.test(entry.name)) continue;
    if (/\.test\.tsx?$/.test(entry.name) || entry.name.endsWith(".d.ts")) continue;
    out.push(full);
  }
  return out;
}

// 抽出源码里所有 `functionKey: "字面量"`(单/双引号)。
function extractFunctionKeys(source: string): string[] {
  const keys: string[] = [];
  const re = /functionKey:\s*["']([^"']+)["']/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(source)) !== null) {
    keys.push(m[1]!);
  }
  return keys;
}

describe("[T-265] functionKey ↔ ALL_CHAT_TOOL_NAMES 不变量(死链防复发)", () => {
  const files = collectSourceFiles(SRC_DIR);
  const toolNames = new Set(ALL_CHAT_TOOL_NAMES);

  // 收集全部 (文件, functionKey) 对,便于失败时精确定位是哪个 CTA 指向了不存在的工具。
  const occurrences: Array<{ file: string; key: string }> = [];
  for (const file of files) {
    for (const key of extractFunctionKeys(readFileSync(file, "utf8"))) {
      occurrences.push({ file, key });
    }
  }

  it("扫到至少一个 functionKey 字面量(否则正则失效 = 假绿)", () => {
    expect(occurrences.length).toBeGreaterThan(0);
    // 确保覆盖到本任务复活的深链。
    expect(occurrences.some((o) => o.key === "planning.thesis")).toBe(true);
  });

  it("每个前端 functionKey 字面量都 ∈ ALL_CHAT_TOOL_NAMES(否则 forcedTool 命不中 = 死链)", () => {
    const dead = occurrences.filter((o) => !toolNames.has(o.key));
    const detail = dead
      .map((o) => `  ${o.key}  ← ${o.file.replace(process.cwd(), ".")}`)
      .join("\n");
    expect(
      dead,
      dead.length
        ? `以下 functionKey 不在 ALL_CHAT_TOOL_NAMES(死链,深链点了会空点/被别的工具冒充):\n${detail}`
        : "",
    ).toEqual([]);
  });
});
