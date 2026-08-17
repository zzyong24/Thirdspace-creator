import assert from "node:assert/strict";
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { delimiter, join, resolve } from "node:path";
import { spawnSync } from "node:child_process";

const root = resolve(process.cwd());
const skillDir = resolve(root, process.argv[2] ?? ".agents/skills/creatoros-cli");

function filesUnder(dir, prefix = "") {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const relative = prefix ? `${prefix}/${entry.name}` : entry.name;
    return entry.isDirectory()
      ? filesUnder(join(dir, entry.name), relative)
      : [relative];
  });
}

function fallbackCli(platform, env) {
  if (platform === "darwin") return join(env.HOME, ".local", "bin", "creatoros");
  if (platform === "win32") return join(env.LOCALAPPDATA, "CreatorOS", "bin", "creatoros.cmd");
  return null;
}

function resolveFixture({ pathHit, platform, env }) {
  return pathHit || fallbackCli(platform, env);
}

function contextDecision(candidates, explicitId) {
  if (explicitId && candidates.some((candidate) => candidate.id === explicitId)) {
    return { kind: "selected", id: explicitId };
  }
  if (candidates.length === 1) return { kind: "selected", id: candidates[0].id };
  return { kind: "needs_choice", ids: candidates.map((candidate) => candidate.id) };
}

function canRebindPatch({ stableId, beforeText, currentBlocks, currentText }) {
  if (stableId) {
    const matches = currentBlocks.filter((block) => block.id === stableId);
    return matches.length === 1 && matches[0].text === beforeText;
  }
  return currentText.split(beforeText).length - 1 === 1;
}

function executableOnPath(command) {
  const names = process.platform === "win32"
    ? [command, `${command}.cmd`, `${command}.exe`]
    : [command];
  return (process.env.PATH ?? "")
    .split(delimiter)
    .filter(Boolean)
    .flatMap((dir) => names.map((name) => join(dir, name)))
    .find((candidate) => existsSync(candidate) && statSync(candidate).isFile());
}

function runJson(command, args) {
  const result = spawnSync(command, args, {
    encoding: "utf8",
    shell: process.platform === "win32",
  });
  assert.equal(result.status, 0, `${command} ${args.join(" ")} failed: ${result.stderr}`);
  return JSON.parse(result.stdout);
}

const expectedFiles = [
  "SKILL.md",
  "agents/openai.yaml",
  "references/cli.md",
  "references/writing-skill-bridge.md",
];
assert.deepEqual(filesUnder(skillDir).sort(), expectedFiles.sort());

const skillText = readFileSync(join(skillDir, "SKILL.md"), "utf8");
const cliText = readFileSync(join(skillDir, "references", "cli.md"), "utf8");
const bridgeText = readFileSync(join(skillDir, "references", "writing-skill-bridge.md"), "utf8");
const publicText = [skillText, cliText, bridgeText].join("\n");

assert.match(skillText, /^---\nname: creatoros-cli\ndescription: [^\n]+\n---\n/);
assert.ok(skillText.split("\n").length < 500, "SKILL.md must stay below 500 lines");
assert.doesNotMatch(publicText, /\/Users\//);
assert.doesNotMatch(publicText, /[A-Za-z]:\\Users\\/);
assert.doesNotMatch(publicText, /zyongzhu|xusheng/i);
assert.doesNotMatch(publicText, /CREATOROS_(?:BASE_URL|EMAIL|PASSWORD|HANDSHAKE_TOKEN|CLI_ACCESS_TOKEN)/);

for (const required of [
  "command -v creatoros",
  "Get-Command creatoros",
  ".local/bin/creatoros",
  "$env:LOCALAPPDATA",
  "CreatorOS\\bin\\creatoros.cmd",
  "operations list",
  "operations describe",
  "--apply --idempotency-key",
  "tasks wait",
]) {
  assert.ok(publicText.includes(required), `missing public guidance: ${required}`);
}

for (const required of [
  "当前回读到的最新稿正文",
  "先展示",
  "写前重读",
  "写后回读",
  "重复文本",
  "不能冒充最新稿",
  "不能覆盖最终文案",
]) {
  assert.ok(bridgeText.includes(required) || skillText.includes(required), `missing bridge rule: ${required}`);
}

assert.equal(
  resolveFixture({ pathHit: "/opt/bin/creatoros", platform: "darwin", env: { HOME: "/Users/alice" } }),
  "/opt/bin/creatoros",
);
assert.equal(
  fallbackCli("darwin", { HOME: "/Users/alice" }),
  "/Users/alice/.local/bin/creatoros",
);
assert.equal(
  fallbackCli("darwin", { HOME: "/Users/bob" }),
  "/Users/bob/.local/bin/creatoros",
);
assert.equal(
  fallbackCli("win32", { LOCALAPPDATA: "D:\\Profiles\\Ada\\AppData\\Local" }),
  "D:\\Profiles\\Ada\\AppData\\Local/CreatorOS/bin/creatoros.cmd",
);

const choices = [{ id: "acct-a" }, { id: "acct-b" }];
assert.deepEqual(contextDecision([{ id: "acct-a" }]), { kind: "selected", id: "acct-a" });
assert.deepEqual(contextDecision(choices), { kind: "needs_choice", ids: ["acct-a", "acct-b"] });
assert.deepEqual(contextDecision(choices, "acct-b"), { kind: "selected", id: "acct-b" });

assert.equal(canRebindPatch({
  stableId: "block-7",
  beforeText: "旧段落",
  currentBlocks: [{ id: "block-7", text: "旧段落" }],
  currentText: "",
}), true);
assert.equal(canRebindPatch({
  stableId: "block-7",
  beforeText: "旧段落",
  currentBlocks: [{ id: "block-7", text: "已被别人修改" }],
  currentText: "",
}), false);
assert.equal(canRebindPatch({
  stableId: null,
  beforeText: "重复段落",
  currentBlocks: [],
  currentText: "重复段落\n重复段落",
}), false);

const pathCommand = executableOnPath("creatoros");
const fallbackCommand = process.platform === "darwin" && process.env.HOME
  ? fallbackCli("darwin", { HOME: process.env.HOME })
  : process.platform === "win32" && process.env.LOCALAPPDATA
    ? fallbackCli("win32", { LOCALAPPDATA: process.env.LOCALAPPDATA })
    : null;
const actualCommand = pathCommand ?? (fallbackCommand && existsSync(fallbackCommand) ? fallbackCommand : null);
assert.ok(actualCommand, "current installed creatoros CLI was not found");
const version = runJson(actualCommand, ["--version"]);
const help = runJson(actualCommand, ["help"]);
assert.equal(version.ok, true);
assert.equal(help.ok, true);
assert.match(help.usage, /^creatoros /);

console.log(JSON.stringify({
  ok: true,
  skillDir,
  files: expectedFiles,
  pathFixtures: 4,
  contextFixtures: 3,
  patchFixtures: 3,
  cliVersion: version.cliVersion,
  contractVersion: version.contractVersion,
}, null, 2));
