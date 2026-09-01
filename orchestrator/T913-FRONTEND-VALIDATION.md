# T-913 前端旅程验收

## 人话结论

- 用户现在会按真实原因看到一条明确恢复路径：完成 AI 设置、完成账号定位、补充 AI 额度，或直接重试。
- 模型与定位入口都已在真实 Next.js 页面点击到目标位置；受管额度按钮复用既有安全额度链路，自配模型问题不会误导用户充值。
- 对话输入在失败前已保存，服务端失败响应会带回会话 ID，用户处理完设置或定位后仍可接着本轮继续。
- 正常窗口与 900×600 窄窗口均无横向溢出；界面不显示激活码类型、渠道配置、供应商名或机器错误码。
- 人工体验确认：尚未请求用户验收。

```frontend-validation
{
  "schema": "frontend-validation/v1",
  "task_id": "T-913",
  "contract_path": "orchestrator/T913-FRONTEND-JOURNEY.md",
  "contract_sha": "29d12fe23dbd",
  "commit_sha": "7a2a4dc52fa7b9522201da1a736bca25f901a182",
  "observed_at": "2026-09-01T17:03:30.000Z",
  "run": {
    "verify_key": "ai-recovery-guidance:e2e",
    "command": "CREATOROS_TEST_PORT=3441 CREATOROS_PLAYWRIGHT_BROWSER_CHANNEL=chrome pnpm --dir frontend exec playwright test tests/e2e/ai-recovery-guidance.spec.ts --project=e2e",
    "exit_code": 0,
    "output_ref": "真实 Next.js + Chrome 旅程 4/4；相关 Vitest 211/211；TypeScript、ESLint（0 error）和生产构建通过"
  },
  "environment": {
    "surface": "desktop-web",
    "runtime": "Next.js 16.2.9 开发服务 + 本机 Chrome Playwright；生产 Next.js 构建另行通过",
    "viewports": [
      {"width": 1280, "height": 720, "result": "pass"},
      {"width": 900, "height": 600, "result": "pass"}
    ]
  },
  "data": {
    "mode": "non-fixture",
    "witnesses": [
      {"id": "fresh-account-runtime", "role": "每条旅程经真实 dispatch 创建并选择独立账号，加载真实首页、对话框、设置页和定位页"},
      {"id": "deterministic-ai-failure-boundary", "role": "仅在模型服务网络边界注入四类确定性失败响应，页面、账号、路由、恢复动作与会话逻辑均运行真实代码"}
    ]
  },
  "levels": {
    "logic": {"status": "pass", "evidence_ref": "错误分类、会话 ID 回传、恢复动作和内容雷达定位入口相关 Vitest 211/211"},
    "surface": {"status": "pass", "evidence_ref": "orchestrator/evidence/T-913-visible-copy.json；两档窗口截图已人工核对"},
    "journey": {"status": "pass", "evidence_ref": "模型设置与定位中心真实落页；额度安全链路交互测试；未知错误二次请求计数为 2"},
    "experience": {"status": "not-requested", "evidence_ref": "已完成自动化与实现者视觉核对，等待用户在后续安装包中体验确认"}
  },
  "checks": [
    {"id": "AC-AI-MODEL-SETTINGS", "test_id": "E2E-T913-01", "result": "pass", "evidence_ref": "显示完成 AI 设置提示，点击后落到 /settings?highlight=text-model 且模型卡可见"},
    {"id": "AC-AI-POSITIONING", "test_id": "E2E-T913-02", "result": "pass", "evidence_ref": "显示定位恢复提示，点击后落到真实定位中心；内容雷达同类入口有组件回归"},
    {"id": "AC-AI-CREDITS", "test_id": "E2E-T913-03", "result": "pass", "evidence_ref": "受管额度不足只显示查看额度并充值；交互测试验证调用既有安全额度连接并打开合规链接"},
    {"id": "AC-AI-UNKNOWN-RETRY", "test_id": "E2E-T913-04", "result": "pass", "evidence_ref": "未知故障不猜原因，点击重试后 /api/chat 请求从 1 次增加为 2 次"},
    {"id": "AC-AI-COPY-SAFE", "test_id": "E2E-T913-05", "result": "pass", "evidence_ref": "正常与最小窗口无溢出；恢复卡不含 activation、Growth、authority、API Key 或注入的机器错误"}
  ],
  "coverage": [
    {"condition": "regular-window", "result": "pass", "evidence_ref": "1280×720 模型恢复旅程及桌面默认窗口额度、重试旅程", "reason": ""},
    {"condition": "minimum-window", "result": "pass", "evidence_ref": "900×600 定位恢复卡、按钮边界与消息区 scrollWidth 均通过", "reason": ""},
    {"condition": "managed-ai-credits", "result": "pass", "evidence_ref": "额度卡唯一主动作和既有安全额度链路", "reason": ""},
    {"condition": "user-configured-ai", "result": "pass", "evidence_ref": "未配置、凭据、鉴权与自配余额归入 AI 设置，不展示受管充值入口", "reason": ""},
    {"condition": "positioning-missing", "result": "pass", "evidence_ref": "AI 助手与内容雷达均提供真实定位中心入口", "reason": ""},
    {"condition": "unknown-transient-error", "result": "pass", "evidence_ref": "安全文案、保留输入说明和真实重试", "reason": ""}
  ],
  "visible_copy": {
    "artifact_path": "orchestrator/evidence/T-913-visible-copy.json",
    "artifact_sha256": "e94027f7424aa2532a8e13f7c3c8e3c6b3c16a799399769ae31da19e33aa93f8"
  },
  "tdd_red_ref": "实现前新增错误归类与主对话恢复交互测试共 6 项按预期失败：模型未配置、定位缺失仍落入泛化错误或缺少真实入口；实现后同组 211/211 通过。",
  "open_defects": [],
  "status": "pass"
}
```
