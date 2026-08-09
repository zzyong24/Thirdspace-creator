# 智溯科技｜智溯AI 渠道交付

任务：`T-717`（首次构建）→ `T-718`（完整白标修复与重构建）  
包标识建议：`zhisu-ai`  
目标：Apple 芯片 macOS 本地测试包（不上传、不发布、不修改线上 Growth）

## 已归档

- Growth 渠道服务精简输入：[`growth-channel-service.input.json`](growth-channel-service.input.json)
- Growth 完整配置（`channelService` + `productConfig`）：[`growth-product-config.json`](growth-product-config.json)
- 不可变桌面身份建议：[`package-identity-proposal.json`](package-identity-proposal.json)
- 构建清单暂存：`frontend/branding/packages/zhisu-ai/package.request.json`
- macOS 图标：`frontend/branding/packages/zhisu-ai/assets/icon.icns`
- Windows 图标：`frontend/branding/packages/zhisu-ai/assets/icon.ico`
- 本次 1024×1024 PNG 来源图 SHA-256：`5d44ad41ed09e8fc89ddb97b46732dd099629a0641cbac1c085a07afad81f797`

五个业务链接已于 2026-08-07 逐一通过 HTTPS 访问检查并返回 HTTP 200。

## 已确认构建输入

1. Growth / Activity 精确 `channelRef`：`partner-p501444c`；
2. 包级更新 HTTPS origin：`https://creatoros.aitongban.cloud`；
3. 共享 runtime HTTPS origin：`https://creatoros.aitongban.cloud`；
4. `package-identity-proposal.json` 中的不可变身份已由用户于 2026-08-07 确认。

`channelRef` 来自 Growth 智溯AI受控发布契约与生产回读证据；更新 origin 复用 CreatorOS 当前官方
origin。本轮只构建 `local-test`，不上传、不发布、不修改线上 Growth。

## 本地测试包结果

- DMG：`/Users/zyongzhu/Downloads/智溯AI-0.3.0.dmg`
- SHA-256：`bd00787767ae731959576ff1ee9783b8d4f2e0b0ee5ef3e35895796879c1c1e0`
- 安装：`/Applications/智溯AI.app`
- 验证：DMG checksum、bundle identifier、图标、ad-hoc 签名与真实应用进程均已通过；原生窗口标题、HTML 标题、侧边栏品牌名和品牌图标均为“智溯AI”
- 应用内部截图：[`zhisu-ai-t718-installed.png`](zhisu-ai-t718-installed.png)
- 发布边界：未做 Developer ID 签名与 Apple 公证，不是对外正式发布包

机器可读结果见 [`local-test-build.json`](local-test-build.json)。
