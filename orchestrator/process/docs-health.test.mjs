import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const SCRIPT = path.join(HERE, "docs-health.mjs");

function fixture() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "docs-health-layout-"));
  const processDir = path.join(root, "orchestrator", "process");
  fs.mkdirSync(path.join(root, "docs", "features", "crm"), { recursive: true });
  fs.mkdirSync(processDir, { recursive: true });
  fs.writeFileSync(path.join(root, "docs", "INDEX.md"), "<!-- truth: canonical -->\n# Product knowledge\n");
  fs.writeFileSync(
    path.join(processDir, "knowledge.config.json"),
    `${JSON.stringify({
      project_root: "../..",
      docs_dir: "../../docs",
      root_markdown_allowlist: ["PRODUCT_SPEC.md", "PRODUCT_VOCABULARY.md", "BACKLOG.md", "AGENTS.md", "PROJECT_CONTEXT.md"],
      feature_map: {},
    }, null, 2)}\n`,
  );
  return { root, config: path.join(processDir, "knowledge.config.json") };
}

function run(config) {
  return spawnSync(process.execPath, [SCRIPT, "--strict", "--config", config], {
    encoding: "utf8",
  });
}

test("模块或切片 Spec 放在项目根目录时 strict 检查失败", () => {
  const { root, config } = fixture();
  const value = JSON.parse(fs.readFileSync(config, "utf8"));
  value.root_markdown_allowlist.push("CRM_DOMAIN_SPEC.md");
  fs.writeFileSync(config, `${JSON.stringify(value, null, 2)}\n`);
  for (const file of ["CRM_DOMAIN_SPEC.md", "PERSONAL_BRAND_SLICE_SPEC.review.md", "IMPLEMENTATION_PLAN.md", "IMPLEMENTATION_PLAN.revised.md", "FINANCE_DOMAIN_SPEC.MD"]) {
    fs.writeFileSync(path.join(root, file), `# ${file}\n`);
  }
  const result = run(config);
  assert.equal(result.status, 1);
  assert.match(result.stdout + result.stderr, /CRM_DOMAIN_SPEC\.md/);
  assert.match(result.stdout + result.stderr, /PERSONAL_BRAND_SLICE_SPEC\.review\.md/);
  assert.match(result.stdout + result.stderr, /IMPLEMENTATION_PLAN\.md/);
  assert.match(result.stdout + result.stderr, /IMPLEMENTATION_PLAN\.revised\.md/);
  assert.match(result.stdout + result.stderr, /FINANCE_DOMAIN_SPEC\.MD/);
  assert.match(result.stdout + result.stderr, /根目录|features/);
});

test("模块 Spec 在功能目录内且根目录只放总纲时通过", () => {
  const { root, config } = fixture();
  fs.writeFileSync(path.join(root, "PRODUCT_SPEC.md"), "# Product Spec\n");
  fs.writeFileSync(path.join(root, "PRODUCT_SPEC.review.md"), "# Review\n");
  fs.writeFileSync(
    path.join(root, "docs", "features", "crm", "BUSINESS.md"),
    "<!-- truth: canonical -->\n# CRM business\n",
  );
  const result = run(config);
  assert.equal(result.status, 0, result.stdout + result.stderr);
});
