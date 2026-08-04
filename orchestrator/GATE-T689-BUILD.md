# T-689 CreatorOS 0.3.0 双端发布 Gate

> 状态：执行中。只记录本轮真实发生的验证与产物，不补拍历史证据。

## 发布范围

- 版本：`0.3.0`
- macOS：本机快速测试包，不执行 Developer ID 签名与苹果公证。
- Windows：使用 GitHub Actions 的少文件分层 runtime 打包链，完成安装、启动和卸载冒烟。
- 包含：当前工作树中已经完成并通过聚焦测试的 T-679、T-683、T-684、T-685、T-686、T-687 修复。

## 已完成证据

- [x] 版本权威一致：`frontend/package.json`、`tauri.conf.json`、`Cargo.toml`、`Cargo.lock` 均为 `0.3.0`；应用标识仍为 `cloud.aitongban.creatoros`。
- [x] 聚焦回归通过：backend `385`、frontend `109`、ai-worker `21` 项，共 `515` 项；三端 TypeScript 类型检查通过。
- [x] 全量 backend 测试额外发现并修复 `intelligence.topic-adapted-draft` Skill 两端注册表不一致；修后专项回归通过。全量基线其余 `2654` 项通过、`4` 项跳过。
- [x] macOS 本地 `desktop:package` 全链通过：Next production build、sidecar 组装、混淆、V8 字节码、真启动冒烟、Tauri `release-fast`、verdict 泄漏扫描与 TLS 自包含检查均通过。
- [x] macOS DMG：`frontend/src-tauri/target/release-fast/bundle/dmg/CreatorOS_0.3.0_aarch64.dmg`，`405243579` bytes，SHA-256 `0f5a4bb91da8fb5db086ddb644b37c41db2e18f3df0364f85ec0ff38b47eb340`，`hdiutil verify` 为 VALID。
- [x] macOS 诚实边界：本地临时 verdict 密钥只用于本轮测试包；未配置 Developer ID 与公证凭据，manifest 按 `signed:false`、`notarized:false` 记录，不作为正式公开发布包。

## 待完成证据

- [ ] Windows setup.exe 流水线通过并检查
- [ ] Windows 产物大小与 SHA-256 已记录
