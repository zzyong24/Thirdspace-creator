import original from "../../../../frontend/playwright.config";
import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, readdirSync, realpathSync, writeFileSync } from "node:fs";
import { dirname, isAbsolute, relative, resolve } from "node:path";
import { execFileSync } from "node:child_process";

// Explicit, reviewable configuration; never patches Playwright at runtime.
const root = resolve(process.cwd(), "..");
const driver = resolve(root, "docs/verification/t1246/driver");
const manifest = JSON.parse(readFileSync(resolve(driver, "manifest.json"), "utf8"));
if (manifest.sourceRoot !== root) throw new Error("Run from this integration snapshot frontend directory.");
if (manifest.unresolved.length) throw new Error("Unreviewed timeout consumer options remain; preparation cannot be executed.");
const runDir = process.env.CREATOROS_T1246_RUN_DIR;
if (!runDir || !isAbsolute(runDir)) throw new Error("Bind absolute per-round CREATOROS_T1246_RUN_DIR before listing/executing.");
mkdirSync(runDir, { recursive: true });
const realEvidence = realpathSync(resolve(root, "docs/verification/t1246"));
const runRel = relative(realEvidence, realpathSync(runDir));
if (!runRel || runRel.startsWith("..") || isAbsolute(runRel)) throw new Error("Evidence output must be a unique child of this snapshot docs/verification/t1246.");
const listing = process.argv.includes("--list");
if (!listing) {
  const frozen = process.env.CREATOROS_T1246_FROZEN_CANDIDATE;
  const head = execFileSync("git", ["rev-parse", "HEAD"], { cwd: root, encoding: "utf8" }).trim();
  if (!frozen || frozen !== head) throw new Error("Candidate SHA not frozen or HEAD drifted; verify external runtime binding before execution.");
}
const hash = (file: string) => createHash("sha256").update(readFileSync(file)).digest("hex");
if (hash(resolve(root, "frontend/playwright.config.ts")) !== manifest.configOriginalSha256) throw new Error("Original shared configuration changed after source-copy preparation.");
for (const file of manifest.allOriginalTestFiles) {
  if (hash(resolve(root, "frontend/tests", file.file)) !== file.sha256) throw new Error(`Original test source changed: ${file.file}`);
}
function inventory(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap(entry => entry.isDirectory()
    ? inventory(resolve(directory, entry.name)) : [resolve(directory, entry.name)]).sort();
}
for (const [directory, expected] of [
  [resolve(root, "frontend/tests"), manifest.allOriginalTestFiles],
  [resolve(root, manifest.generatedTestRoot), manifest.allGeneratedTestFiles],
] as const) {
  const actual = inventory(directory).map(file => relative(directory, file)).sort();
  const names = expected.map((file: { file: string }) => file.file).sort();
  if (JSON.stringify(actual) !== JSON.stringify(names)) throw new Error(`Exact test file inventory changed: ${directory}`);
  for (const file of expected) {
    if (hash(resolve(directory, file.file)) !== file.sha256) throw new Error(`Test/fixture bytes drifted: ${directory}/${file.file}`);
  }
}
if (!listing) {
  const productPaths = ["backend/src", "backend/drizzle", "contract/src", "ai-worker/src", "ai-worker/scripts", "ai-worker/vendor", "frontend/src", "frontend/lib", "frontend/next.config.ts", "frontend/package.json", "backend/package.json", "contract/package.json", "ai-worker/package.json", "package.json", "pnpm-lock.yaml"];
  const dirty = execFileSync("git", ["status", "--porcelain", "--", ...productPaths], { cwd: root, encoding: "utf8" }).trim();
  if (dirty) throw new Error(`Frozen product has uncommitted source changes: ${dirty}`);
}
for (const file of manifest.driverFiles ?? []) {
  if (hash(resolve(driver, file.file)) !== file.sha256) throw new Error(`Driver bytes changed after review binding: ${file.file}`);
}
if (!listing) {
  writeFileSync(resolve(runDir, "execution-binding.json"), JSON.stringify({
    phase: "preflight-only; not a PASS",
    frozenCandidate: process.env.CREATOROS_T1246_FROZEN_CANDIDATE,
    preparationProvenanceHead: manifest.sourceCommit,
    originalConfigSha256: manifest.configOriginalSha256,
    originalTestInventory: manifest.allOriginalTestFiles,
    generatedTestInventory: manifest.allGeneratedTestFiles,
    driverInventory: manifest.driverFiles,
    packageSha256: process.env.CREATOROS_T1246_PACKAGE_SHA256 ?? null,
    createdAt: new Date().toISOString(),
  }, null, 2) + "\n");
}
for (const suffix of manifest.outputSuffixes) {
  const target = resolve(runDir, "original-output", suffix);
  mkdirSync(/\.[a-z0-9]+$/i.test(suffix) ? dirname(target) : target, { recursive: true });
}
mkdirSync(resolve(runDir, "scenario"), { recursive: true });
const outer = Math.max(180000, ...manifest.budgets.map((x: { effectiveTestMs: number }) => x.effectiveTestMs));
export default {
  ...original,
  testDir: resolve(root, manifest.generatedTestRoot),
  outputDir: resolve(runDir, "test-results"),
  retries: 0,
  workers: 1,
  // No shorter suite-wide cap; launcher must cover the listed serial case sum + cleanup.
  globalTimeout: 0,
  timeout: outer,
  expect: { ...original.expect, timeout: 120000 },
  use: {
    ...original.use,
    actionTimeout: 120000,
    navigationTimeout: 120000,
    trace: "on" as const,
    screenshot: "on" as const,
  },
  webServer: { ...original.webServer, command: "node ../docs/verification/t1246/driver/start-isolated-next.cjs", timeout: Math.max(original.webServer?.timeout ?? 300000, 300000), gracefulShutdown: { signal: "SIGTERM" as const, timeout: 120000 } },
  reporter: [
    ["list"],
    ["json", { outputFile: resolve(runDir, "results.json") }],
    ["html", { open: "never", outputFolder: resolve(runDir, "html") }],
  ],
};
