# T-722 V1 候选复验报告

本报告不改写 2026-08-08 的原始真机报告；它把当前 V1 候选 HEAD 的确定性测试，与原报告中已经发生的智溯AI安装版真机观察明确分层。当前轮没有声称重新安装了 V1 包。

```frontend-validation
{
  "schema": "frontend-validation/v1",
  "task_id": "T-722",
  "contract_path": "orchestrator/T722-FRONTEND-JOURNEY.md",
  "contract_sha": "6812aba0c8cd",
  "commit_sha": "cfbda11c5d1d8d40e5bacb574c965c49a7aa418a",
  "observed_at": "2026-08-09T05:16:24.000Z",
  "run": {
    "verify_key": "channel-skill-no-account:test",
    "command": "pnpm --dir frontend exec vitest run src/features/settings/skills-section.test.tsx -t \"未选择账号时\"",
    "exit_code": 0,
    "output_ref": "当前 V1 候选 HEAD 重新执行 Vitest；taskctl 记录输出 hash"
  },
  "environment": {
    "surface": "desktop-app",
    "runtime": "当前 HEAD 的设置页逻辑测试 + 2026-08-08 智溯AI 0.3.0 安装版真机 witness；本轮未重新安装 V1 包",
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
    "surface": { "status": "pass", "evidence_ref": "原始安装版双窗口可见文本；当前断言仍要求内置 Skill 与未选号只读提示" },
    "journey": { "status": "pass", "evidence_ref": "原始独立渠道数据目录旅程；当前 watched_paths 全部绑定本复验 commit" },
    "experience": { "status": "pass", "evidence_ref": "历史用户真机确认保留；未冒充本轮 V1 重新安装体验" }
  },
  "checks": [
    { "id": "AC-SKILLS-LIST", "test_id": "E2E-CHANNEL-SKILLS-01", "result": "pass", "evidence_ref": "当前测试重新渲染内置 Skill" },
    { "id": "AC-SKILLS-NO-ACCOUNT", "test_id": "E2E-CHANNEL-SKILLS-02", "result": "pass", "evidence_ref": "当前测试重新验证 accountId=null 与只读定制" },
    { "id": "AC-SKILLS-NO-ERROR", "test_id": "E2E-CHANNEL-SKILLS-03", "result": "pass", "evidence_ref": "当前测试未进入技能清单错误态" }
  ],
  "coverage": [
    { "condition": "fresh-channel-install", "result": "pass", "evidence_ref": "2026-08-08 原始安装 witness；本轮未声称重装 V1", "reason": "" },
    { "condition": "no-selected-account", "result": "pass", "evidence_ref": "当前 HEAD 聚焦测试 + 原始安装 witness", "reason": "" },
    { "condition": "channel-data-isolation", "result": "pass", "evidence_ref": "包身份与 appDataDir 代码/历史安装证据未被本轮改写", "reason": "" },
    { "condition": "business-domain-independent", "result": "pass", "evidence_ref": "当前实现仍只读 runtime official registry", "reason": "" },
    { "condition": "installed-desktop-runtime", "result": "pass", "evidence_ref": "原始 0.3.0 安装版 witness；V1 正式包仍受最终发布确认门约束", "reason": "" }
  ],
  "visible_copy": {
    "artifact_path": "orchestrator/evidence/T-722-v1-revalidation-visible-copy.json",
    "artifact_sha256": "0aae79032e17faf38025a833efa43956c0dcbf436e15484638e910c88b27c3a9"
  },
  "tdd_red_ref": "原始 RED 与真机证据保留在 orchestrator/GATE-T722-BUILD.md；本轮只做当前 HEAD 复验",
  "open_defects": [],
  "status": "pass"
}
```
