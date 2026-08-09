# T-729 前端零错误发布门验收

T-729 是发布门修复，不是界面重设计。本轮把全仓 ESLint 从历史错误状态收敛为零错误，
并用类型检查、121 项关联组件测试与真实 Chrome 双窗口旅程证明行为保持稳定。

```frontend-validation
{
  "schema": "frontend-validation/v1",
  "task_id": "T-729",
  "contract_path": "orchestrator/T729-FRONTEND-JOURNEY.md",
  "contract_sha": "39e94fb6782b",
  "commit_sha": "4b830f3e6cac851a3bfa01c0621c09b154f8c597",
  "observed_at": "2026-08-09T07:24:13.000Z",
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
    "logic": { "status": "pass", "evidence_ref": "本轮 ESLint 0 errors、typecheck PASS、Vitest 10 files/121 tests PASS" },
    "surface": { "status": "pass", "evidence_ref": "Chrome 在 1440x900 与 1024x720 均渲染真实设置页、首页与侧栏" },
    "journey": { "status": "pass", "evidence_ref": "设置页重新打开引导后回首页，刷新与最小窗口路径连续通过" },
    "experience": { "status": "not-requested", "evidence_ref": "本任务只恢复静态发布门，不引入新的产品体验" }
  },
  "checks": [
    { "id": "AC-LINT-ZERO", "test_id": "ESLINT-T729-01", "result": "pass", "evidence_ref": "pnpm --filter creatoros-frontend lint：0 errors/162 warnings" },
    { "id": "AC-LINT-TYPE", "test_id": "TYPECHECK-T729-02", "result": "pass", "evidence_ref": "pnpm --filter creatoros-frontend typecheck：PASS" },
    { "id": "AC-LINT-COMPONENTS", "test_id": "VITEST-T729-03", "result": "pass", "evidence_ref": "关联 Vitest：10 files/121 tests PASS" },
    { "id": "AC-LINT-BROWSER", "test_id": "E2E-T729-04", "result": "pass", "evidence_ref": "taskctl 重跑 onboarding-sidebar:e2e 真实 Chrome 旅程" }
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
