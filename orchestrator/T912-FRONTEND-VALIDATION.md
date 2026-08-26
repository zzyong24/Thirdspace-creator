# T-912 前端旅程验收

```frontend-validation
{
  "schema": "frontend-validation/v1",
  "task_id": "T-912",
  "contract_path": "orchestrator/T912-FRONTEND-JOURNEY.md",
  "contract_sha": "974e79a76232",
  "commit_sha": "0a6c7f837e07c8e8d411bfbcab8e73dcdc1da91b",
  "observed_at": "2026-08-26T03:47:00.000Z",
  "run": {
    "verify_key": "navigation-account-smoothness:test",
    "command": "pnpm --dir frontend exec vitest run src/components/shell/shell.test.tsx src/components/shell/account-switcher.test.tsx src/lib/account-events.test.ts src/components/shell/account-switcher-logic.test.ts --retry=0",
    "exit_code": 0,
    "output_ref": "前端回归 61/61；TypeScript 通过；Next.js 生产构建通过；安装物两档窗口 12 次切换全部保持稳定文案且无横向溢出"
  },
  "environment": {
    "surface": "desktop-web",
    "runtime": "/Applications/CreatorOS.app 1.1.0（本地 ad-hoc 签名）+ 内嵌 Next.js sidecar + Chromium 真实旅程",
    "viewports": [
      {"width": 1280, "height": 720, "result": "pass"},
      {"width": 900, "height": 600, "result": "pass"}
    ]
  },
  "data": {
    "mode": "non-fixture",
    "witnesses": [
      {"id": "installed-file-backed-workspace", "role": "真实安装包、真实本机文件型数据库与真实当前账号页面，承载页面切换和服务端耗时观测"},
      {"id": "account-switch-runtime-regression", "role": "账号切换组件运行测试证明当前账号可见态先提交、下一帧只刷新一次、卸载时取消遗留刷新；未把 macOS 辅助功能误操作当真人双账号证据"}
    ]
  },
  "levels": {
    "logic": {"status": "pass", "evidence_ref": "账号切换先写 localStorage/cookie/currentId，requestAnimationFrame 后 refresh；连续调度会取消旧帧，卸载清理"},
    "surface": {"status": "pass", "evidence_ref": "orchestrator/evidence/T-912-visible-copy.json"},
    "journey": {"status": "pass", "evidence_ref": "安装物在两档窗口、每次服务端切换额外延迟 300ms 时，六个页面入口全程保持原名称；落页、激活态和主内容正确"},
    "experience": {"status": "pass", "evidence_ref": "移除用户明确反感的‘打开中’与脉冲反馈；账号先绘制选择结果再刷新数据"}
  },
  "checks": [
    {"id": "AC-NAV-NO-STARTING", "test_id": "E2E-T912-01", "result": "pass", "evidence_ref": "人为延迟 300ms 后，12 次页面切换的入口文字仍严格等于页面原名"},
    {"id": "AC-NAV-SETTLES", "test_id": "E2E-T912-01", "result": "pass", "evidence_ref": "1280×720 为 349–417ms、900×600 为 345–402ms；其中包含人为增加的 300ms，全部落到正确 URL 和可见 main"},
    {"id": "AC-ACCOUNT-PAINT-FIRST", "test_id": "E2E-T912-02", "result": "pass", "evidence_ref": "红测先证明旧版 refresh 同帧触发；修复后断言账号名已更新且 refresh 尚未调用，执行下一帧才恰好调用一次"},
    {"id": "AC-ACCOUNT-NO-STALE-REFRESH", "test_id": "E2E-T912-03", "result": "pass", "evidence_ref": "组件持有 refreshFrameRef；新调度取消旧帧，卸载清理未执行帧"}
  ],
  "coverage": [
    {"condition": "regular-window", "result": "pass", "evidence_ref": "1280×720 六页切换稳定，无横向溢出"},
    {"condition": "minimum-window", "result": "pass", "evidence_ref": "900×600 六页切换稳定，无横向溢出"},
    {"condition": "adverse-slow-rsc", "result": "pass", "evidence_ref": "所有 RSC 导航人为延迟 300ms，仍不出现‘打开中’或‘启动中’"},
    {"condition": "account-change-broadcast", "result": "pass", "evidence_ref": "现有广播不重复拉账号列表；页面刷新延后一帧且只执行一次"}
  ],
  "visible_copy": {
    "artifact_path": "orchestrator/evidence/T-912-visible-copy.json",
    "artifact_sha256": "62135f9fb9c175d663efd621b11522889513dc59312e0f251b17120e77224379"
  },
  "tdd_red_ref": "修复前同组测试准确失败两项：导航文字实际为‘定位中心 · 打开中’；账号切换在新账号可见态检查前已经调用 router.refresh。修复后 61/61 通过。",
  "open_defects": [],
  "status": "pass"
}
```
