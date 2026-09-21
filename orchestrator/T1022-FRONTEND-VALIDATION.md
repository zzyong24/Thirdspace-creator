# T-1022 前端旅程验收

## 人话结论

- 没有可用模型时，输入保留并直接显示模型设置入口，不会空循环。
- 临时 503 后，页面显示“正在恢复本轮生成”和“自动恢复中”，不出现手动重试按钮。
- 自动恢复请求复用同一个用户消息 ID，第二次响应成功后，完整候选回到原对话，恢复提示消失。
- 1280×720 与 900×600 两档窗口均通过；人工体验确认尚未请求。

```frontend-validation
{
  "schema": "frontend-validation/v1",
  "task_id": "T-1022",
  "contract_path": "docs/features/t1022-nonblocking-agent-recovery.md",
  "contract_sha": "5eb3f4069a9e",
  "commit_sha": "f2fcbb87",
  "observed_at": "2026-09-21T16:16:08Z",
  "run": {
    "verify_key": "ai-nonblocking-recovery:e2e",
    "command": "CREATOROS_TEST_PORT=3442 CREATOROS_PLAYWRIGHT_BROWSER_CHANNEL=chrome pnpm --dir frontend exec playwright test tests/e2e/ai-nonblocking-recovery.spec.ts --project=e2e",
    "exit_code": 0,
    "output_ref": "真实 Next.js + Chrome 文件 4/4；T-1022 的模型缺失与临时 503 同轮恢复旅程均再次通过"
  },
  "environment": {
    "surface": "desktop-web",
    "runtime": "Next.js 16.2.9 开发服务 + 本机 Chrome Playwright；另有 CreatorOS 1.2.0 安装版启动、sidecar hydration 与 CLI 冒烟",
    "viewports": [
      {"width": 1280, "height": 720, "result": "pass"},
      {"width": 900, "height": 600, "result": "pass"}
    ]
  },
  "data": {
    "mode": "non-fixture",
    "witnesses": [
      {"id": "isolated-account-runtime", "role": "每条旅程通过真实 dispatch 创建并选择隔离账号，加载真实首页、助手和设置入口"},
      {"id": "controlled-model-boundary", "role": "仅在模型网络边界注入未配置与临时 503；页面、账号、消息、恢复定时器和流协议运行真实代码"}
    ]
  },
  "levels": {
    "logic": {"status": "pass", "evidence_ref": "LED-052：AI Worker 35/35、Backend 87/87、Frontend 112/112"},
    "surface": {"status": "pass", "evidence_ref": "orchestrator/evidence/T-1022-visible-copy.json"},
    "journey": {"status": "pass", "evidence_ref": "真实 Chrome 中完成模型缺失入口、503 自动恢复、同消息续跑和完整结果回显，2/2"},
    "experience": {"status": "not-requested", "evidence_ref": "已完成自动化与安装版运行验证，未把机器结果冒充用户主观确认"}
  },
  "checks": [
    {"id": "AC-T1022-MISSING-MODEL", "test_id": "E2E-T1022-01", "result": "pass", "evidence_ref": "显示完成 AI 设置后继续，输入保留，唯一主动作指向 /settings?highlight=text-model"},
    {"id": "AC-T1022-AUTO-RECOVERY", "test_id": "E2E-T1022-02", "result": "pass", "evidence_ref": "首次 503 后显示正在恢复与自动恢复中，不存在手动重试按钮"},
    {"id": "AC-T1022-SAME-TURN", "test_id": "E2E-T1022-02", "result": "pass", "evidence_ref": "前后两次请求中的最后一条用户消息 ID 完全相同，请求总数为 2"},
    {"id": "AC-T1022-COMPLETE", "test_id": "E2E-T1022-02", "result": "pass", "evidence_ref": "恢复响应通过 UI message stream 返回，原对话显示完整候选已自动恢复且错误卡消失"}
  ],
  "coverage": [
    {"condition": "regular-window", "result": "pass", "evidence_ref": "1280×720 模型缺失恢复入口可见", "reason": ""},
    {"condition": "minimum-window", "result": "pass", "evidence_ref": "900×600 自动恢复与最终结果可见", "reason": ""},
    {"condition": "model-not-configured", "result": "pass", "evidence_ref": "停止空跑并直达模型设置", "reason": ""},
    {"condition": "transient-model-failure", "result": "pass", "evidence_ref": "受控 503 映射为自动恢复状态", "reason": ""},
    {"condition": "same-turn-recovery", "result": "pass", "evidence_ref": "自动恢复复用同一个用户消息 ID", "reason": ""},
    {"condition": "complete-result", "result": "pass", "evidence_ref": "第二次流响应完成后候选回到原对话", "reason": ""}
  ],
  "visible_copy": {
    "artifact_path": "orchestrator/evidence/T-1022-visible-copy.json",
    "artifact_sha256": "5a811beb775c60fe4d74d9c0c8dbdea6d0470904d6e071ef54e83c2cecf89a1e"
  },
  "tdd_red_ref": "2026-09-21 首次真实 Chrome 回归按旧 T-913 契约运行时，E2E-T913-04 因页面已显示‘正在恢复本轮生成’而不再显示旧‘手动重试’文案，按预期失败；随后更新回归并新增 T-1022 同轮恢复旅程。T-1022 专属旅程创建后首次即通过，未补写不存在的实现前红测。",
  "open_defects": [],
  "status": "pass"
}
```
