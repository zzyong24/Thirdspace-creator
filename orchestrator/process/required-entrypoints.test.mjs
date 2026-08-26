import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const SKILL = path.resolve(HERE, "..");
const INIT = path.join(SKILL, "tools", "init-project.sh");
const VENDOR_GUARD = path.join(SKILL, "tools", "engine-vendor-guard.mjs");
const GIT_ENV = {
  ...process.env,
  GIT_AUTHOR_NAME: "Required Entrypoints Test",
  GIT_AUTHOR_EMAIL: "required-entrypoints@example.test",
  GIT_COMMITTER_NAME: "Required Entrypoints Test",
  GIT_COMMITTER_EMAIL: "required-entrypoints@example.test",
};

function runInit(args) {
  return spawnSync("bash", [INIT, ...args], {
    cwd: SKILL,
    encoding: "utf8",
    env: GIT_ENV,
  });
}

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

function requiredEngineFiles() {
  const guard = fs.readFileSync(VENDOR_GUARD, "utf8");
  const body = guard.match(/const REQUIRED_ENGINE_FILES = \[([\s\S]*?)\];/)?.[1];
  assert.ok(body, "engine vendor guard must expose REQUIRED_ENGINE_FILES");
  return [...body.matchAll(/["']([^"']+\.mjs)["']/g)].map((match) => match[1]);
}

test("SKILL startup entrypoints are explicit required vendor files", () => {
  const skill = fs.readFileSync(path.join(SKILL, "SKILL.md"), "utf8");
  const declared = [
    ...skill.matchAll(/\borchestrator\/process\/([A-Za-z0-9_.-]+\.mjs)\b/g),
  ].map((match) => match[1]);
  const required = requiredEngineFiles();

  assert.ok(declared.length > 0, "SKILL.md must declare at least one startup runtime entrypoint");
  for (const entrypoint of declared) {
    assert.ok(
      required.includes(entrypoint),
      `${entrypoint} is startup-required by SKILL.md but absent from REQUIRED_ENGINE_FILES`,
    );
  }
  for (const entrypoint of [
    "context-plan.mjs",
    "context-compile.mjs",
    "parallel-isolation.mjs",
    "delivery-phase.mjs",
  ]) {
    assert.ok(required.includes(entrypoint), `${entrypoint} must be a required vendor file`);
  }

  const guard = spawnSync(process.execPath, [VENDOR_GUARD, "verify-required", HERE], {
    cwd: SKILL,
    encoding: "utf8",
  });
  assert.equal(guard.status, 0, guard.stderr || guard.stdout);
});

test("vendor guard rejects a SKILL startup entrypoint omitted from the managed set", (t) => {
  const fixture = fs.mkdtempSync(path.join(os.tmpdir(), "required-entrypoints-contract-"));
  const fixtureProcess = path.join(fixture, "process");
  t.after(() => fs.rmSync(fixture, { recursive: true, force: true }));
  fs.mkdirSync(fixtureProcess, { recursive: true });
  for (const relative of requiredEngineFiles()) {
    fs.copyFileSync(path.join(HERE, relative), path.join(fixtureProcess, relative));
  }
  fs.writeFileSync(
    path.join(fixture, "SKILL.md"),
    "Startup requires `node orchestrator/process/future-entrypoint.mjs --json`.\n",
  );
  fs.writeFileSync(path.join(fixtureProcess, "future-entrypoint.mjs"), "#!/usr/bin/env node\n");

  const result = spawnSync(
    process.execPath,
    [VENDOR_GUARD, "verify-required", fixtureProcess],
    { cwd: SKILL, encoding: "utf8" },
  );
  assert.equal(result.status, 3, result.stderr || result.stdout);
  assert.match(result.stderr + result.stdout, /future-entrypoint\.mjs.*REQUIRED_ENGINE_FILES/i);
});

test("supported update installs omitted required runtime entrypoints without touching project state", (t) => {
  const parent = fs.mkdtempSync(path.join(os.tmpdir(), "required-entrypoints-update-"));
  const target = path.join(parent, "legacy-product");
  t.after(() => fs.rmSync(parent, { recursive: true, force: true }));

  let result = runInit([
    target,
    "--triage",
    "S",
    "--topology",
    "single",
    "--name",
    "Legacy Product",
  ]);
  assert.equal(result.status, 0, result.stderr || result.stdout);

  const processDir = path.join(target, "orchestrator", "process");
  const planner = path.join(processDir, "context-plan.mjs");
  const compiler = path.join(processDir, "context-compile.mjs");
  const parallelIsolation = path.join(processDir, "parallel-isolation.mjs");
  const deliveryPhase = path.join(processDir, "delivery-phase.mjs");
  const vendorManifestFile = path.join(processDir, ".vendor-manifest.json");
  const versionFile = path.join(processDir, ".skill-version");

  // Reproduce the released-project shape: the stamp and vendor baseline claimed an
  // older complete install, but context-plan was absent while context-compile existed.
  fs.unlinkSync(planner);
  fs.unlinkSync(parallelIsolation);
  fs.unlinkSync(deliveryPhase);
  const oldManifest = JSON.parse(fs.readFileSync(vendorManifestFile, "utf8"));
  delete oldManifest.files["context-plan.mjs"];
  delete oldManifest.files["parallel-isolation.mjs"];
  delete oldManifest.files["delivery-phase.mjs"];
  oldManifest.skill_version = "3.20.1";
  fs.writeFileSync(vendorManifestFile, `${JSON.stringify(oldManifest, null, 2)}\n`);
  fs.writeFileSync(versionFile, `version=3.20.1\nskill_dir=${SKILL}\n`);

  const protectedFiles = new Map([
    [
      path.join(processDir, "modules.config.json"),
      Buffer.from('{"schema":"project-modules/sentinel","modules":{}}\n'),
    ],
    [
      path.join(target, "orchestrator", "progress.json"),
      Buffer.from('{"schema":"project-progress/sentinel","verticals":[]}\n'),
    ],
    [path.join(target, "orchestrator", "review-events.ndjson"), Buffer.from("")],
    [
      path.join(target, "CRM_DOMAIN_SPEC.md"),
      Buffer.from("# Project-owned dirty business specification\n\nDo not overwrite.\n"),
    ],
  ]);
  for (const [file, content] of protectedFiles) {
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, content);
  }

  result = runInit([target, "--update", "--topology", "single"]);
  assert.equal(result.status, 0, result.stderr || result.stdout);

  assert.equal(fs.existsSync(planner), true, "update must install context-plan.mjs");
  assert.equal(fs.existsSync(parallelIsolation), true, "update must install parallel-isolation.mjs");
  assert.equal(fs.existsSync(deliveryPhase), true, "update must install delivery-phase.mjs");
  const plan = spawnSync(process.execPath, [planner, "--root", target, "--json"], {
    cwd: target,
    encoding: "utf8",
  });
  assert.equal(plan.status, 0, plan.stderr || plan.stdout);
  const parsed = JSON.parse(plan.stdout);
  assert.equal(parsed.schema, "product-to-code-orchestrator/context-plan@2");
  assert.ok(Array.isArray(parsed.required_reads));

  const syntax = spawnSync(process.execPath, ["--check", planner], { encoding: "utf8" });
  assert.equal(syntax.status, 0, syntax.stderr || syntax.stdout);
  const manifest = JSON.parse(fs.readFileSync(vendorManifestFile, "utf8"));
  for (const [relative, file] of [
    ["context-plan.mjs", planner],
    ["context-compile.mjs", compiler],
    ["parallel-isolation.mjs", parallelIsolation],
    ["delivery-phase.mjs", deliveryPhase],
  ]) {
    assert.equal(
      manifest.files[relative],
      sha256(fs.readFileSync(file)),
      `${relative} vendor hash must match the installed bytes`,
    );
  }

  for (const [file, before] of protectedFiles) {
    assert.deepEqual(fs.readFileSync(file), before, `${path.relative(target, file)} changed`);
  }
  const dirtyBusiness = spawnSync("git", ["status", "--porcelain", "--", "CRM_DOMAIN_SPEC.md"], {
    cwd: target,
    encoding: "utf8",
  });
  assert.equal(dirtyBusiness.status, 0, dirtyBusiness.stderr || dirtyBusiness.stdout);
  assert.match(dirtyBusiness.stdout, /^\?\? CRM_DOMAIN_SPEC\.md\s*$/m);
});
