// Execute project lesson commands serially, with observable results and bounded process-group cleanup.
// Arbitrary shell commands are never safe to run in a read-only audit; callers select that boundary.
import { spawn } from 'node:child_process';
import { performance } from 'node:perf_hooks';
import { checkTimeoutBudget } from './timeout-budget.mjs';

const MAX_TIMER_MS = 2_147_483_647;
const positiveMs = value => Number.isSafeInteger(value) && value > 0 && value <= MAX_TIMER_MS;
const nonnegativeMs = value => Number.isSafeInteger(value) && value >= 0 && value <= MAX_TIMER_MS;
const executable = lesson => typeof lesson?.check === 'string' && lesson.check.trim() && lesson.check !== 'manual';

export function planLessonExecution(lessons = [], policy = {}) {
  if (!Array.isArray(lessons) || lessons.some(lesson => !lesson || typeof lesson !== 'object' || Array.isArray(lesson) || (lesson.check != null && typeof lesson.check !== 'string'))) {
    return { ok: false, errors: ['lessons must be an array of objects with string check commands'], commands: [] };
  }
  const commands = lessons.filter(executable);
  if (!commands.length) return { ok: true, errors: [], commands: [], overallTimeoutMs: 0 };
  if (!policy || typeof policy !== 'object' || Array.isArray(policy)) {
    return { ok: false, errors: ['lesson_execution must be an object declaring project command budgets'], commands: [] };
  }
  const errors = [];
  if (!positiveMs(policy.minimum_timeout_ms)) errors.push('lesson_execution.minimum_timeout_ms must declare the project execution lower bound');
  const cleanupGraceMs = policy.cleanup_grace_ms ?? 1000;
  const settlementMarginMs = policy.settlement_margin_ms ?? 1000;
  if (!nonnegativeMs(cleanupGraceMs)) errors.push('lesson_execution.cleanup_grace_ms must be a non-negative integer');
  if (!positiveMs(settlementMarginMs)) errors.push('lesson_execution.settlement_margin_ms must be a positive integer');
  const planned = commands.map(lesson => {
    const timeoutMs = lesson.timeout_ms ?? policy.default_timeout_ms;
    if (!positiveMs(timeoutMs) || timeoutMs < policy.minimum_timeout_ms) {
      errors.push(`${lesson.led ?? '(unnamed lesson)'}: timeout_ms/default_timeout_ms must be finite and >= minimum_timeout_ms`);
    }
    return { lesson, timeoutMs };
  });
  if (errors.length) return { ok: false, errors, commands: planned };
  // Cleanup is distinct from execution. The independent outer budget covers every serial command,
  // every possible cleanup grace, and result settlement. An optional external deadline may be longer.
  const requiredMs = planned.reduce((sum, item) => sum + item.timeoutMs + cleanupGraceMs + settlementMarginMs, 0);
  const overallTimeoutMs = policy.overall_timeout_ms ?? requiredMs + 1;
  const budget = checkTimeoutBudget({
    minimumMs: policy.minimum_timeout_ms,
    outerMs: overallTimeoutMs,
    stages: planned.map(item => ({ executionMs: item.timeoutMs })),
    queueMs: 0,
    setupMs: 0,
    cleanupMs: planned.length * (cleanupGraceMs + settlementMarginMs),
  });
  errors.push(...budget.errors.map(error => `lesson_execution: ${error}`));
  if (!positiveMs(overallTimeoutMs)) errors.push(`lesson_execution overall budget must be <= ${MAX_TIMER_MS} ms`);
  return { ok: !errors.length, errors, commands: planned, cleanupGraceMs, settlementMarginMs, overallTimeoutMs };
}

const tail = (previous, chunk) => (previous + chunk.toString('utf8')).slice(-16_384);

export function runLessonCommand(command, { cwd, timeoutMs, cleanupGraceMs, settlementMarginMs, signal }) {
  return new Promise(resolve => {
    const startedAt = performance.now();
    let stdout = '', stderr = '', child, closed = false, cleanupDone = true, finished = false;
    let status = null, exitSignal = null, reason = null, timer, killTimer, settlementTimer;
    const groupAlive = () => {
      if (!child?.pid) return false;
      try { process.kill(-child.pid, 0); return true; } catch { return false; }
    };
    const killGroup = sig => {
      if (!child?.pid) return;
      try { process.kill(-child.pid, sig); } catch (error) {
        if (error.code !== 'ESRCH') stderr = tail(stderr, `\nprocess-group cleanup: ${error.message}`);
      }
    };
    const finish = () => {
      if (finished || !closed || !cleanupDone) return;
      finished = true;
      clearTimeout(timer); clearTimeout(killTimer); clearTimeout(settlementTimer);
      signal?.removeEventListener('abort', abort);
      resolve({
        outcome: reason ?? (exitSignal ? 'interrupted' : status === 0 ? 'hold' : 'fire'),
        status, signal: exitSignal, stdout, stderr,
        durationMs: Math.ceil(performance.now() - startedAt),
      });
    };
    const stop = cause => {
      if (reason) return;
      reason = cause;
      clearTimeout(timer);
      cleanupDone = false;
      killGroup('SIGTERM');
      killTimer = setTimeout(() => {
        killGroup('SIGKILL');
        cleanupDone = true;
        // Pipes inherited by a descendant must not turn an expired check into an unbounded wait.
        // Normal groups close promptly after SIGKILL; this last bound reports incomplete cleanup.
        settlementTimer = setTimeout(() => {
          if (!closed) {
            stderr = tail(stderr, '\ncleanup did not settle before its deadline; result is incomplete');
            child.stdout?.destroy(); child.stderr?.destroy(); child.unref();
            closed = true;
          }
          finish();
        }, settlementMarginMs);
        finish();
      }, cleanupGraceMs);
    };
    const abort = () => stop('cancelled');
    if (signal?.aborted) {
      resolve({ outcome: 'cancelled', status: null, signal: null, stdout, stderr, durationMs: 0 });
      return;
    }
    if (process.platform === 'win32') {
      resolve({ outcome: 'spawn-error', status: null, signal: null, stdout, stderr: 'lesson shell execution requires POSIX process-group cleanup; not supported on this host', durationMs: 0 });
      return;
    }
    try {
      child = spawn('/bin/bash', ['-c', command], { cwd, detached: true, stdio: ['ignore', 'pipe', 'pipe'] });
    } catch (error) {
      resolve({ outcome: 'spawn-error', status: null, signal: null, stdout, stderr: error.message, durationMs: 0 });
      return;
    }
    child.stdout.on('data', chunk => { stdout = tail(stdout, chunk); });
    child.stderr.on('data', chunk => { stderr = tail(stderr, chunk); });
    child.on('error', error => { reason ??= 'spawn-error'; stderr = tail(stderr, error.message); });
    child.on('exit', (code, sig) => {
      status = code; exitSignal = sig;
      // A shell that leaves work running cannot claim that the guard finished successfully.
      if (!reason && groupAlive()) stop('unfinished-child');
    });
    child.on('close', (code, sig) => { status = code; exitSignal = sig; closed = true; finish(); });
    timer = setTimeout(() => stop('timeout'), timeoutMs);
    signal?.addEventListener('abort', abort, { once: true });
    if (signal?.aborted) abort();
  });
}

export async function runLessonChecks(lessons, { cwd, policy, onEvent = () => {} }) {
  const plan = planLessonExecution(lessons, policy);
  if (!plan.ok) return { ...plan, results: [] };
  const results = [];
  const controller = new AbortController();
  const cancel = () => controller.abort();
  process.once('SIGINT', cancel);
  process.once('SIGTERM', cancel);
  const deadline = performance.now() + plan.overallTimeoutMs;
  const timeouts = new Map(plan.commands.map(item => [item.lesson, item.timeoutMs]));
  try {
    for (const lesson of lessons) {
      const led = lesson.led ?? '(unnamed lesson)';
      if (!executable(lesson)) {
        results.push({ led, outcome: 'manual', deterrence: !!lesson.deterrence });
        continue;
      }
      // Reserve cleanup and result settlement in the original overall deadline; never reset it.
      const remaining = deadline - performance.now() - plan.cleanupGraceMs - plan.settlementMarginMs;
      if (controller.signal.aborted || remaining <= 0) {
        const result = { led, outcome: controller.signal.aborted ? 'cancelled' : 'budget-exhausted', durationMs: 0, deterrence: !!lesson.deterrence };
        results.push(result); onEvent({ type: 'finish', lesson, ...result });
        continue;
      }
      const timeoutMs = Math.max(1, Math.min(timeouts.get(lesson), Math.floor(remaining)));
      onEvent({ type: 'start', led, lesson, timeoutMs });
      const result = { led, ...(await runLessonCommand(lesson.check, {
        cwd, timeoutMs, cleanupGraceMs: plan.cleanupGraceMs,
        settlementMarginMs: plan.settlementMarginMs, signal: controller.signal,
      })), deterrence: !!lesson.deterrence };
      results.push(result); onEvent({ type: 'finish', lesson, ...result });
    }
  } finally {
    process.removeListener('SIGINT', cancel);
    process.removeListener('SIGTERM', cancel);
  }
  return { ...plan, results };
}
