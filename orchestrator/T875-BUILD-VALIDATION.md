# T-875 macOS DMG 高清安装引导验证

## 结果

- 官方 CreatorOS DMG 使用 `800×500` Finder 逻辑窗口与 `1600×1000` `@2x` PNG 背景。
- 应用图标位于 `(225,245)`，Applications 位于 `(575,245)`；两者与背景圆环和拖动箭头对齐。
- 背景包含 CreatorOS 品牌、明确的“拖动 CreatorOS 到‘应用程序’”说明及 01/02/03 三步引导。
- 渠道包 Tauri override 显式把官方 DMG 背景置空，不会在白标安装阶段泄露 CreatorOS 品牌。
- Windows 配置未改动。

## 真实 Finder 视觉验证

2026-08-17 在当前 macOS 上创建隔离 HFS 可写安装盘，放入现有 CreatorOS.app 与 Applications 链接，使用与 Tauri 配置一致的背景、窗口和图标坐标；挂载后由 Finder 设置背景，关闭并重新打开窗口，再以 Retina 原始尺寸截图。

- 截图：[`evidence/T-875/creatoros-dmg-finder-retina.png`](evidence/T-875/creatoros-dmg-finder-retina.png)
- 截图像素：`1600×1000`
- 结论：Finder 正确识别 `@2x` 资源为 `800×500` 点背景；文字、线条与图标均清晰，无横向滚动条，隐藏资源未出现在可视区域。
- 隔离安装盘已卸载；临时源、可写镜像和预览目录已移入系统废纸篓，未修改 `/Applications/CreatorOS.app`。

## 可复现测试

```bash
pnpm --dir frontend exec vitest run \
  scripts/desktop/dmg-install-guide.test.mjs \
  scripts/desktop/package-flavor.test.mjs \
  scripts/desktop/package-local.test.mjs \
  scripts/desktop/desktop-release-workflow.test.mjs

pnpm --dir frontend typecheck
pnpm --dir frontend exec tauri info
```

测试结果：4 个测试文件、43 个测试全部通过；前端类型检查通过；Tauri 成功读取官方配置。`tauri info` 同时报告当前机器未安装完整 Xcode，仅有 Command Line Tools，这不影响本次 Finder 布局验证，但正式签名/公证包仍需按发布流水线在具备完整 Xcode 和干净候选提交的构建环境执行。
