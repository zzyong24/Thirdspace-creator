# T-888 CreatorOS 1.1.0 macOS 本地包构建与启动验证

## 候选与范围

- 构建分支：`codex/t793-local-package`
- 冻结构建提交：`67ceb3b9b19baef6333dbfe826e9679a5845337e`
- 包含修复：`e0818f6b`（本地 Whisper worker 分层运行时）与 `67ceb3b9`（内容雷达真实总量和继续加载）
- 版本：`frontend/package.json`、`tauri.conf.json`、`Cargo.toml`、`Cargo.lock` 均为 `1.1.0`
- 从 detached 隔离工作树 `/tmp/creatoros-t888.2wNtEA` 构建；主工作区未跟踪的
  `output/public-skills/creatoros-cli/` 未进入候选。

## 冻结与预检

```bash
pnpm install --offline --frozen-lockfile
pnpm -C frontend exec vitest run \
  scripts/desktop/package-local.test.mjs \
  scripts/desktop/desktop-release-workflow.test.mjs \
  scripts/desktop/notarize.test.mjs \
  scripts/desktop/tauri-signing-config.test.mjs
```

- 隔离工作树在构建前后均清洁，提交均为 `67ceb3b9b19baef6333dbfe826e9679a5845337e`。
- 依赖从本机 store 离线、锁文件冻结安装成功。
- 打包测试：4 个测试文件、42 个测试全部通过。
- 候选高置信凭据扫描未发现私钥 PEM 或已知 Omnihi 密钥模式。

## 完整构建、安装与启动

```bash
pnpm -C frontend desktop:package-local
```

- Next.js 生产构建、类型检查与 26 个静态页面生成通过。
- Sidecar 真实冒烟通过：根页面 HTTP 200、浏览器 hydration 通过、未授权 dispatch 返回预期 403。
- 本地 Whisper 所需 Xenova/ONNX/ffmpeg/ffprobe、分层模块解析器和内嵌 Chromium 闭包检查通过。
- 随包 Node TLS 自包含检查通过：内嵌 `libssl + libcrypto`，使用 bundled CA 的 HTTPS 真握手通过。
- 规范 DMG：`/Users/zyongzhu/Downloads/CreatorOS-1.1.0.dmg`
- 大小：`433878050` bytes（约 414 MiB）
- SHA-256：`02e6ccf3500fb1383a7d78265df5023c439a0b8a36a1ee2557d4eca6e32ba105`
- `hdiutil verify`：`VALID`
- 安装位置：`/Applications/CreatorOS.app`
- 安装版本：`1.1.0`
- Bundle ID：`cloud.aitongban.creatoros`
- `codesign --verify --deep --strict`：通过。
- 自动安装后的首轮桌面/内嵌服务 PID 为 `3305` / `13415`；随后执行受控退出和重新启动复验，当前桌面
  主进程 PID 为 `99290`，内嵌服务 PID 为 `99378`，监听 `127.0.0.1:58769`。
- 内嵌服务从版本化 runtime
  `/Users/zyongzhu/Library/Application Support/cloud.aitongban.creatoros/runtime/1.1.0/sidecar/` 启动；Next.js
  ready 后会把进程标题改为 `next-server (v16.2.9)`，因此不能只按初始可执行文件名判断它是否退出。
- 最新加密启动日志只读核对到 `Ready in 0ms`、`SIDECAR_STARTUP_VERIFIED` 和启动/引导配置同步完成，未见
  fatal/panic；`lsof` 对上述 PID/端口确认处于 LISTEN。
- release attestation 的 CreatorOS 提交与候选一致，DMG 哈希与独立校验一致。

## 诚实边界

这是当前机器的本地验收包，使用 ad-hoc 签名；没有 Developer ID 正式签名或 Apple 公证，不能冒充对外
正式发行包。本轮未推送分支、未创建 tag/GitHub Release、未触发公开发布，也未修改生产下载地址、用户
数据或放量配置。

`node orchestrator/process/reconcile.mjs` 已执行。本任务相关的物理边界、孤儿代码、资产、文档、知识漂移
以及 LED-041/LED-042 防回归门均通过；全局命令仍以 1 退出，报告 96 项既有 review receipt / 历史前端
验收列漂移和 1 项 BACKLOG 体积警告。它们不是本次打包引入，本轮不把全局治理状态写成全绿，也不在
冻结打包任务中扩大范围修复历史欠账。

## 结论

包含本地 Whisper 与内容雷达真实总量修复的 CreatorOS 1.1.0 已从干净已提交候选完整构建，DMG 校验
有效，应用已替换安装并真实启动，桌面主进程和版本化 Sidecar 均持续运行。
