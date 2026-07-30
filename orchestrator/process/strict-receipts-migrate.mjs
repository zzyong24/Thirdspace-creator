#!/usr/bin/env node
// 将旧项目的活动任务表一次性升级为 strict receipts。
//
// 用法：
//   node orchestrator/process/strict-receipts-migrate.mjs check
//   node orchestrator/process/strict-receipts-migrate.mjs apply [--non-ui T-001,T-002]
//
// 安全边界：
// - 只处理 BACKLOG.md 中第一个含 ID + 状态且含任务状态 emoji 的活动任务表；
// - 未明确列入 --non-ui 的任务一律设为「待验」，不猜测 UI/非 UI；
// - 缺失审核列时一律补「待审」，不伪造免审或历史 review receipt；
// - BACKLOG 与 reconcile.config.json 预先完整校验，再在项目状态锁内提交；
// - 写入异常立即回滚；进程级中断留下 recovery journal，下次调用先恢复一致状态。零第三方依赖。

import {
  existsSync,
  mkdirSync,
  readFileSync,
  realpathSync,
  renameSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import { createHash } from "node:crypto";
import path from "node:path";
import { acquireStateLock } from "./state-lock.mjs";

const ACTIVE_STATUS = /📋|🔨|✅|⏸️?|⛔/u;
const VALID_ACCEPTANCE = /^(?:—|待验|PASS:[a-f0-9]{12})$/i;
const TRANSACTION_SCHEMA = "strict-receipts-transaction/v1";
const digest = (value) => createHash("sha256").update(value).digest("hex");

function die(message) {
  console.error(`✗ ${message}`);
  process.exit(1);
}

function isTableRow(line) {
  return line.trimStart().startsWith("|");
}

function isSeparator(line) {
  const value = line.trim();
  return isTableRow(line) && value.includes("-") && /^[|\s:\-]+$/.test(value);
}

function parseRow(line) {
  const segments = line.split("|");
  const start = segments[0]?.trim() === "" ? 1 : 0;
  const end = segments.at(-1)?.trim() === "" ? segments.length - 1 : segments.length;
  const indexes = [];
  for (let index = start; index < end; index += 1) indexes.push(index);
  return {
    segments,
    indexes,
    cells: indexes.map((index) => segments[index].trim()),
  };
}

function renderRow(cells) {
  return `| ${cells.join(" | ")} |`;
}

function findActiveTable(lines) {
  const candidates = [];
  for (let headerIndex = 0; headerIndex < lines.length - 1; headerIndex += 1) {
    if (!isTableRow(lines[headerIndex]) || !isSeparator(lines[headerIndex + 1])) continue;
    const header = parseRow(lines[headerIndex]).cells;
    const id = header.findIndex((cell) => cell.toUpperCase() === "ID");
    const status = header.findIndex((cell) => cell.includes("状态"));
    if (id < 0 || status < 0) continue;

    const rows = [];
    let cursor = headerIndex + 2;
    while (cursor < lines.length && isTableRow(lines[cursor]) && !isSeparator(lines[cursor])) {
      const parsed = parseRow(lines[cursor]);
      if (parsed.cells.some((cell) => cell.trim())) rows.push({ lineIndex: cursor, ...parsed });
      cursor += 1;
    }
    if (rows.some((row) => ACTIVE_STATUS.test(row.cells[status] ?? ""))) {
      candidates.push({ headerIndex, separatorIndex: headerIndex + 1, header, id, status, rows });
    }
  }
  if (!candidates.length) {
    throw new Error("BACKLOG.md 中找不到含 ID、状态和任务状态 emoji 的活动任务表");
  }
  if (candidates.length > 1) {
    throw new Error(
      `BACKLOG.md 中找到 ${candidates.length} 个活动任务表；请先合并为唯一活动任务表，避免迁移错表`,
    );
  }
  return candidates[0];
}

function parseArgs(argv) {
  const command = argv[0];
  if (!["check", "apply"].includes(command ?? "")) {
    throw new Error("用法: strict-receipts-migrate.mjs <check|apply> [--non-ui T-001,T-002]");
  }
  const nonUi = new Set();
  for (let index = 1; index < argv.length; index += 1) {
    const token = argv[index];
    if (token !== "--non-ui") throw new Error(`未知参数 ${token}`);
    let consumed = 0;
    while (index + 1 < argv.length && !argv[index + 1].startsWith("--")) {
      const value = argv[index + 1];
      for (const id of value.split(",").map((item) => item.trim()).filter(Boolean)) nonUi.add(id);
      consumed += 1;
      index += 1;
    }
    if (!consumed) throw new Error("--non-ui 必须提供一个或多个任务 ID");
  }
  return { command, nonUi };
}

function readConfig(configFile) {
  if (!existsSync(configFile)) return { exists: false, source: null, value: {} };
  const source = readFileSync(configFile, "utf8");
  let value;
  try {
    value = JSON.parse(source);
  } catch (error) {
    throw new Error(`reconcile.config.json 无法解析，拒绝覆盖: ${error.message}`);
  }
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("reconcile.config.json 顶层必须是 object");
  }
  if (
    value.frontend_verify_commands != null &&
    (typeof value.frontend_verify_commands !== "object" ||
      Array.isArray(value.frontend_verify_commands))
  ) {
    throw new Error("frontend_verify_commands 必须是 object");
  }
  return { exists: true, source, value };
}

function inspect({ backlogSource, config, nonUi }) {
  const lines = backlogSource.split("\n");
  const table = findActiveTable(lines);
  const review = table.header.findIndex((cell) => cell.includes("审核"));
  const acceptance = table.header.findIndex((cell) => cell.includes("验收"));
  for (const [label, matches] of [
    ["ID", table.header.filter((cell) => cell.toUpperCase() === "ID")],
    ["状态", table.header.filter((cell) => cell.includes("状态"))],
    ["审核", table.header.filter((cell) => cell.includes("审核"))],
    ["验收", table.header.filter((cell) => cell.includes("验收"))],
  ]) {
    if (matches.length > 1) throw new Error(`活动任务表含重复「${label}」列，拒绝歧义迁移`);
  }
  const ids = new Set();
  const duplicateIds = new Set();
  for (const row of table.rows) {
    if (row.cells.length !== table.header.length) {
      throw new Error(
        `活动任务表第 ${row.lineIndex + 1} 行有 ${row.cells.length} 列，表头有 ${table.header.length} 列；` +
          "拒绝在畸形表格上迁移",
      );
    }
    const id = row.cells[table.id]?.trim();
    if (!id) throw new Error(`活动任务表第 ${row.lineIndex + 1} 行缺 ID`);
    if (!ACTIVE_STATUS.test(row.cells[table.status] ?? "")) {
      throw new Error(`活动任务 ${id} 缺合法状态 emoji，拒绝猜测`);
    }
    if (ids.has(id)) duplicateIds.add(id);
    ids.add(id);
  }
  if (duplicateIds.size) {
    throw new Error(`活动任务表任务 ID 重复: ${[...duplicateIds].join(", ")}`);
  }
  const unknown = [...nonUi].filter((id) => !ids.has(id));
  if (unknown.length) {
    throw new Error(`--non-ui 含不在活动任务表中的 ID: ${unknown.join(", ")}`);
  }

  const problems = [];
  if (config.value.receipt_policy !== "required") {
    problems.push(
      `receipt_policy=${JSON.stringify(config.value.receipt_policy ?? "(missing)")}，必须迁移为 required`,
    );
  }
  if (config.value.frontend_verify_commands == null) {
    problems.push("reconcile.config.json 缺 frontend_verify_commands");
  }
  if (review < 0) problems.push("活动任务表缺少「审核」列");
  if (acceptance < 0) {
    problems.push("活动任务表缺少「验收」列");
  } else {
    for (const row of table.rows) {
      const value = row.cells[acceptance]?.trim() ?? "";
      if (!VALID_ACCEPTANCE.test(value)) {
        problems.push(`${row.cells[table.id]} 的验收值「${value || "(空)"}」不合法`);
      }
    }
  }
  return { lines, table, review, acceptance, problems };
}

function migrateBacklog({ backlogSource, config, nonUi }) {
  const inspected = inspect({ backlogSource, config, nonUi });
  const { lines, table } = inspected;
  const migratingLegacy = config.value.receipt_policy !== "required";
  const header = [...table.header];
  const originalReview = inspected.review;
  const originalAcceptance = inspected.acceptance;

  // Canonical placement is immediately after 文档; if 文档 is absent, append.
  let insertion = header.findIndex((cell) => cell.includes("文档"));
  insertion = insertion >= 0 ? insertion + 1 : header.length;
  if (originalReview < 0) {
    header.splice(insertion, 0, "审核");
    insertion += 1;
  } else {
    insertion = header.findIndex((cell) => cell.includes("审核")) + 1;
  }
  if (originalAcceptance < 0) header.splice(insertion, 0, "验收");

  const newReview = header.findIndex((cell) => cell.includes("审核"));
  const newAcceptance = header.findIndex((cell) => cell.includes("验收"));
  lines[table.headerIndex] = renderRow(header);
  lines[table.separatorIndex] = renderRow(header.map(() => "---"));

  for (const row of table.rows) {
    const oldByHeader = new Map(table.header.map((name, index) => [name, row.cells[index] ?? ""]));
    const id = row.cells[table.id].trim();
    const migrated = header.map((name) => oldByHeader.get(name) ?? "");
    if (originalReview < 0 || !migrated[newReview].trim()) migrated[newReview] = "待审";
    if (migratingLegacy || originalAcceptance < 0 || !migrated[newAcceptance].trim()) {
      migrated[newAcceptance] = nonUi.has(id) ? "—" : "待验";
    } else if (nonUi.has(id) && migrated[newAcceptance] === "待验") {
      // 对已 strict 但尚未验收的任务，显式分类仍可收窄为 non-UI；不覆盖已有 PASS。
      migrated[newAcceptance] = "—";
    }
    lines[row.lineIndex] = renderRow(migrated);
  }
  return lines.join("\n");
}

function atomicWrite(file, content) {
  mkdirSync(path.dirname(file), { recursive: true });
  const temp = `${file}.strict-receipts-${process.pid}.tmp`;
  try {
    writeFileSync(temp, content);
    renameSync(temp, file);
  } catch (error) {
    try {
      if (existsSync(temp)) unlinkSync(temp);
    } catch {}
    throw error;
  }
}

function restore(file, existed, source) {
  if (existed) atomicWrite(file, source);
  else if (existsSync(file)) unlinkSync(file);
}

function transactionFiles(root) {
  const processDir = path.join(root, "orchestrator", "process");
  return {
    journal: path.join(processDir, ".strict-receipts-transaction.json"),
    backlogBackup: path.join(processDir, ".strict-receipts-BACKLOG.before"),
    configBackup: path.join(processDir, ".strict-receipts-config.before"),
  };
}

function unlinkIfExists(file) {
  if (existsSync(file)) unlinkSync(file);
}

function cleanupTransaction(files) {
  unlinkIfExists(files.journal);
  unlinkIfExists(files.backlogBackup);
  unlinkIfExists(files.configBackup);
}

function recoverPendingTransaction(root, backlogFile, configFile) {
  const files = transactionFiles(root);
  if (!existsSync(files.journal)) return null;
  let journal;
  try {
    journal = JSON.parse(readFileSync(files.journal, "utf8"));
  } catch (error) {
    throw new Error(`strict receipts recovery journal 损坏: ${error.message}`);
  }
  if (!journal || journal.schema !== TRANSACTION_SCHEMA) {
    throw new Error("strict receipts recovery journal schema 不受支持");
  }
  const backlogCurrent = existsSync(backlogFile) ? readFileSync(backlogFile, "utf8") : null;
  const configCurrent = existsSync(configFile) ? readFileSync(configFile, "utf8") : null;
  const committed =
    backlogCurrent !== null &&
    digest(backlogCurrent) === journal.backlog_after_sha256 &&
    configCurrent !== null &&
    digest(configCurrent) === journal.config_after_sha256;
  if (committed) {
    cleanupTransaction(files);
    return "检测到上次双文件提交已完整落盘，已清理 recovery journal";
  }

  if (!existsSync(files.backlogBackup)) {
    throw new Error("strict receipts recovery 缺 BACKLOG 备份，拒绝猜测恢复");
  }
  const backlogBefore = readFileSync(files.backlogBackup, "utf8");
  if (digest(backlogBefore) !== journal.backlog_before_sha256) {
    throw new Error("strict receipts recovery 的 BACKLOG 备份 hash 不匹配");
  }
  let configBefore = null;
  if (journal.config_existed === true) {
    if (!existsSync(files.configBackup)) {
      throw new Error("strict receipts recovery 缺 config 备份，拒绝猜测恢复");
    }
    configBefore = readFileSync(files.configBackup, "utf8");
    if (digest(configBefore) !== journal.config_before_sha256) {
      throw new Error("strict receipts recovery 的 config 备份 hash 不匹配");
    }
  }

  atomicWrite(backlogFile, backlogBefore);
  restore(configFile, journal.config_existed === true, configBefore);
  cleanupTransaction(files);
  return "检测到上次双文件提交未完成，已恢复一致旧状态";
}

function main() {
  if (["--help", "-h"].includes(process.argv[2] ?? "")) {
    console.log("用法: strict-receipts-migrate.mjs <check|apply> [--non-ui T-001,T-002]");
    return;
  }
  let args;
  try {
    args = parseArgs(process.argv.slice(2));
  } catch (error) {
    die(error.message);
  }

  const unresolvedRoot = process.cwd();
  const root = realpathSync(unresolvedRoot);
  const backlogFile = path.join(root, "BACKLOG.md");
  const configFile = path.join(root, "orchestrator", "process", "reconcile.config.json");
  if (!existsSync(backlogFile)) die(`找不到 ${backlogFile}`);
  const pendingFiles = transactionFiles(root);
  if (existsSync(pendingFiles.journal)) {
    let releaseRecovery;
    try {
      releaseRecovery = acquireStateLock(root, {
        operation: "strict-receipts-migrate:recovery",
      });
      const recovered = recoverPendingTransaction(root, backlogFile, configFile);
      if (recovered) console.log(`! ${recovered}`);
    } catch (error) {
      die(error.message);
    } finally {
      releaseRecovery?.();
    }
  }

  let backlogSource;
  let config;
  let inspected;
  try {
    backlogSource = readFileSync(backlogFile, "utf8");
    config = readConfig(configFile);
    inspected = inspect({ backlogSource, config, nonUi: args.nonUi });
  } catch (error) {
    die(error.message);
  }

  if (args.command === "check") {
    if (inspected.problems.length) {
      die(`strict receipts 尚未就绪:\n- ${inspected.problems.join("\n- ")}\n请运行 apply 迁移`);
    }
    console.log("✓ strict receipts 已启用：receipt_policy=required，活动任务表含审核/验收列");
    return;
  }

  let nextBacklog;
  let nextConfig;
  try {
    nextBacklog = migrateBacklog({
      backlogSource,
      config,
      nonUi: args.nonUi,
    });
    nextConfig = `${JSON.stringify(
      {
        ...config.value,
        receipt_policy: "required",
        frontend_verify_commands: config.value.frontend_verify_commands ?? {},
      },
      null,
      2,
    )}\n`;
    // 对产物再做一次完整结构校验，任何问题都发生在写盘前。
    const nextConfigValue = JSON.parse(nextConfig);
    const post = inspect({
      backlogSource: nextBacklog,
      config: { exists: true, source: nextConfig, value: nextConfigValue },
      nonUi: args.nonUi,
    });
    if (post.problems.length) throw new Error(post.problems.join("\n"));
  } catch (error) {
    die(`迁移预检失败，未修改任何文件: ${error.message}`);
  }

  let release;
  try {
    release = acquireStateLock(root, { operation: "strict-receipts-migrate:apply" });
  } catch (error) {
    die(error.message);
  }
  let transactionError = null;
  try {
    if (readFileSync(backlogFile, "utf8") !== backlogSource) {
      throw new Error("BACKLOG.md 在迁移预检后发生变化，请重试");
    }
    if (config.exists) {
      if (!existsSync(configFile) || readFileSync(configFile, "utf8") !== config.source) {
        throw new Error("reconcile.config.json 在迁移预检后发生变化，请重试");
      }
    } else if (existsSync(configFile)) {
      throw new Error("reconcile.config.json 在迁移预检后被创建，请重试");
    }

    const transaction = transactionFiles(root);
    atomicWrite(transaction.backlogBackup, backlogSource);
    if (config.exists) atomicWrite(transaction.configBackup, config.source);
    else unlinkIfExists(transaction.configBackup);
    atomicWrite(
      transaction.journal,
      `${JSON.stringify(
        {
          schema: TRANSACTION_SCHEMA,
          config_existed: config.exists,
          backlog_before_sha256: digest(backlogSource),
          config_before_sha256: config.exists ? digest(config.source) : null,
          backlog_after_sha256: digest(nextBacklog),
          config_after_sha256: digest(nextConfig),
        },
        null,
        2,
      )}\n`,
    );
    atomicWrite(configFile, nextConfig);
    try {
      atomicWrite(backlogFile, nextBacklog);
    } catch (error) {
      recoverPendingTransaction(root, backlogFile, configFile);
      throw error;
    }
    cleanupTransaction(transaction);
  } catch (error) {
    try {
      if (existsSync(transactionFiles(root).journal)) {
        recoverPendingTransaction(root, backlogFile, configFile);
      }
      transactionError = error;
    } catch (recoveryError) {
      transactionError = new Error(
        `${error.message}; recovery 也失败: ${recoveryError.message}`,
      );
    }
  } finally {
    release();
  }
  if (transactionError) {
    die(`迁移 transaction 未提交，已回滚可恢复文件: ${transactionError.message}`);
  }
  console.log(
    `✓ strict receipts 迁移完成：${inspected.table.rows.length} 个活动任务，${args.nonUi.size} 个明确 non-UI`,
  );
}

main();
