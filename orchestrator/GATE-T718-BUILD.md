# T-718 BUILD Gate：智溯AI完整白标修复

日期：2026-08-07  
状态：实现与本机验证通过，等待用户查看真实安装截图后确认体验。

## 红→绿证据

- RED：`compilePackageBrandBuildEnv is not a function`；侧边栏期望“智溯AI”但实际仍为“CreatorOS”。
- GREEN：`pnpm --dir frontend exec vitest run scripts/desktop/package-flavor.test.mjs scripts/desktop/package-local.test.mjs scripts/desktop/package-brand-surface.test.mjs src/components/shell/shell.test.tsx`，48/48 通过。
- `pnpm --dir frontend typecheck` 通过；Rust `product_identity::tests` 3/3 通过。
- `node orchestrator/process/boundary-scan.mjs`：0 条新增物理边界违规；剩余 5 条均在既有基线内。

## 真实构建与安装

- 命令：`pnpm -C frontend desktop:package-channel -- --manifest branding/packages/zhisu-ai/package.json --target macos-aarch64 --mode local-test`
- DMG：`/Users/zyongzhu/Downloads/智溯AI-0.3.0.dmg`
- 大小：`427359467` bytes
- SHA-256：`bd00787767ae731959576ff1ee9783b8d4f2e0b0ee5ef3e35895796879c1c1e0`
- `hdiutil verify`：VALID
- 安装：`/Applications/智溯AI.app`
- bundle identifier：`com.zhisunet.zhisuai`
- 签名：本地 ad-hoc；未做 Developer ID 与 Apple 公证，不能冒充正式发布包。
- 真实进程：`/Applications/智溯AI.app/Contents/MacOS/ZhisuAI` 与安装目录内 `next-server` 均已启动。

## 应用内部品牌证据

- 原生窗口标题：`智溯AI`（System Events 实际窗口回读）。
- 安装 runtime 的 HTML：`<title>智溯AI`。
- 安装 runtime 的客户端 chunk：包含经清单校验的 `data:image/x-icon;base64,...` 品牌图标。
- 侧边栏：真实安装截图中品牌图标与品牌名均为“智溯AI”。
- 截图：`channel-partners/智溯科技/zhisu-ai-t718-installed.png`；SHA-256 `22f610476a8701436b11e7a4fc067f1901367905fba88cf26c44edc46a85a844`。

## Growth 与 Skill

- 完整 Growth 配置：`channel-partners/智溯科技/growth-product-config.json`，与当前 Growth 权威样例逐字节一致，包含 `channelService + productConfig`。
- `packaging-creatoros-channel` Skill 已加入完整 Growth 文件、窗口标题、HTML 标题、侧边栏名称/图标与真实安装截图强制 Gate。
- 未上传、未发布、未修改线上 Growth。

## 文档核对

本次实现保持 T-694 的权威边界：包级品牌只负责激活前/离线兜底；激活后 Growth 已验签 `brandName` 优先，五个业务链接仍只认 Growth，不产生第二份运行时链接配置。
