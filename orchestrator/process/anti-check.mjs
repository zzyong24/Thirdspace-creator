// process/anti-check.mjs — antiCheck 全守卫元验证:把守卫该挡的坑造出来(setup),断言 L.check 此时
// 必 exit≠0;若仍 exit 0 = 守卫因环境漂移变稻草人假绿。WARN-only。会写工作树(setup/teardown),
// 只在 --anti-check / --consolidate 显式跑,绝不进平时 reconcile 高频路径。
import { spawnSync } from 'node:child_process';
const sh = (cmd, cwd) => spawnSync(cmd, { cwd, shell: '/bin/bash', stdio: 'ignore' }).status ?? 1;

export function runAntiCheck(L, cwd) {
  if (!L.antiCheck || !L.check || L.check === 'manual') return { led: L.led, status: 'uncovered' };
  sh(L.antiCheck.setup ?? ':', cwd);
  const code = sh(L.check, cwd);                       // 复现态下跑守卫
  sh(L.antiCheck.teardown ?? ':', cwd);                // 永远清理
  if (code !== 0) return { led: L.led, status: 'pass' };
  return {
    led: L.led, status: 'false-green',
    finding: { level: 'WARN', m: `lesson ${L.led}: antiCheck 假绿 — 复现态下 GuardCheck 仍 exit 0,守卫已失效(环境漂移)。` },
  };
}

export function runAllAntiChecks(lessons, cwd) {
  return (lessons ?? []).map((L) => runAntiCheck(L, cwd));
}
