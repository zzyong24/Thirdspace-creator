# T-909 前端旅程验收

```frontend-validation
{
  "schema": "frontend-validation/v1",
  "task_id": "T-909",
  "contract_path": "orchestrator/T909-FRONTEND-JOURNEY.md",
  "contract_sha": "98f622376737",
  "commit_sha": "be9dcc2cb9a33a548c7110497d873078e79b2fd6",
  "observed_at": "2026-08-24T07:15:01.000Z",
  "run": {
    "verify_key": "navigation-account-performance:test",
    "command": "pnpm --dir frontend exec vitest run src/components/shell/account-switcher.test.tsx src/lib/account-events.test.ts src/components/shell/shell.test.tsx src/lib/session.server.test.ts --retry=0 && pnpm --dir backend exec vitest run src/modules/positioning/positioning.service.test.ts --retry=0",
    "exit_code": 0,
    "output_ref": "前端 58/58、定位服务 25/25 回归通过；Next.js 正式构建通过"
  },
  "environment": {
    "surface": "desktop-web",
    "runtime": "Codex 应用内 Chromium + Next.js 本地隔离运行时",
    "viewports": [
      {"width": 1280, "height": 720, "result": "pass"},
      {"width": 900, "height": 600, "result": "pass"}
    ]
  },
  "data": {
    "mode": "non-fixture",
    "witnesses": [
      {"id": "isolated-file-backed-pglite", "role": "真实文件型隔离数据库与正式服务端请求上下文，承载首页和定位中心页面读取"},
      {"id": "account-event-regression", "role": "正式账号事件与路由刷新代码的运行级回归；隔离数据库无第二个真实账号，不冒充真人双账号旅程"}
    ]
  },
  "levels": {
    "logic": {"status": "pass", "evidence_ref": "同一请求会话解析去重，外壳与定位中心独立读取并行，账号事件不会自触发重拉或二次刷新"},
    "surface": {"status": "pass", "evidence_ref": "orchestrator/evidence/T-909-visible-copy.json"},
    "journey": {"status": "pass", "evidence_ref": "应用内 Chromium 在两档窗口反复执行首页与定位中心切换；旧页稳定保留，目标导航立即显示打开中，落页后激活态正确，无横向溢出"},
    "experience": {"status": "not-requested", "evidence_ref": "本任务只修复切换响应与等待反馈，沿用现有 CreatorOS 视觉系统"}
  },
  "checks": [
    {"id": "AC-NAV-IMMEDIATE", "test_id": "E2E-T909-01", "result": "pass", "evidence_ref": "点击目标导航后同步出现“定位中心 · 打开中”，不再用整页大骨架遮掉旧内容"},
    {"id": "AC-NAV-STABLE", "test_id": "E2E-T909-01", "result": "pass", "evidence_ref": "1280×720 与 900×600 均稳定落到正确页面；热态服务端页面响应约 20–58ms，无 creator-loading 整页替换"},
    {"id": "AC-ACCOUNT-COALESCED", "test_id": "E2E-T909-02", "result": "pass", "evidence_ref": "账号切换事件回归证明发起组件不再自行 listAccounts，自动化岛识别已安排的 route refresh，不重复刷新"}
  ],
  "coverage": [
    {"condition": "regular-window", "result": "pass", "evidence_ref": "1280×720 应用外壳、导航和落页状态完整可见"},
    {"condition": "minimum-window", "result": "pass", "evidence_ref": "900×600 无横向溢出，页面切换和导航反馈正常"},
    {"condition": "repeated-route-switch", "result": "pass", "evidence_ref": "首页与定位中心反复切换后激活态持续正确；热态首页约 31–58ms、定位中心约 20–35ms"},
    {"condition": "account-change-broadcast", "result": "pass", "evidence_ref": "结构化事件携带来源和刷新安排；组件级运行回归覆盖自发事件与自动化订阅者"}
  ],
  "visible_copy": {
    "artifact_path": "orchestrator/evidence/T-909-visible-copy.json",
    "artifact_sha256": "d346f79f1bafac8752988f46d7575f85a40c01088da13e6d85348ef9f9cbdc14"
  },
  "tdd_red_ref": "新增账号自刷新、事件详情与导航等待态测试首次运行时准确出现 3 项失败，修复后同组 58/58 通过",
  "open_defects": [],
  "status": "pass"
}
```
