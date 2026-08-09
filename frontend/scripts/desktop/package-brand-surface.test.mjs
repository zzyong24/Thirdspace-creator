import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const frontend = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const repo = resolve(frontend, "..");
const read = (path) => readFileSync(resolve(repo, path), "utf8");

describe("渠道包应用内部品牌 Gate", () => {
  it("原生窗口、HTML 标题和侧边栏都消费包级品牌，而不是硬编码窗口品牌", () => {
    expect(read("frontend/src-tauri/src/lib.rs")).toContain(
      ".title(product_identity::package_display_name())",
    );
    expect(read("frontend/src/app/layout.tsx")).toContain(
      "title: PACKAGE_BRAND_NAME",
    );
    expect(read("frontend/src/components/shell/sidebar.tsx")).toContain(
      "packageBrandIconDataUrl",
    );
    expect(read("frontend/src/components/shell/sidebar.tsx")).toContain(
      "resolveVisibleBrandName",
    );
  });

  it("项目级渠道打包 Skill 强制完整 Growth 配置与真机内部截图验收", () => {
    const skill = read(".agents/skills/packaging-creatoros-channel/SKILL.md");
    expect(skill).toContain("growth-product-config.json");
    expect(skill).toContain("原生窗口标题");
    expect(skill).toContain("侧边栏品牌图标");
    expect(skill).toContain("实际安装应用截图");
  });
});
