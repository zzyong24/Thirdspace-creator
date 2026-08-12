# T-793 SHIP Gate：最新内容 Skill 本地安装包

日期：2026-08-12
状态：本地 macOS 测试包已构建、校验、安装并真实启动；未上传 GitHub，未发布渠道包。

```frontend-validation
{
  "schema": "frontend-validation/v1",
  "task_id": "T-793",
  "contract_path": "orchestrator/T793-FRONTEND-JOURNEY.md",
  "contract_sha": "65b788b3f008",
  "commit_sha": "c0679e36cddba25156171e9a2de2003937587ff0",
  "observed_at": "2026-08-12T17:51:35.000Z",
  "run": {
    "verify_key": "creatoros-local-package:test",
    "command": "pnpm --dir frontend exec vitest run scripts/desktop/package-local.test.mjs scripts/desktop/desktop-release-workflow.test.mjs scripts/desktop/notarize.test.mjs scripts/desktop/tauri-signing-config.test.mjs",
    "exit_code": 0,
    "output_ref": "打包专用预检 4 个文件、41 项测试全部通过"
  },
  "environment": {
    "surface": "desktop-app",
    "runtime": "macOS CreatorOS 1.0.0 本地安装应用、Tauri WebView 与随包 Next 服务",
    "viewports": [
      { "width": 1280, "height": 800, "result": "pass" },
      { "width": 1024, "height": 720, "result": "pass" }
    ]
  },
  "data": {
    "mode": "non-fixture",
    "witnesses": [
      { "id": "source-commit", "role": "冻结内容实现提交 1642c9980d96581840fa4bd091e68965d5233c12" },
      { "id": "local-dmg", "role": "下载目录中的 429313287 字节 CreatorOS 1.0.0 本地 DMG" },
      { "id": "installed-app", "role": "实际安装路径中的 CreatorOS 1.0.0 应用与运行进程" }
    ]
  },
  "levels": {
    "logic": { "status": "pass", "evidence_ref": "打包预检 41/41；T-790、T-791、T-792 聚焦回归与评分 Gate 已通过" },
    "surface": { "status": "pass", "evidence_ref": "真实安装应用在 1280×800 与 1024×720 两档窗口均呈现 CreatorOS 窗口" },
    "journey": { "status": "pass", "evidence_ref": "冻结提交经官方 desktop:package-local 生成唯一 DMG，完成挂载校验、替换安装和真实启动" },
    "experience": { "status": "pass", "evidence_ref": "应用标题为 CreatorOS，常规与最小窗口均存活；未向用户暴露内部任务编号或打包术语" }
  },
  "checks": [
    { "id": "AC-LOCAL-PACKAGE-IDENTITY", "test_id": "E2E-T793-01", "result": "pass", "evidence_ref": "应用版本 1.0.0、标识 cloud.aitongban.creatoros；release attestation 绑定内容实现提交 1642c9980d96581840fa4bd091e68965d5233c12" },
    { "id": "AC-LOCAL-PACKAGE-CONTENT-SKILLS", "test_id": "E2E-T793-02", "result": "pass", "evidence_ref": "冻结提交包含 script.draft v9、video.broll v5、cover.brief v2、material.generate 内容辅助型提示词与 T-791 受信资料输入链；相关 BUILD Gate 已通过" },
    { "id": "AC-LOCAL-PACKAGE-DMG-INTEGRITY", "test_id": "E2E-T793-03", "result": "pass", "evidence_ref": "DMG SHA-256 934d3b1d16598427483d7224d0c64d442f7c34ac8055f4bf733e90ef09a1583f；hdiutil verify 有效，挂载应用 codesign 深度严格校验通过" },
    { "id": "AC-LOCAL-PACKAGE-INSTALL-LAUNCH", "test_id": "E2E-T793-04", "result": "pass", "evidence_ref": "官方入口替换 /Applications/CreatorOS.app 并启动；主进程 pid 63120，随包 Next 服务存活；DMG 与安装版主程序及 sidecar 哈希逐项一致" }
  ],
  "coverage": [
    { "condition": "frozen-committed-source", "result": "pass", "evidence_ref": "独立干净 worktree 从 1642c9980d96581840fa4bd091e68965d5233c12 构建，构建后 git 状态仍干净", "reason": "" },
    { "condition": "package-preflight-green", "result": "pass", "evidence_ref": "固定打包预检 4 文件、41 项测试全部通过", "reason": "" },
    { "condition": "dmg-mountable", "result": "pass", "evidence_ref": "DMG 校验有效并以只读方式真实挂载，包含 CreatorOS.app 与 Applications 快捷方式", "reason": "" },
    { "condition": "installed-binary-matches-dmg", "result": "pass", "evidence_ref": "主程序 SHA-256 均为 51dcddc1ce270b63db4918ac8a6c13d9be0ef1a69e0f67210d591b4afc85cc42；sidecar 均为 c2ba2ee8525675d2628aebaa4218c5cf12fe6836c5043e0ef336e02f8f5d5756", "reason": "" },
    { "condition": "real-desktop-launch", "result": "pass", "evidence_ref": "实际安装应用主进程与随包 Next 服务均在运行，不是开发服务或静态文件检查", "reason": "" },
    { "condition": "normal-and-minimum-window", "result": "pass", "evidence_ref": "通过 macOS 辅助功能读取真实 CreatorOS 窗口，在 1280×800 与 1024×720 两档均返回产品标题", "reason": "" }
  ],
  "visible_copy": {
    "artifact_path": "orchestrator/evidence/T-793-visible-copy.json",
    "artifact_sha256": "e931a1263a3db8c6cc4525815aa6be0a80a9e4f88cb7860d95f88c786abbe4c7"
  },
  "tdd_red_ref": "首次进入发布冻结时，门卫因源码仍有未提交的同日内容链改动而拒绝打包；完成 T-790、T-791、T-792 验收并冻结为干净提交后，固定打包预检与真实安装旅程才转绿。",
  "open_defects": [],
  "status": "pass"
}
```

## 交付物

- 本地安装包：`~/Downloads/CreatorOS-1.0.0.dmg`
- 大小：429,313,287 字节
- SHA-256：`934d3b1d16598427483d7224d0c64d442f7c34ac8055f4bf733e90ef09a1583f`
- 安装位置：`/Applications/CreatorOS.app`
- 内容实现提交：`1642c9980d96581840fa4bd091e68965d5233c12`

## 发布边界

- 这是本机测试包，使用完整 ad-hoc bundle 签名；没有 Apple Developer ID 签名，也没有公证。
- 本轮未上传 GitHub、未生成 updater 发布制品、未发布任何渠道包。

## 全局对账保留项

本任务 Gate 全部通过后运行了全局 `reconcile`，仍有 6 项既有范围外债务，因此不宣称全仓全绿：看板历史体量超限；T-770、T-765、T-746 三份旧审核回执过期；T-727、T-722 两份旧前端回执因后续代码变化失效。其余物理边界、孤儿扫描、资产完整性及全部项目教训守卫通过；这些既有项没有改变本轮冻结源码、DMG 完整性、安装物哈希或真实启动结论。
