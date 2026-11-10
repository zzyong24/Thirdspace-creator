/**
 * 批次2-6（月明 2026-11-10）：窄面板布局适配。
 * 对话卡片会出现在 300px 的稿面右栏里，而视口仍是宽屏：用视口断点（sm:/md:/lg: grid-cols）
 * 排多列会在窄栏里挤成几十像素一列。卡片内的列布局一律按容器宽度（@container + @sm:/@md:）。
 */
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const roots = ["src/features/copilot", "src/features/knowledge/knowledge-atom-gate.tsx"];
function files(): string[] {
  const out: string[] = [];
  for (const root of roots) {
    if (root.endsWith(".tsx")) { out.push(root); continue; }
    for (const name of readdirSync(root)) if (name.endsWith(".tsx") && !name.includes(".test.")) out.push(join(root, name));
  }
  return out;
}

describe("对话卡片列布局按容器宽度", () => {
  it("不再用视口断点切多列", () => {
    const offenders = files().flatMap((file) =>
      readFileSync(file, "utf8").split("\n").flatMap((line, i) => (/(?<![@\w])(sm|md|lg|xl):grid-cols-/.test(line) ? [`${file}:${i + 1}`] : [])),
    );
    expect(offenders).toEqual([]);
  });
  it("用容器断点的卡片，根节点声明了 @container", () => {
    for (const file of files()) {
      const src = readFileSync(file, "utf8");
      if (/@(sm|md|lg):grid-cols-/.test(src)) expect(src, file).toMatch(/["\s]@container[\s"]/);
    }
  });
});
