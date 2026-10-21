import { existsSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const cssPath = "src/features/intelligence/intelligence-workbench.module.css";
const css = existsSync(cssPath) ? readFileSync(cssPath, "utf8") : "";
const shared = ["creatoros-studio.css", "creatoros-polish.css", "creatoros-system.css"]
  .map((file) => readFileSync(`src/styles/${file}`, "utf8")).join("\n");

// jsdom不计算容器查询：此处守护样式契约，不冒充浏览器几何验收。
describe("T-1383 雷达布局样式契约", () => {
  it("由可用容器宽度决定三栏，来源至少300px，详情保留阅读宽度", () => {
    expect(css).toMatch(/container:\s*radar-workbench\s*\/\s*inline-size/);
    expect(css).toMatch(/@container radar-workbench \(min-width: 1040px\)/);
    expect(css).toMatch(/grid-template-columns:\s*300px minmax\(300px, 0\.9fr\) minmax\(360px, 1\.1fr\)/);
    expect(shared).not.toMatch(/\[data-testid="intelligence-responsive-layout"\][^{]*\{[^}]*grid-template-columns/);
    expect(shared).not.toMatch(/\[data-testid="intelligence-sidebar"\][^{]*\{[^}]*max-height/);
  });
  it("窄屏单栏，中等宽度两栏且详情通栏，避免压缩来源与长文本", () => {
    expect(css).toMatch(/\.layout\s*\{[^}]*grid-template-columns:\s*minmax\(0, 1fr\)/);
    expect(css).toMatch(/@container radar-workbench \(min-width: 680px\)/);
    expect(css).toMatch(/grid-template-columns:\s*300px minmax\(0, 1fr\)/);
    expect(css).toMatch(/\.detailPane\s*\{[^}]*grid-column:\s*1 \/ -1/);
    expect(css).toMatch(/overflow-wrap:\s*anywhere/);
  });
  it("作品区足够宽才显示双列，详情拖动只在有余量时启用", () => {
    expect(css).toMatch(/container:\s*radar-items\s*\/\s*inline-size/);
    expect(css).toMatch(/@container radar-items \(min-width: 640px\)/);
    expect(css).toMatch(/@container radar-workbench \(min-width: 1320px\)/);
    expect(css).toMatch(/\.resizeHandle\s*\{[^}]*display:\s*none/);
    expect(css).toMatch(/\.resizeHandle\s*\{[^}]*display:\s*block/);
  });
  it("来源完整换行，操作分组可换行且按钮保留足够尺寸", () => {
    expect(css).toMatch(/\.sourceName\s*\{[^}]*white-space:\s*normal/);
    expect(css).toMatch(/\.sourceActions\s*\{[^}]*flex-wrap:\s*wrap/);
    expect(css).toMatch(/\.sourceActions button\[data-slot="button"\]\s*\{[^}]*min-height:\s*32px/);
    expect(css).toMatch(/min-height:\s*44px/);
  });
});
