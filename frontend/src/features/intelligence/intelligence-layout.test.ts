import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const css = readFileSync("src/features/intelligence/intelligence-workbench.module.css", "utf8");
const shared = ["creatoros-studio.css", "creatoros-polish.css", "creatoros-system.css"]
  .map((file) => readFileSync(`src/styles/${file}`, "utf8")).join("\n");

// jsdom不计算容器查询：此处守护样式契约，不冒充浏览器几何验收。
describe("T-1384 雷达密度布局契约", () => {
  it("1280窗口的约1006px工作台保留三栏，最小总列宽不超820px", () => {
    expect(css).toMatch(/container:\s*radar-workbench\s*\/\s*inline-size/);
    expect(css).toMatch(/@container radar-workbench \(min-width: 820px\)/);
    expect(css).toMatch(/grid-template-columns:\s*240px minmax\(280px, 1fr\) minmax\(300px, 0\.9fr\)/);
    expect(shared).not.toMatch(/\[data-testid="intelligence-responsive-layout"\][^{]*\{[^}]*grid-template-columns/);
  });
  it("详情下移时明确分配行高，不允许来源或作品缩到零", () => {
    expect(css).toMatch(/grid-template-rows:\s*360px minmax\(520px, auto\) auto/);
    expect(css).toMatch(/@container radar-workbench \(min-width: 560px\)/);
    expect(css).toMatch(/grid-template-rows:\s*minmax\(520px, 65dvh\) auto/);
    expect(css).toMatch(/\.sourceList\s*\{[^}]*overflow-y:\s*auto/);
    expect(css).toMatch(/\.itemList\s*\{[^}]*overflow-y:\s*auto/);
  });
  it("宽桌面仍能调节详情，普通桌面优先紧凑单列", () => {
    expect(css).toMatch(/@container radar-workbench \(min-width: 1320px\)/);
    expect(css).toMatch(/\.resizeHandle\s*\{[^}]*display:\s*none/);
    expect(css).toMatch(/\.resizeHandle\s*\{[^}]*display:\s*block/);
    expect(css).not.toMatch(/repeat\(2, minmax\(0, 1fr\)\)/);
  });
  it("长名称两行截断，筛选等宽三列，缩略图预留尺寸", () => {
    expect(css).toMatch(/\.sourceName[^}]*-webkit-line-clamp:\s*2/);
    expect(css).toMatch(/\.filterBar\s*\{[^}]*grid-template-columns:\s*repeat\(3, minmax\(0, 1fr\)\)/);
    expect(css).toMatch(/\.cover\s*\{[^}]*width:\s*48px/);
    expect(css).toMatch(/min-height:\s*44px/);
  });
});
