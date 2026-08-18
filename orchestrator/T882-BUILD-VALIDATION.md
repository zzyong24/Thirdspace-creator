# T-882 CreatorOS 1.1.0 macOS 本地包构建与启动验证

## 候选与范围

- 构建分支：`codex/t793-local-package`
- 构建提交：`15737df41e7b61e834b4009b3ac1086cabdde57b`
- 产品修复提交：`a21552378d4bf1725381e498bd6363d04ae9c196`（T-881 B-roll 删除持久化）
- 验收提交：`15737df41e7b61e834b4009b3ac1086cabdde57b`
- 版本：`frontend/package.json`、`tauri.conf.json`、`Cargo.toml`、`Cargo.lock` 均为 `1.1.0`
- 使用 detached 隔离工作树构建；主工作区两份渠道配置与未跟踪 CLI 导出目录未进入候选。

## 冻结与预检

```bash
git status --porcelain=v1
git diff --check
pnpm -C frontend exec vitest run \
  scripts/desktop/package-local.test.mjs \
  scripts/desktop/desktop-release-workflow.test.mjs \
  scripts/desktop/notarize.test.mjs \
  scripts/desktop/tauri-signing-config.test.mjs
```

- 隔离工作树清洁；候选相对 `origin/main` 的 256 个路径完成凭据文件名与高置信新增密钥扫描，未发现命中。
- 打包测试：4 个测试文件、42 个测试全部通过。
- 第一次完整构建已生成 DMG，但公网 TLS 双探针同时超时或重置，官方脚本按 T-445 退出 1；未把该轮当作完成。
- 系统网络对照恢复后，先用仓库正式 `--verify-tls-only` 入口确认随包 Node 使用内置 CA 可联网，再从同一候选重新运行完整官方入口；第二次完整命令退出 0，未修改或放宽打包代码与检查。

## 完整构建、安装与启动

```bash
pnpm -C frontend desktop:package-local
```

- 规范 DMG：`/Users/zyongzhu/Downloads/CreatorOS-1.1.0.dmg`
- 大小：`433865960` bytes（约 414 MiB）
- SHA-256：`4afc560454b07a6575f8dfaea9d9512a70ecee89e63380aca8c2176e31d8cef1`
- `hdiutil verify`：`VALID`
- 安装位置：`/Applications/CreatorOS.app`
- 安装版本：`1.1.0`
- Bundle ID：`cloud.aitongban.creatoros`
- `codesign --verify --deep --strict`：通过；本地包签名为 `adhoc`，未做 Apple 公证。
- 随包 Node TLS 自包含：`libssl + libcrypto` 入包、`--use-bundled-ca` 生效、无外部 `cert.pem` 的 HTTPS 真握手通过。
- 产品身份清单与 release attestation 已生成，attestation 的 CreatorOS 提交为 `15737df41e7b61e834b4009b3ac1086cabdde57b`。
- 桌面主进程 PID：`59762`。
- 内嵌本地服务 PID：`59849`，监听 `127.0.0.1:53203`。

## 结论

包含 T-881 修复的 CreatorOS 1.1.0 macOS 本地验收包已从干净已提交候选完整构建、替换安装并真实启动。该产物用于当前机器验收；它不是 Developer ID 签名或 Apple 公证的对外正式发布包。本轮未创建 tag、GitHub Release，未推送、未公开分发，也未修改生产下载地址或用户放量配置。
