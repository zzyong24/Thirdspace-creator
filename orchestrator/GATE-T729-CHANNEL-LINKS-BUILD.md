# T-729 渠道包公开入口与反馈 API BUILD Gate

日期：2026-08-09

状态：独立 SPEC 复审 PASS；聚焦逻辑、桌面脚本、类型检查、零错误 lint、生产构建、
CreatorOS 官方包与智溯隔离回归的真实 Chrome 旅程均通过。未修改 CSS、布局、图标、颜色或视觉快照。

```frontend-validation
{
  "schema": "frontend-validation/v1",
  "task_id": "T-729",
  "contract_path": "orchestrator/T729-CHANNEL-LINKS-FRONTEND-JOURNEY.md",
  "contract_sha": "7306400fda98",
  "commit_sha": "ebd92d0afef935e5238b36ab50845e0628338dcd",
  "observed_at": "2026-08-09T08:50:04.000Z",
  "run": {
    "verify_key": "channel-public-links:e2e",
    "command": "CREATOROS_TEST_PORT=3433 CREATOROS_PLAYWRIGHT_BROWSER_CHANNEL=chrome NEXT_PUBLIC_CREATOROS_PACKAGE_REF=zhisu-ai NEXT_PUBLIC_CREATOROS_PACKAGE_WEBSITE_URL=https://zhisunet.com/ NEXT_PUBLIC_CREATOROS_PACKAGE_DOWNLOAD_URL=https://zhisunet.com/download/ NEXT_PUBLIC_CREATOROS_PACKAGE_HUMAN_FEEDBACK_URL=https://zhisunet.com/feedback/ NEXT_PUBLIC_CREATOROS_PACKAGE_UPDATE_MANIFEST_URL=https://creatoros.aitongban.cloud/updates/v2/packages/zhisu-ai/stable/latest.json pnpm --dir frontend exec playwright test tests/e2e/channel-public-links.spec.ts --project=e2e",
    "exit_code": 0,
    "output_ref": "真实 Chrome 渠道环境：1/1 PASS；两档视口检查智溯AI官网，并拦截回读人工反馈 open-url body；同一用例在官方默认环境另行 1/1 PASS"
  },
  "environment": {
    "surface": "browser",
    "runtime": "Google Chrome 真实进程 + Next.js dev + 隔离 PGlite；仅注入 isTauri 触发已有桌面分支，不冒充 Tauri 安装包",
    "viewports": [
      { "width": 1440, "height": 900, "result": "pass" },
      { "width": 1024, "height": 720, "result": "pass" }
    ]
  },
  "data": {
    "mode": "non-fixture",
    "witnesses": [
      { "id": "creatoros-official-package-defaults", "role": "无渠道环境变量的 CreatorOS 官方包公开入口" },
      { "id": "zhisu-ai-package-manifest", "role": "仓内已锁定的真实智溯AI PackageManifest 与 zhisunet.com 隔离回归入口" },
      { "id": "zhisu-human-feedback-open-request", "role": "真实浏览器点击产生的 /api/v1/local/open-url 请求体" }
    ]
  },
  "levels": {
    "logic": { "status": "pass", "evidence_ref": "聚焦 6 files/60 tests PASS；桌面脚本 28 files/211 tests PASS；typecheck PASS；lint 0 errors/162 existing warnings" },
    "surface": { "status": "pass", "evidence_ref": "官方默认环境看到 CreatorOS 官方入口；渠道环境在 1440x900 与 1024x720 均看到 zhisunet.com 且未出现 CreatorOS 官方 URL" },
    "journey": { "status": "pass", "evidence_ref": "官方与渠道环境均从设置官网入口回到 AppShell，打开帮助与反馈并回读当前包人工反馈请求体" },
    "experience": { "status": "not-requested", "evidence_ref": "用户明确要求不改视觉；本轮只验证既有界面的功能链接与中性文案" }
  },
  "checks": [
    { "id": "AC-PACKAGE-LINKS-E2E", "test_id": "E2E-T729-01", "result": "pass", "evidence_ref": "真实 Chrome 官方默认环境 1/1 PASS、智溯环境 1/1 PASS，官网和人工反馈均为当前包目标" },
    { "id": "AC-PACKAGE-MANIFEST", "test_id": "VITEST-T729-02", "result": "pass", "evidence_ref": "清单 closed-schema、官方域名拒绝、WebView 编译环境与更新 namespace 测试通过" },
    { "id": "AC-FEEDBACK-AUTHORITY", "test_id": "VITEST-T729-03", "result": "pass", "evidence_ref": "人工页面与固定 Growth API authority 分离；多 origin、redirect 与上游拒绝 fail-closed" },
    { "id": "AC-NO-VISUAL-DRIFT", "test_id": "GIT-T729-04", "result": "pass", "evidence_ref": "任务差异不含 CSS、视觉基线、截图、主题、图标或布局配置" }
  ],
  "coverage": [
    { "condition": "official-package-defaults", "result": "pass", "evidence_ref": "不注入任何渠道变量的 CreatorOS 官方包真实 Chrome 1/1 PASS；官方全量 E2E 55/55 PASS" },
    { "condition": "real-zhisu-package-environment", "result": "pass", "evidence_ref": "Playwright webServer 使用 PackageManifest 对应的 zhisu-ai NEXT_PUBLIC 构建值" },
    { "condition": "current-package-website-only", "result": "pass", "evidence_ref": "两档视口 href 均为 https://zhisunet.com/ 且不含 creatoros.aitongban.cloud" },
    { "condition": "current-package-human-feedback-only", "result": "pass", "evidence_ref": "open-url POST body 精确为 https://zhisunet.com/feedback/，页面无‘官方反馈页’" },
    { "condition": "normal-viewport", "result": "pass", "evidence_ref": "1440x900 真实 Chrome" },
    { "condition": "minimum-viewport", "result": "pass", "evidence_ref": "1024x720 真实 Chrome" },
    { "condition": "no-visual-style-or-baseline-change", "result": "pass", "evidence_ref": "未修改任何视觉样式或快照文件；仅替换链接来源和白标误导文案" }
  ],
  "tdd_red_ref": "聚焦 RED 首轮 6 files 中 17 tests 失败；真实 Chrome 首轮进一步复现渠道环境仍显示 creatoros.aitongban.cloud，定位到 Next.js 不内联动态 process.env 索引，改为逐项静态 NEXT_PUBLIC 读取后转绿。",
  "open_defects": [],
  "status": "pass"
}
```

## 其他门禁证据

- `pnpm --dir frontend exec vitest run scripts/desktop`：28 files / 211 tests PASS。
- T-729 聚焦：6 files / 60 tests PASS。
- `pnpm --filter creatoros-frontend typecheck`：PASS。
- `pnpm --filter creatoros-frontend lint`：0 errors / 162 既有 warnings。
- `pnpm --filter creatoros-frontend build`：PASS；保留已记录的 Turbopack/AI SDK 警告。
- CreatorOS 官方默认环境完整 Chrome E2E：55/55 PASS。
- T-729 当前包链接旅程：CreatorOS 官方默认环境 1/1 PASS；智溯隔离环境 1/1 PASS。
- 渠道 release plan-only：`zhisu-ai/macos-aarch64` preflight PASS。
- 独立规格复审：`PASS[REV:1f5dff2e324b]`；重定向与发布文档两项 finding 均已销账。
- 常见私钥/令牌格式差异扫描：零命中。

## 诚实边界

本 Gate 不把 Chrome 旅程写成签名安装包点击。CreatorOS V1 的 Developer ID、公证、staple、
Gatekeeper、DMG 挂载与真启动由 `desktop-release` 正式 workflow 取证；Windows 未签名如实保留。
智溯AI签名安装包的逐项点击证据在下一次渠道正式包时补录，本任务未部署 Growth、未发布渠道包。
