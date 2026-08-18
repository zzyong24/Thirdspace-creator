# T-880 CreatorOS 1.1.0 macOS 本地包构建与启动验证

## 候选与范围

- 构建分支：`codex/t793-local-package`
- 构建提交：`a573549d0f6840f40c3e74d8eff000eb9c386a33`
- 产品修复提交：`d09e8e2a7a65`（T-879 时间线闭合）
- 版本：`frontend/package.json`、`tauri.conf.json`、`Cargo.toml`、`Cargo.lock` 均为 `1.1.0`
- 构建前工作树已清洁；两份渠道包构建元数据及 `output/public-skills/creatoros-cli/` 被按明确路径临时隔离，构建结束后原样恢复，未进入官方包候选。

## 冻结检查

```bash
git status --porcelain=v1
git diff --check
pnpm -C frontend exec vitest run \
  scripts/desktop/package-local.test.mjs \
  scripts/desktop/desktop-release-workflow.test.mjs \
  scripts/desktop/notarize.test.mjs \
  scripts/desktop/tauri-signing-config.test.mjs
```

- 打包测试：4 个测试文件、42 个测试全部通过。
- 相对 `origin/main` 的 239 个变更路径完成凭据文件名和高置信新增密钥扫描，未发现命中。

## 构建、安装与启动

```bash
pnpm -C frontend desktop:package-local
```

- 规范 DMG：`/Users/zyongzhu/Downloads/CreatorOS-1.1.0.dmg`
- 大小：约 `414 MiB`
- SHA-256：`dc9c9c830bb8fd08f159dce51ac3196d336384a62f565cb01462f55ca45ebb3f`
- `hdiutil verify`：`VALID`
- 安装位置：`/Applications/CreatorOS.app`
- 安装版本：`1.1.0`
- Bundle ID：`cloud.aitongban.creatoros`
- `codesign --verify --deep --strict`：通过；本地包签名为 `adhoc`，未做 Apple 公证。
- 桌面主进程：`/Applications/CreatorOS.app/Contents/MacOS/CreatorOS`，启动 PID `1939`。
- 内嵌本地服务：子进程 PID `2114`，已监听 `127.0.0.1:58219`。

## 结论

包含 T-879 修复的 CreatorOS 1.1.0 macOS 本地验收包已重新构建、替换安装并真实启动。本产物用于当前机器验收；它不是 Developer ID 签名或 Apple 公证的对外正式发布包。

项目级 `reconcile` 已执行：本次相关 lesson guard（含 LED-039）和边界、孤儿、资产检查均通过；全局结果仍因 96 条既有历史 review/frontend receipt 归档错误退出 1，与本次打包产物、安装或启动无关，未伪报全绿。
