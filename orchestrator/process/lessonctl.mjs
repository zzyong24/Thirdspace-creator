#!/usr/bin/env node
// 工程教训查询/审计入口。自动采集只写 LESSON_INBOX，生命周期晋升仍由人工 Gate 决定。
import { appendFileSync, existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { lessonLifecycleFindings, parseLedgerRules, selectInjectableLessons } from './evolution-guards.mjs';

export function appendJsonlUnique(path, rows) {
  if (!rows?.length) return 0;
  const existing = new Set();
  if (existsSync(path)) {
    for (const line of readFileSync(path, 'utf8').split('\n').filter(Boolean)) {
      try {
        const row = JSON.parse(line);
        if (row?.id) existing.add(row.id);
      } catch {
        // 保留坏行供人工审计；这里只避免合法记录重复。
      }
    }
  }
  const fresh = rows.filter((row) => row?.id && !existing.has(row.id));
  if (fresh.length) appendFileSync(path, fresh.map((row) => `${JSON.stringify(row)}\n`).join(''));
  return fresh.length;
}

function argValue(name, fallback = null) {
  const i = process.argv.indexOf(name);
  return i >= 0 ? process.argv[i + 1] : fallback;
}

function load(controlDir) {
  const configPath = resolve(controlDir, 'process', 'reconcile.config.json');
  const cfg = existsSync(configPath) ? JSON.parse(readFileSync(configPath, 'utf8')) : {};
  const ledger = parseLedgerRules(resolve(controlDir, 'LESSON_LEDGER.md'));
  return { cfg, ledger };
}

export function main() {
  const command = process.argv[2] ?? 'audit';
  const controlDir = resolve(argValue('--control-dir', 'orchestrator'));
  const { cfg, ledger } = load(controlDir);

  if (command === 'audit') {
    const findings = lessonLifecycleFindings(ledger, cfg.lessons ?? []);
    if (!findings.length) console.log('✓ lesson lifecycle clean');
    for (const finding of findings) console.log(`! ${finding.m}`);
    return;
  }

  if (command === 'context') {
    const stage = argValue('--stage', null);
    const lessons = selectInjectableLessons({ ledger, lessonsCfg: cfg.lessons ?? [], stage, limit: 7 });
    if (!lessons.length) {
      console.log(`- 当前阶段 ${stage ?? '(未指定)'} 没有已确认且可安全注入的工程教训。`);
      return;
    }
    for (const lesson of lessons) {
      console.log(`- ${lesson.id} [${lesson.effectiveLifecycle}] ${lesson.title ?? lesson.whatFailed ?? ''}`.trim());
      if (lesson.guardRule) console.log(`  防复发：${lesson.guardRule}`);
      if (lesson.check) console.log(`  校验：\`${lesson.check}\``);
    }
    return;
  }

  throw new Error(`未知命令: ${command}; 支持 audit | context`);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();
