# T-659 macOS 本地验收包 BUILD Gate

日期：2026-08-02  
结论：当前工作树已生成 release-fast 本地验收包，安装镜像完整性和真实启动均通过。

## 构建范围

- 基线提交：`25690757eaa52519f1587c3126085393774f8918`。
- 构建时工作树含 228 个未提交变更条目；本包如实包含当前工作树内容，未清理、覆盖或提交用户改动。
- Node：`v25.9.0`；桌面 profile：`release-fast`。
- 本轮仅用于本地验收，不生成 updater 制品，不做 Developer ID 签名与 Apple 公证。
- verdict 仅使用本轮内存临时密钥；私钥未写入仓库、构建产物或日志。

## 产物

- App：`frontend/src-tauri/target/release-fast/bundle/macos/CreatorOS.app`（387 MB）。
- DMG：`frontend/src-tauri/target/release-fast/bundle/dmg/CreatorOS_0.2.1-beta.3_aarch64.dmg`（383 MB）。
- DMG SHA-256：`65b4f73645300e43f917b3193b488736b3fcbf30afb7fa3f5ee351b242fd2b07`。
- 产品身份：`creatoros` / `cloud.aitongban.creatoros` / `0.2.1-beta.3`。
- release manifest 如实标记：`signed:false`、`notarized:false`、`publishAuthorized:false`。

## 验证

- 桌面打包流水线：12 / 12 步通过，总耗时 342.54 秒。
- Next.js 编译、TypeScript 校验、sidecar 混淆、V8 字节码、最终泄漏扫描、TLS 自包含校验均通过。
- 混淆后真实 sidecar 冒烟：`GET / = 200`。
- `hdiutil verify`：DMG checksum VALID。
- 从新生成的 `.app` 实际启动：桌面 PID `81789`，内置服务 PID `81977`。
- 内置服务监听 `127.0.0.1:50013`，真实请求 `GET / = 200`（响应 66,398 字节）。

## 未宣称事项

- 这是未签名、未公证的本地验收包，不作为公开分发包或自动更新包。
- 全局 `reconcile` 若仍报告与本任务无关的历史评审回执欠账，不改变本轮本地构建与真实启动结论。
