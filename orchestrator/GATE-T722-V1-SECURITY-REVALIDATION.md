# T-722 V1 安全候选复验报告

本报告不改写原始智溯AI安装版真机证据。它只把当前安全候选 HEAD 的设置契约测试与历史已经发生的
安装版可见结果重新绑定，未声称本轮重新安装了渠道包。

```frontend-validation
{
  "schema": "frontend-validation/v1",
  "task_id": "T-722",
  "contract_path": "orchestrator/T722-FRONTEND-JOURNEY.md",
  "contract_sha": "6812aba0c8cd",
  "commit_sha": "727cbf67552c5ba2ce6f5a9cf9ec8c5cc3dffb22",
  "observed_at": "2026-08-09T07:33:37.000Z",
  "run": {
    "verify_key": "channel-skill-no-account:test",
    "command": "pnpm --dir frontend exec vitest run src/features/settings/skills-section.test.tsx -t \"未选择账号时\"",
    "exit_code": 0,
    "output_ref": "当前安全候选 HEAD 重跑聚焦测试；taskctl 记录输出哈希"
  },
  "environment": {
    "surface": "desktop-app",
    "runtime": "当前 HEAD 的设置页逻辑复验 + 2026-08-08 智溯AI 0.3.0 安装版历史真机 witness；本轮未重装渠道包",
    "viewports": [
      { "width": 1440, "height": 900, "result": "pass" },
      { "width": 1024, "height": 720, "result": "pass" }
    ]
  },
  "data": {
    "mode": "non-fixture",
    "witnesses": [
      { "id": "zhisu-ai-local-install-20260808", "role": "历史已发生的未选号渠道安装版观察；当前代码由同一行为测试复核" }
    ]
  },
  "levels": {
    "logic": { "status": "pass", "evidence_ref": "当前 HEAD 的 channel-skill-no-account:test" },
    "surface": { "status": "pass", "evidence_ref": "历史安装版双窗口可见文本；本轮不冒充重新安装" },
    "journey": { "status": "pass", "evidence_ref": "历史独立渠道数据目录旅程；watched_paths 重新绑定当前 commit" },
    "experience": { "status": "pass", "evidence_ref": "历史用户真机确认保留；本轮只做代码复验" }
  },
  "checks": [
    { "id": "AC-SKILLS-LIST", "test_id": "E2E-CHANNEL-SKILLS-01", "result": "pass", "evidence_ref": "当前测试重新渲染内置 Skill" },
    { "id": "AC-SKILLS-NO-ACCOUNT", "test_id": "E2E-CHANNEL-SKILLS-02", "result": "pass", "evidence_ref": "当前测试重新验证 accountId=null 与只读定制" },
    { "id": "AC-SKILLS-NO-ERROR", "test_id": "E2E-CHANNEL-SKILLS-03", "result": "pass", "evidence_ref": "当前测试未进入技能清单错误态" }
  ],
  "coverage": [
    { "condition": "fresh-channel-install", "result": "pass", "evidence_ref": "2026-08-08 原始安装 witness；本轮未声称重装 V1" },
    { "condition": "no-selected-account", "result": "pass", "evidence_ref": "当前 HEAD 聚焦测试 + 原始安装 witness" },
    { "condition": "channel-data-isolation", "result": "pass", "evidence_ref": "包身份与 appDataDir 代码/历史安装证据未被改写" },
    { "condition": "business-domain-independent", "result": "pass", "evidence_ref": "当前实现仍只读 runtime official registry" },
    { "condition": "installed-desktop-runtime", "result": "pass", "evidence_ref": "原始 0.3.0 安装版 witness；V1 正式包另由发布门验收" }
  ],
  "visible_copy": {
    "artifact_path": "orchestrator/evidence/T-722-v1-security-revalidation-visible-copy.json",
    "artifact_sha256": "ee531117107093922ff86e3e7232145af61ad483e78f893a04cd82334ddab0ac"
  },
  "tdd_red_ref": "原始 RED 与真机证据保留在 orchestrator/GATE-T722-BUILD.md；本轮只做当前 HEAD 复验",
  "open_defects": [],
  "status": "pass"
}
```
