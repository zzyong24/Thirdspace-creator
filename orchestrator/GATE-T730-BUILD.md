# T-730 orchestrator 全量门恢复验收

```frontend-validation
{
  "schema": "frontend-validation/v1",
  "task_id": "T-730",
  "contract_path": "orchestrator/T730-FRONTEND-JOURNEY.md",
  "contract_sha": "7f9a5991cf94",
  "commit_sha": "727cbf67552c5ba2ce6f5a9cf9ec8c5cc3dffb22",
  "observed_at": "2026-08-09T07:30:37.000Z",
  "run": {
    "verify_key": "onboarding-sidebar:e2e",
    "command": "CREATOROS_TEST_PORT=3429 CREATOROS_PLAYWRIGHT_BROWSER_CHANNEL=chrome pnpm --dir frontend exec playwright test tests/e2e/onboarding-and-small-sidebar.spec.ts --project=e2e",
    "exit_code": 0,
    "output_ref": "taskctl 在当前 HEAD 重跑真实 Chrome 应用烟测并记录输出哈希"
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
      { "id": "isolated-pglite-canonical-user", "role": "隔离数据库中的代表性单机用户与真实应用服务链" }
    ]
  },
  "levels": {
    "logic": { "status": "pass", "evidence_ref": "orchestrator process 122/122 PASS；test-integrity 0 errors/1 coverage warning" },
    "surface": { "status": "pass", "evidence_ref": "真实 Chrome 双窗口应用烟测" },
    "journey": { "status": "pass", "evidence_ref": "设置页、首页与侧栏旅程连续通过" },
    "experience": { "status": "not-requested", "evidence_ref": "本任务只恢复工程门禁与初始化工具" }
  },
  "checks": [
    { "id": "AC-PROCESS-ALL", "test_id": "NODE-T730-01", "result": "pass", "evidence_ref": "node --test orchestrator/process/*.test.mjs：122/122 PASS" },
    { "id": "AC-INTEGRITY", "test_id": "INTEGRITY-T730-02", "result": "pass", "evidence_ref": "test-integrity：0 errors；仅 coverageConfigPath 未配置 warning" },
    { "id": "AC-APP-SMOKE", "test_id": "E2E-T730-03", "result": "pass", "evidence_ref": "taskctl 重跑 onboarding-sidebar:e2e" }
  ],
  "coverage": [
    { "condition": "all-process-tests", "result": "pass", "evidence_ref": "122 项全量流程测试通过" },
    { "condition": "no-integrity-error", "result": "pass", "evidence_ref": "测试迁移与 suppression 精确审计零错误" },
    { "condition": "normal-viewport", "result": "pass", "evidence_ref": "Chrome 1440x900" },
    { "condition": "minimum-viewport", "result": "pass", "evidence_ref": "Chrome 1024x720" }
  ],
  "tdd_red_ref": "RELEASE_REVIEW.md 记录恢复前全量 process 测试 92 通过、28 失败；缺失 tools/templates 可稳定复现失败",
  "open_defects": [],
  "status": "pass"
}
```
