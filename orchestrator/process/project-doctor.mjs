#!/usr/bin/env node
// Read-only migration diagnostics. Never load/execute project scripts, hooks, or commands.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { verifyRuleBundle } from "./rule-bundle.mjs";

const PROCESS = "orchestrator/process";
const UPDATE = "从可信技能目录运行受保护的 init-project.sh --update；先检查迁移差异，保留项目定制。";
const isFile = (file) => fs.existsSync(file) && fs.statSync(file).isFile();
const plain = (value) => value !== null && typeof value === "object" && !Array.isArray(value);
const inside = (root, file) => !path.relative(root, file).split(path.sep).includes("..") && !path.isAbsolute(path.relative(root, file));
const withoutComments = (text) => text.split("\n").filter((line) => !/^\s*(?:#|\/\/)/.test(line)).join("\n");

// Deliberately supports only simple argv commands. Shell expansion/control flow stays unknown.
function words(command) {
  if (/[`;\n|&<>]|\$\(/.test(command)) return null;
  const result = [];
  let word = "", quote = "", started = false;
  for (let i = 0; i < command.length; i++) {
    const c = command[i];
    if (c === "\\" && quote !== "'") {
      if (++i === command.length) return null;
      word += command[i]; started = true;
    } else if (quote) {
      if (c === quote) quote = "";
      else word += c;
    } else if (c === "'" || c === '"') {
      quote = c; started = true;
    } else if (/\s/.test(c)) {
      if (started) result.push(word);
      word = ""; started = false;
    } else {
      word += c; started = true;
    }
  }
  if (quote) return null;
  if (started) result.push(word);
  return result;
}

function scriptTarget(command, root) {
  const argv = words(command);
  if (!argv?.length) return null;
  const interpreter = /^(?:bash|sh|zsh|node|python3?)$/.test(path.basename(argv[0]));
  const target = argv[interpreter ? 1 : 0];
  if (!target || target.startsWith("-") || !/\.(?:sh|mjs|cjs|js|py)$/.test(target)) return null;
  const expanded = target.replace(/\$(?:\{(CLAUDE_PROJECT_DIR|CODEX_PROJECT_DIR)\}|(CLAUDE_PROJECT_DIR|CODEX_PROJECT_DIR))/g, root);
  if (/[$~]/.test(expanded)) return null;
  return { file: path.resolve(root, expanded), args: argv.slice(interpreter ? 2 : 1) };
}

function reconcileHookModes(text) {
  const active = withoutComments(text);
  const modes = new Set();
  const inspect = (argv) => {
    if (!argv?.length || path.basename(argv[0]) !== "reconcile.mjs") return;
    const args = argv.slice(1);
    const at = args.indexOf("--profile");
    const profile = at >= 0 ? args[at + 1] : args.find((arg) => arg.startsWith("--profile="))?.slice(10);
    if (args.some((arg) => /[$`]/.test(arg)) || (at >= 0 && !profile)) modes.add("unknown");
    else if (!profile || profile === "full") modes.add("full");
    else if (profile !== "quick" || !args.includes("--read-only")) modes.add("unknown");
  };
  for (const line of active.split("\n")) {
    if (/^\s*node\s/.test(line)) inspect(words(line.replace(/\s+#.*$/, "").trim())?.slice(1));
  }
  for (const match of active.matchAll(/(?:spawnSync|execFileSync)\(\s*(?:process\.execPath|["']node["'])\s*,\s*\[([\s\S]*?)\]/g)) {
    const values = [...match[1].matchAll(/(["'])([^"']*)\1/g)];
    if (match[1].replace(/(["'])([^"']*)\1/g, "").replace(/[\s,]/g, "")) {
      if (values[0]?.[2]?.endsWith("reconcile.mjs")) modes.add("unknown");
    } else inspect(values.map((value) => value[2]));
  }
  return modes;
}

function runBlocks(text) {
  const lines = text.split("\n"), blocks = [];
  for (let i = 0; i < lines.length; i++) {
    const m = lines[i].match(/^(\s*)(?:-\s+)?run:\s*(.*)$/);
    if (!m) continue;
    if (/^[|>][-+]?$/.test(m[2])) {
      const block = [];
      while (i + 1 < lines.length && (!lines[i + 1].trim() || lines[i + 1].search(/\S/) > m[1].length)) block.push(lines[++i]);
      blocks.push(withoutComments(block.join("\n")));
    } else blocks.push(m[2].replace(/^(['"])(.*)\1$/, "$2"));
  }
  return blocks;
}

export function diagnoseProject(projectRoot = process.cwd()) {
  const root = path.resolve(projectRoot), findings = [];
  const add = (code, severity, file, message, remedy) => {
    const relative = path.isAbsolute(file) ? path.relative(root, file) : file;
    if (!findings.some((f) => f.code === code && f.path === relative && f.message === message))
      findings.push({ code, severity, path: relative.split(path.sep).join("/"), message, remedy });
  };
  const read = (relative) => fs.readFileSync(path.resolve(root, relative), "utf8");
  const json = (relative, { hostConfig = false } = {}) => {
    if (!isFile(path.resolve(root, relative))) return null;
    let value;
    try {
      value = JSON.parse(read(relative));
    } catch (error) {
      add(hostConfig ? "HOST_CONFIG_FORMAT_UNKNOWN" : "INVALID_JSON", hostConfig ? "unknown" : "error", relative,
        `无法按严格 JSON 读取${hostConfig ? "宿主配置（可能含宿主支持的注释/JSON5）" : ""}：${error.message}`,
        hostConfig ? "按实际宿主格式人工核对并合并 hook；不覆盖原配置。" : "修复文件格式，保留原有项目字段后重新诊断。");
      return null;
    }
    if (!plain(value)) {
      add("INVALID_JSON_STRUCTURE", "error", relative, "JSON 已解析，但顶层不是所需的对象。", "修复结构，保留合法项目字段。");
      return null;
    }
    return value;
  };
  if (!fs.existsSync(root) || !fs.statSync(root).isDirectory()) throw new Error(`项目目录不存在：${root}`);
  if (!fs.existsSync(path.join(root, PROCESS))) {
    add("PROJECT_ENGINE_MISSING", "error", PROCESS, "项目未安装编排运行时。", "先确认 --root 指向产品项目；需要接入时再执行初始化。");
  }
  const stampPath = `${PROCESS}/.skill-version`;
  const stamp = isFile(path.join(root, stampPath))
    ? Object.fromEntries(read(stampPath).split("\n").filter((line) => line.includes("=")).map((line) => [line.slice(0, line.indexOf("=")), line.slice(line.indexOf("=") + 1)]))
    : {};
  if (!stamp.version) add("ENGINE_VERSION_UNKNOWN", "warning", stampPath, "没有可核对的运行时版本记录。", UPDATE);
  const vendor = json(`${PROCESS}/.vendor-manifest.json`);
  if (vendor?.skill_version && stamp.version && vendor.skill_version !== stamp.version)
    add("ENGINE_VERSION_MISMATCH", "error", stampPath, `版本记录 ${stamp.version} 与运行时清单 ${vendor.skill_version} 不一致。`, UPDATE);

  const bundlePath = `${PROCESS}/rule-bundle`, bundleRoot = path.join(root, bundlePath);
  const bundlePinned = stamp.rule_bundle_sha256 !== undefined || stamp.rule_bundle_version !== undefined;
  let bundle = null;
  if (!isFile(path.join(bundleRoot, "manifest.json"))) {
    add("RULE_BUNDLE_MISSING", bundlePinned ? "error" : "warning", bundlePath,
      bundlePinned ? "已固定规则包记录，但项目规则包缺失。" : "旧项目尚未固定可移植规则包。", UPDATE);
  } else {
    try {
      bundle = verifyRuleBundle(bundleRoot, { expectedHash: stamp.rule_bundle_sha256, expectedVersion: stamp.version });
      if (stamp.rule_bundle_version && bundle.skill_version !== stamp.rule_bundle_version)
        add("RULE_BUNDLE_VERSION_MISMATCH", "error", stampPath, "规则包版本与固定记录不一致。", UPDATE);
      if (!stamp.rule_bundle_sha256)
        add("RULE_BUNDLE_UNPINNED", "warning", stampPath, "规则包存在，但版本记录尚未固定其内容哈希。", UPDATE);
    } catch (error) {
      add("RULE_BUNDLE_INVALID", "error", `${bundlePath}/manifest.json`, `规则包校验失败：${error.message}`, UPDATE);
    }
  }
  if (!bundle && !bundlePinned && stamp.skill_dir)
    add("LOCAL_SKILL_DEPENDENCY", "warning", stampPath, `没有可用的项目规则包；现有 skill_dir 依赖机器本地路径 ${stamp.skill_dir}。`, "先固定项目规则包；不要仅复制本机绝对路径到其他机器。");

  for (const registry of [".claude/settings.json", ".claude/settings.local.json", ".codex/hooks.json"]) {
    const config = json(registry, { hostConfig: true });
    if (!config || !Object.hasOwn(config, "hooks")) continue;
    if (!plain(config.hooks)) {
      add("HOOK_REGISTRY_INVALID", "error", registry, "hooks 应为按事件组织的对象。", "按宿主格式修复注册；不要覆盖已有定制命令。");
      continue;
    }
    for (const [event, groups] of Object.entries(config.hooks)) {
      if (!Array.isArray(groups)) {
        add("HOOK_REGISTRY_INVALID", "error", registry, `${event} 应为 hooks 数组。`, "对照实际宿主配置修复结构，保留合法定制。");
        continue;
      }
      if (groups.some((group) => !plain(group) || !Array.isArray(group.hooks)))
        add("HOOK_REGISTRY_INVALID", "error", registry, `${event} 分组缺少 hooks 数组。`, "对照实际宿主配置修复结构，保留合法定制。");
      for (const hook of groups.flatMap((group) => Array.isArray(group?.hooks) ? group.hooks : [])) {
        if (hook?.type !== "command" || typeof hook.command !== "string") continue;
        const target = scriptTarget(hook.command, root);
        if (!target) {
          add("HOOK_COMMAND_UNKNOWN", "unknown", registry, `${event} 使用自定义或复杂命令，未执行或解析其调用目标。`, "人工核对命令、工作目录与变量；保留合法定制，不自动替换。");
          continue;
        }
        if (!isFile(target.file)) {
          add("HOOK_TARGET_MISSING", "error", registry, `${event} 注册的脚本不存在：${target.file}`, "将此注册路径改为当前项目的真实脚本，或移除已停用的注册；保留其他 hook。");
          continue;
        }
        if (!inside(fs.realpathSync(root), fs.realpathSync(target.file)))
          add("HOOK_EXTERNAL_PATH", "warning", registry, `${event} 依赖项目外脚本：${target.file}`, "核对目标是否应随项目分发；诊断未修改外部脚本。");
        if (["Stop", "PostToolUse"].includes(event)) {
          const modes = reconcileHookModes(path.basename(target.file) === "reconcile.mjs"
            ? hook.command : fs.readFileSync(target.file, "utf8"));
          if (modes.has("full"))
            add("LEGACY_FULL_RECONCILE_HOOK", "warning", registry, `${event} 保留完整 reconcile 调用：${target.file}；触发条件和耗时未执行验证。`,
              "核对后将高频 hook 人工迁移为 --profile quick --read-only；完整 lessons 留在明确触发的验证步骤。");
          if (modes.has("unknown"))
            add("HOOK_RECONCILE_MODE_UNKNOWN", "unknown", registry, `${event} 的 reconcile 参数不能确认为 quick --read-only：${target.file}`, "人工核对实际参数与调用条件；诊断未运行命令，也不据 quick 字面串判断安全。");
        }
      }
    }
  }

  for (const entry of ["AGENTS.md", "CLAUDE.md", "PROJECT_CONTEXT.md"]) {
    if (!isFile(path.join(root, entry))) continue;
    const refs = new Set(read(entry).match(/(?:orchestrator\/(?:process\/)?)?(?:rules|prompts|gates)\/[A-Za-z0-9_./-]+\.md/g) ?? []);
    for (const ref of refs) {
      const logical = ref.replace(/^orchestrator\/(?:process\/)?/, "");
      const candidates = [path.join(root, ref), path.join(root, PROCESS, logical), path.join(bundleRoot, logical)];
      if (candidates.some(isFile)) continue;
      add("ENTRY_RULE_REFERENCE_MISSING", ref.startsWith("orchestrator/") ? "error" : "warning", entry,
        `入口引用 ${ref}，项目内及规则包均无对应文件；外部技能未读取。`,
        "核对当前规则中的替代说明，修改此引用；不要自动删除项目自有约束。");
    }
  }

  const workflowsDir = path.join(root, ".github/workflows");
  const workflows = fs.existsSync(workflowsDir) && fs.statSync(workflowsDir).isDirectory()
    ? fs.readdirSync(workflowsDir).filter((name) => /\.ya?ml$/.test(name) && isFile(path.join(workflowsDir, name))) : [];
  if (workflows.length) {
    const pkg = json("package.json");
    const range = String(pkg?.engines?.node ?? "").match(/^>=\s*(\d+)\s+<\s*(\d+)$/);
    const calls = [];
    for (const workflow of workflows) {
      const relative = `.github/workflows/${workflow}`, source = withoutComments(read(relative));
      if (runBlocks(source).some((block) => block.split("\n").some((line) =>
        /^\s*node\s+["']?(?:\.\/)?orchestrator\/process\/reconcile\.mjs(?:["']|\s|$)/.test(line)))) calls.push(relative);
      if (!range) continue;
      const lines = source.split("\n");
      for (let i = 0; i < lines.length; i++) {
        if (!/uses:\s*actions\/setup-node@/.test(lines[i])) continue;
        for (let j = i + 1; j < lines.length && !/^\s*-\s/.test(lines[j]); j++) {
          const fixed = lines[j].match(/^\s*node-version:\s*["']?(\d+)(?:\.\d+){0,2}["']?\s*(?:#.*)?$/);
          if (fixed && (+fixed[1] < +range[1] || +fixed[1] >= +range[2]))
            add("WORKFLOW_NODE_RANGE_MISMATCH", "warning", relative, `setup-node 固定 Node ${fixed[1]}，与根 engines.node=${pkg.engines.node} 不符。`,
              "核对该 job 是否使用根工具链，再改为项目版本文件或匹配的版本；不自动改定制 workflow。");
        }
      }
    }
    if (!calls.length)
      add("GOVERNANCE_CI_NOT_DETECTED", "warning", ".github/workflows", "已有 GitHub workflows，但未发现受支持的直接 reconcile 调用；间接命令未追踪。", "核对实际调用链；需要时人工合并 quick --read-only 治理步骤，保留现有验证。");
    add("CI_REQUIRED_CHECKS_UNKNOWN", "unknown", ".github/workflows",
      calls.length ? `本地发现 reconcile 调用：${calls.join(", ")}；远端 required checks 未读取。` : "远端分支保护与 required checks 未读取。",
      "在托管平台核实实际 workflow 执行结果与分支规则；本地文本不能证明门禁不可绕过。");
  }
  const summary = { errors: 0, warnings: 0, unknown: 0 };
  for (const finding of findings) summary[{ error: "errors", warning: "warnings", unknown: "unknown" }[finding.severity]]++;
  return { schema: "orchestrator-project-doctor/v1", root, summary, findings };
}

function main(argv) {
  let root = process.cwd(), asJson = false;
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === "--json") asJson = true;
    else if (argv[i] === "--root" && argv[i + 1] && !argv[i + 1].startsWith("--")) root = argv[++i];
    else if (argv[i] === "--help") {
      console.log("Usage: node project-doctor.mjs [--root PATH] [--json]\n只读迁移诊断；exit 0=无确定错误（可含 warning/unknown），1=确定断链，2=参数/读取错误。");
      return 0;
    } else throw new Error(`未知或不完整参数：${argv[i]}`);
  }
  const report = diagnoseProject(root);
  if (asJson) console.log(JSON.stringify(report, null, 2));
  else {
    for (const f of report.findings) console.log(`[${f.severity}] ${f.code} ${f.path}\n  ${f.message}\n  建议：${f.remedy}`);
    console.log(`project-doctor: ${report.summary.errors} error, ${report.summary.warnings} warning, ${report.summary.unknown} unknown。仅静态诊断，未执行项目命令或读取远端状态。`);
  }
  return report.summary.errors ? 1 : 0;
}

function isDirectExecution() {
  if (!process.argv[1]) return false;
  try {
    // Node resolves module symlinks, while argv retains the caller's spelling
    // (including macOS /tmp -> /private/tmp). Compare file identity, not spelling.
    return fs.realpathSync(process.argv[1]) === fs.realpathSync(fileURLToPath(import.meta.url));
  } catch {
    return false;
  }
}

if (isDirectExecution()) {
  try { process.exitCode = main(process.argv.slice(2)); }
  catch (error) { console.error(`project-doctor: ${error.message}`); process.exitCode = 2; }
}
