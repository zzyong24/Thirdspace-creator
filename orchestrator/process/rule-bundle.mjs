#!/usr/bin/env node
// Project-local, content-pinned reading material. This is separate from the executable
// engine manifest: updating the engine must not silently replace project-edited rules.
import fs from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";
import { fileURLToPath } from "node:url";

export const RULE_BUNDLE_SCHEMA = "orchestrator-rule-bundle/v1";
export const RULE_BUNDLE_DIRECTORY = "rule-bundle";
const ROOTS = ["rules", "prompts", "workflows", "gates", "templates"];
const SOURCE_ROOTS = new Set([...ROOTS, "decisions", "tools", "process"]);
const DOCUMENT = /\.(?:md|json|ya?ml)$/;
const HASH = /^[a-f0-9]{64}$/;
const sha = (value) => createHash("sha256").update(value).digest("hex");
const portable = (value) => value.split(path.sep).join("/");
const byPath = ([a], [b]) => a < b ? -1 : a > b ? 1 : 0;
const contentHash = (files) => sha(JSON.stringify(Object.entries(files).sort(byPath)));

function safeRelative(relative) {
  if (typeof relative !== "string" || !relative || path.isAbsolute(relative)
      || relative.includes("\\") || relative.split("/").some((part) => !part || part === "." || part === "..")) {
    throw new Error(`rule bundle 含不安全路径: ${String(relative)}`);
  }
  return relative;
}

function regularFile(root, relative) {
  safeRelative(relative);
  let cursor = root;
  if (!fs.existsSync(root) || fs.lstatSync(root).isSymbolicLink()) {
    throw new Error(`rule bundle 根不存在或是 symlink: ${root}`);
  }
  for (const part of relative.split("/")) {
    cursor = path.join(cursor, part);
    if (!fs.existsSync(cursor) || fs.lstatSync(cursor).isSymbolicLink()) {
      throw new Error(`rule bundle 文件缺失或是 symlink: ${relative}`);
    }
  }
  if (!fs.statSync(cursor).isFile()) throw new Error(`rule bundle 不是文件: ${relative}`);
  return cursor;
}

function filesBelow(root) {
  const files = [];
  const visit = (directory) => {
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
      const absolute = path.join(directory, entry.name);
      if (entry.isSymbolicLink()) throw new Error(`rule bundle 不接受 symlink: ${absolute}`);
      if (entry.isDirectory()) visit(absolute);
      else if (entry.isFile()) files.push(portable(path.relative(root, absolute)));
    }
  };
  visit(root);
  return files.sort();
}

// Runtime commands refer to orchestrator/process in the project, not another engine
// inside this reading bundle. Template links to generated project files are not
// source dependencies. Follow rule/document links and explicit source-root pointers.
function sourceReferences(relative, text) {
  const references = new Set();
  const add = (candidate) => {
    const normalized = path.posix.normalize(candidate);
    if (!SOURCE_ROOTS.has(normalized.split("/")[0]) || !DOCUMENT.test(normalized)) return;
    if (normalized.split("/").includes("..")) throw new Error(`rule bundle 引用越界: ${relative} → ${candidate}`);
    references.add(normalized);
  };
  for (const match of text.matchAll(/(?<![\w./-])((?:rules|prompts|workflows|gates|templates|decisions)\/[A-Za-z0-9_./-]+\.(?:md|json|ya?ml))\b/g)) {
    add(match[1]);
  }
  for (const match of text.matchAll(/(?<![\w./-])(process\/[A-Za-z0-9_./-]+\.md)\b/g)) add(match[1]);
  if (!relative.endsWith(".md")) return [...references];
  if (!relative.startsWith("templates/")) {
    for (const [, target] of text.matchAll(/`((?:\.{1,2}\/)?[A-Za-z0-9_.-]+(?:\/[A-Za-z0-9_.-]+)+\.md)`/g)) {
      if (SOURCE_ROOTS.has(target.split("/")[0])) add(target);
      else if (target.startsWith("./") || target.startsWith("../")
          || (relative.startsWith("process/") && target.startsWith("harness/"))
          || (relative.startsWith("decisions/") && target.startsWith("files/"))) {
        add(path.posix.join(path.posix.dirname(relative), target));
      }
    }
  }
  for (const match of text.matchAll(/\]\(([^)\n]+)\)/g)) {
    const target = match[1].trim().replace(/^<([^>]+)>$/, "$1").split(/[#?]/)[0];
    if (!target || /^(?:[a-z][a-z0-9+.-]*:|\/)/i.test(target) || !DOCUMENT.test(target)) continue;
    // Templates contain links that become valid only after they are instantiated.
    if (relative.startsWith("templates/")) continue;
    add(path.posix.join(path.posix.dirname(relative), target));
  }
  return [...references];
}

export function collectRuleBundle(skillRoot) {
  // Skill managers expose installations through symlink aliases. Resolve the
  // installation root once; individual bundle entries must still be regular files.
  skillRoot = fs.realpathSync(path.resolve(skillRoot));
  const wanted = new Set(["VERSION", "SKILL.md", "tools/init-module.sh", "tools/init-program.sh"]);
  for (const directory of ROOTS) {
    const root = path.join(skillRoot, directory);
    if (!fs.existsSync(root)) throw new Error(`rule bundle source 缺目录: ${directory}`);
    for (const relative of filesBelow(root)) {
      if (DOCUMENT.test(relative)) wanted.add(`${directory}/${relative}`);
    }
  }
  const contents = new Map();
  for (const relative of wanted) {
    const file = regularFile(skillRoot, relative);
    const data = fs.readFileSync(file);
    contents.set(relative, data);
    for (const reference of sourceReferences(relative, data.toString("utf8"))) wanted.add(reference);
  }
  const files = Object.fromEntries([...contents].sort(byPath).map(([relative, data]) => [relative, sha(data)]));
  const version = contents.get("VERSION").toString("utf8").trim();
  if (!version) throw new Error("rule bundle source VERSION 为空");
  return {
    contents,
    manifest: {
      schema: RULE_BUNDLE_SCHEMA,
      skill_version: version,
      content_sha256: contentHash(files),
      files,
    },
  };
}

export function verifyRuleBundle(bundleRoot, { expectedHash, expectedVersion } = {}) {
  const manifestFile = regularFile(bundleRoot, "manifest.json");
  let manifest;
  try { manifest = JSON.parse(fs.readFileSync(manifestFile, "utf8")); }
  catch (error) { throw new Error(`rule bundle manifest 无法解析: ${error.message}`); }
  if (manifest?.schema !== RULE_BUNDLE_SCHEMA || typeof manifest.skill_version !== "string"
      || !manifest.skill_version || !manifest.files || Array.isArray(manifest.files)
      || typeof manifest.files !== "object" || !Object.keys(manifest.files).length
      || !HASH.test(manifest.content_sha256 ?? "")) {
    throw new Error(`rule bundle manifest 必须为 ${RULE_BUNDLE_SCHEMA}`);
  }
  if (expectedHash !== undefined && manifest.content_sha256 !== expectedHash) {
    throw new Error("rule bundle 内容 hash 与 .skill-version 固定值不符");
  }
  if (expectedVersion !== undefined && manifest.skill_version !== expectedVersion) {
    throw new Error("rule bundle 版本与 .skill-version 固定值不符");
  }
  if (contentHash(manifest.files) !== manifest.content_sha256) {
    throw new Error("rule bundle manifest content_sha256 不匹配");
  }
  for (const [relative, expected] of Object.entries(manifest.files)) {
    if (relative === "manifest.json" || !HASH.test(expected)) throw new Error(`rule bundle manifest hash 无效: ${relative}`);
    const actual = sha(fs.readFileSync(regularFile(bundleRoot, relative)));
    if (actual !== expected) throw new Error(`rule bundle 文件 hash 不匹配（保留本地修改）: ${relative}`);
  }
  for (const relative of filesBelow(bundleRoot)) {
    if (relative !== "manifest.json" && !Object.hasOwn(manifest.files, relative)) {
      throw new Error(`rule bundle 含未登记文件（保留本地修改）: ${relative}`);
    }
  }
  for (const relative of Object.keys(manifest.files)) {
    for (const reference of sourceReferences(relative, fs.readFileSync(path.join(bundleRoot, relative), "utf8"))) {
      if (!Object.hasOwn(manifest.files, reference)) throw new Error(`rule bundle 引用闭包缺失: ${relative} → ${reference}`);
    }
  }
  if (fs.readFileSync(regularFile(bundleRoot, "VERSION"), "utf8").trim() !== manifest.skill_version) {
    throw new Error("rule bundle VERSION 与 manifest 版本不符");
  }
  return manifest;
}

export function ruleBundlePin(processRoot) {
  const stamp = path.join(processRoot, ".skill-version");
  const raw = fs.existsSync(stamp) ? fs.readFileSync(stamp, "utf8") : "";
  return {
    expectedHash: raw.match(/^rule_bundle_sha256=(.*)$/m)?.[1]?.trim(),
    expectedVersion: raw.match(/^rule_bundle_version=(.*)$/m)?.[1]?.trim(),
  };
}

export function projectRuleBundle(processRoot) {
  const bundleRoot = path.join(processRoot, RULE_BUNDLE_DIRECTORY);
  const pin = ruleBundlePin(processRoot);
  if (!fs.existsSync(bundleRoot)) {
    if (pin.expectedHash !== undefined || pin.expectedVersion !== undefined) {
      throw new Error("rule bundle 已固定但目录缺失；拒绝回退到本机 skill");
    }
    return null;
  }
  return { root: bundleRoot, manifest: verifyRuleBundle(bundleRoot, pin) };
}

function writeBundle(destination, bundle) {
  fs.mkdirSync(destination, { recursive: true });
  for (const [relative, data] of bundle.contents) {
    const file = path.join(destination, relative);
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, data, { flag: "wx" });
  }
  fs.writeFileSync(path.join(destination, "manifest.json"), `${JSON.stringify(bundle.manifest, null, 2)}\n`, { flag: "wx" });
  verifyRuleBundle(destination);
}

function migrationCandidate(processRoot, bundle) {
  const destination = path.join(path.dirname(processRoot), ".rule-bundle-update-candidates", bundle.manifest.content_sha256);
  if (!fs.existsSync(destination)) writeBundle(destination, bundle);
  console.error(`! incoming rule bundle candidate（未启用）: ${destination}`);
  return destination;
}

export function preflightRuleBundle(skillRoot, processRoot) {
  const bundle = collectRuleBundle(skillRoot);
  try { projectRuleBundle(processRoot); }
  catch (error) {
    migrationCandidate(processRoot, bundle);
    throw new Error(`${error.message}；更新在修改 active engine/rules 前停止。请先比较候选与项目定制并迁移，不能删除 manifest 绕过。`);
  }
  return bundle;
}

export function installRuleBundle(skillRoot, processRoot) {
  const bundle = preflightRuleBundle(skillRoot, processRoot);
  const destination = path.join(processRoot, RULE_BUNDLE_DIRECTORY);
  const current = projectRuleBundle(processRoot);
  if (current?.manifest.content_sha256 === bundle.manifest.content_sha256
      && current.manifest.skill_version === bundle.manifest.skill_version) return current.manifest;
  const stage = `${destination}.incoming-${process.pid}`;
  const previous = `${destination}.previous-${process.pid}`;
  if (fs.existsSync(stage) || fs.existsSync(previous)) throw new Error("rule bundle 安装临时目录已存在；请先检查上次中断");
  writeBundle(stage, bundle);
  try {
    if (fs.existsSync(destination)) fs.renameSync(destination, previous);
    fs.renameSync(stage, destination);
  } catch (error) {
    if (!fs.existsSync(destination) && fs.existsSync(previous)) fs.renameSync(previous, destination);
    fs.rmSync(stage, { recursive: true, force: true });
    throw error;
  }
  fs.rmSync(previous, { recursive: true, force: true });
  return bundle.manifest;
}

function stamp(processRoot, skillRoot) {
  const manifest = verifyRuleBundle(path.join(processRoot, RULE_BUNDLE_DIRECTORY));
  const destination = path.join(processRoot, ".skill-version");
  const temporary = `${destination}.tmp-${process.pid}`;
  fs.writeFileSync(temporary, `version=${manifest.skill_version}\nskill_dir=${path.resolve(skillRoot)}\nrule_bundle_version=${manifest.skill_version}\nrule_bundle_sha256=${manifest.content_sha256}\n`, { flag: "wx" });
  fs.renameSync(temporary, destination);
}

if (process.argv[1] && fs.realpathSync(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const [command, first, second] = process.argv.slice(2);
  try {
    if (command === "verify" && first && !second) {
      const result = projectRuleBundle(path.resolve(first));
      if (!result) throw new Error("legacy 项目未安装 rule bundle，仍依赖本机 skill");
      console.log(`✓ rule bundle ${result.manifest.skill_version} ${result.manifest.content_sha256}`);
    } else if (["preflight", "install"].includes(command) && first && second) {
      const skillRoot = path.resolve(first), processRoot = path.resolve(second);
      if (command === "preflight") preflightRuleBundle(skillRoot, processRoot);
      else {
        const manifest = installRuleBundle(skillRoot, processRoot);
        stamp(processRoot, skillRoot);
        console.log(`✓ rule bundle ${manifest.skill_version}: ${Object.keys(manifest.files).length} files, sha256=${manifest.content_sha256}`);
      }
    } else throw new Error("usage: rule-bundle.mjs <preflight|install> <skill-root> <project-process> | verify <project-process>");
  } catch (error) {
    console.error(`✗ ${error.message}`);
    process.exitCode = 3;
  }
}
