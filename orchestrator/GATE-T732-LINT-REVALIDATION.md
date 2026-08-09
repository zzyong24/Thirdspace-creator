# T-732 前端零错误发布门迁移复验

T-732 是原前端 lint 收口任务的新编号。本报告不重做视觉设计，也不修改视觉快照；它在当前候选
HEAD 上重新执行同一条真实 Chrome 旅程，使 append-only 任务审计与当前编号一致。

```frontend-validation
{
  "schema": "frontend-validation/v1",
  "task_id": "T-732",
  "contract_path": "orchestrator/T732-FRONTEND-JOURNEY.md",
  "contract_sha": "aa30a0eb45db",
  "commit_sha": "5f931f78acebcb942a11c9ab46fbd675c64f8bde",
  "observed_at": "2026-08-09T08:27:21.000Z",
  "run": {
    "verify_key": "onboarding-sidebar:e2e",
    "command": "CREATOROS_TEST_PORT=3429 CREATOROS_PLAYWRIGHT_BROWSER_CHANNEL=chrome pnpm --dir frontend exec playwright test tests/e2e/onboarding-and-small-sidebar.spec.ts --project=e2e",
    "exit_code": 0,
    "output_ref": "taskctl 在当前 HEAD 实际重跑真实 Chrome 旅程，并记录命令与输出哈希"
  },
  "environment": {
    "surface": "browser",
    "runtime": "Google Chrome 真实进程 + Next.js + 隔离 PGlite 应用服务",
    "viewports": [
      { "width": 1440, "height": 900, "result": "pass" },
      { "width": 1024, "height": 720, "result": "pass" }
    ]
  },
  "data": {
    "mode": "non-fixture",
    "witnesses": [
      { "id": "isolated-pglite-canonical-user", "role": "隔离数据库中的代表性单机用户与真实页面服务链" }
    ]
  },
  "levels": {
    "logic": { "status": "pass", "evidence_ref": "前端全仓 ESLint 保持 0 errors，typecheck 与关联组件测试已通过" },
    "surface": { "status": "pass", "evidence_ref": "Chrome 在 1440x900 与 1024x720 均渲染真实设置页、首页与侧栏" },
    "journey": { "status": "pass", "evidence_ref": "设置页重新打开引导后回首页，刷新与最小窗口路径连续通过" },
    "experience": { "status": "not-requested", "evidence_ref": "本次只换发当前任务编号的审计回执，不变更产品视觉" }
  },
  "checks": [
    { "id": "AC-LINT-ZERO", "test_id": "ESLINT-T732-01", "result": "pass", "evidence_ref": "pnpm --filter creatoros-frontend lint：0 errors/162 warnings" },
    { "id": "AC-LINT-TYPE", "test_id": "TYPECHECK-T732-02", "result": "pass", "evidence_ref": "pnpm --filter creatoros-frontend typecheck：PASS" },
    { "id": "AC-LINT-COMPONENTS", "test_id": "VITEST-T732-03", "result": "pass", "evidence_ref": "关联 Vitest：10 files/121 tests PASS" },
    { "id": "AC-LINT-BROWSER", "test_id": "E2E-T732-04", "result": "pass", "evidence_ref": "taskctl 重跑 onboarding-sidebar:e2e 真实 Chrome 旅程" }
  ],
  "coverage": [
    { "condition": "zero-eslint-errors", "result": "pass", "evidence_ref": "全仓 ESLint 本轮退出 0" },
    { "condition": "commonjs-script-compatibility", "result": "pass", "evidence_ref": ".cjs 只按其真实模块类型关闭错误规则，未全局放宽" },
    { "condition": "stable-hook-behavior", "result": "pass", "evidence_ref": "合法外部状态同步逐行写明理由；关联组件测试全绿" },
    { "condition": "stable-pagination-rendering", "result": "pass", "evidence_ref": "分页子组件移出 render，属性与交互契约保持一致" },
    { "condition": "normal-viewport", "result": "pass", "evidence_ref": "Chrome 1440x900 真实旅程" },
    { "condition": "minimum-viewport", "result": "pass", "evidence_ref": "Chrome 1024x720 真实旅程" }
  ],
  "tdd_red_ref": "RELEASE_REVIEW.md 记录 V1 审计时全仓 lint 为 62 errors/164 warnings；修复前门禁可稳定复现失败",
  "open_defects": [],
  "status": "pass"
}
```
