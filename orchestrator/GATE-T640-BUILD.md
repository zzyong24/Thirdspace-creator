# T-640 Developer ID 签名与 Apple 公证 Gate

> 当前状态：Developer ID 签名、公证凭据和二次提交流程均已打通；Apple submission `7b1984c0-7c88-41c2-ad18-f5bcda80e22f` 正在服务端扫描。最终以 Accepted、staple 和 Gatekeeper 三项实测结果为准。本文件不记录任何密码、私钥或 API Key。

> 2026-08-01 本地验收口径：用户明确本轮只看当前功能效果，不提交公证。09:54 重新构建的本地 DMG 已完成 Developer ID 签名与镜像内 App 严格验签；`notarized:false`、Gatekeeper `source=Unnotarized Developer ID` 属本轮明确边界，不能作为公开分发包。

## 构建基线

- Git 分支：`main`
- 构建基线 commit：`25690757`（本次公证兼容修复将在验证后提交）
- Bundle ID：`cloud.aitongban.creatoros`
- Apple Team ID：`2K9D3QH3YJ`
- 签名身份：`Developer ID Application: zhu zyong (2K9D3QH3YJ)`
- 公证凭据：登录钥匙串中的 `notarytool` profile `creatoros-developer-id-2K9D3QH3YJ`

## 产物

- App：`frontend/src-tauri/target/release-fast/bundle/macos/CreatorOS.app`
- DMG：`frontend/src-tauri/target/release-fast/bundle/dmg/CreatorOS_0.2.1-beta.3_aarch64.dmg`
- 发布清单：`frontend/src-tauri/target/release-fast/bundle/creatoros-release-manifest.json`
- 产品清单：`frontend/src-tauri/target/release-fast/bundle/creatoros-product-manifest.json`
- 发布证明：`frontend/src-tauri/target/release-fast/bundle/creatoros-release-attestation.json`

最终 DMG 大小和 SHA-256 在 staple 后登记，避免把装订前文件误当成最终发行物。

### 2026-08-01 本地验收包（不公证）

- 构建时间：`2026-08-01 09:53:59 -0700`
- Node / V8 基线：`Node v25.9.0`；sidecar 构建日志与 macOS runtime compatibility gate 均确认
- DMG 大小：`399352276` bytes
- SHA-256：`62467b09ccbb5937e420e12ae29c4b39ecc99f984ebfff6658c3416f81b7a5f0`
- `hdiutil verify`：`VALID`
- DMG `codesign --verify --strict`：PASS，Team ID `2K9D3QH3YJ`
- 挂载后 `CreatorOS.app` 的 `codesign --verify --deep --strict`：PASS，Team ID `2K9D3QH3YJ`
- sidecar 冒烟：ready、`GET / = 200`、未授权 dispatch `403`
- 公证：按用户要求 SKIPPED；`spctl` 返回 `source=Unnotarized Developer ID`，只用于本机验收

### 2026-08-02 统一本地测试包（不签名、不公证）

- 构建时间：`2026-08-02 06:07:44 -0700`
- 构建档位：`release-fast`；Node / V8 基线为 `Node v25.9.0`
- DMG 大小：`401783191` bytes
- SHA-256：`1d8936443962fc7c37bc3db9631dd52a7ecd8e39763b7af4850e6c24ca26e2e8`
- `hdiutil verify`：`VALID`
- 12 个打包阶段全部通过；真实 sidecar smoke 为 ready、`GET / = 200`、未授权 dispatch `403`
- 最终 App TLS 自包含校验通过；verdict 公钥与构建密钥对一致，泄漏扫描通过
- 代码签名与公证：按用户的本地快速验收口径均 SKIPPED，清单明确记录
  `codesign.signed=false`、`notarize.notarized=false`；不得作为公开分发包

## 首次公证失败复盘

- 首次 submission：`d0299d19-5a5d-47df-8c04-ba3044c9de29`，结果 `Invalid`。
- 根因：外层 `CreatorOS.app` 已签名，但 `sidecar.tar.gz` 内的 Chromium、Node、原生 addon 和动态库没有随外层签名覆盖；Apple 会递归扫描压缩资源，因此判定存在未签名代码。
- 同时发现 Chromium bundle 的相对 symlink 在复制时被改写成构建机绝对路径；用户机不存在该缓存路径，会造成运行时断链。
- 给 Node/Chromium 等 V8 主进程统一启用 hardened runtime 后，若缺少 `allow-jit` entitlement，会触发 V8 CodeRange 分配失败；本次只给 `.app/Contents/MacOS/` 主执行文件补最小 JIT entitlement。

## 修复方案

1. 在生成 `sidecar.tar.gz` 前递归识别所有 Mach-O 和嵌套 bundle。
2. 按“Mach-O 全部先签、bundle 由内到外签”的顺序，使用同一 Developer ID、secure timestamp 和 hardened runtime 重签。
3. 对 V8 主执行文件加入最小 `com.apple.security.cs.allow-jit` entitlement，其他动态库不扩大权限。
4. 复制 macOS `.app/.framework` 时保留相对 symlink 字面值，保证 bundle 可搬运。
5. 签名后逐个执行严格验证，再打入 sidecar 压缩包。

本次实际覆盖：Mach-O `70` 个、bundle `7` 个，全部通过签后验证；V8 JIT smoke 返回 `V8_JIT_OK`。

## Gate 结果

| 检查项 | 结果 | 证据 |
| --- | --- | --- |
| 回归测试 | PASS | `macos-runtime-signing` + `build-sidecar`：2 文件、15 tests 通过 |
| 前端生产构建 | PASS | Next.js production build 成功 |
| sidecar 构建与内置资源 | PASS | ffmpeg / ffprobe 内置；真实 sidecar smoke 与 TLS 自包含检查通过 |
| sidecar 内嵌代码签名 | PASS | Mach-O 70 + bundle 7；Developer ID、timestamp、hardened runtime、严格验证通过 |
| V8 JIT 启动 | PASS | 最小 JIT entitlement 生效，smoke 输出 `V8_JIT_OK` |
| Rust / Tauri release-fast | PASS | `.app` 与 `.dmg` 均生成 |
| `.app` Developer ID 签名 | PASS | `codesign --verify --deep --strict` 通过 |
| `.dmg` 签名 | PASS | `codesign` 验证通过 |
| DMG 完整性 | PASS | 构建阶段 `hdiutil verify` 返回 VALID；staple 后再复跑 |
| 公证凭据 | PASS | `notarytool` 钥匙串 profile 已创建并通过 Apple 验证 |
| Apple 公证 | IN PROGRESS | submission `7b1984c0-7c88-41c2-ad18-f5bcda80e22f` |
| staple | PENDING | 等待 Apple Accepted |
| Gatekeeper | PENDING | 等待 staple 后评估最终 DMG 与挂载 App |
| Tauri updater 产物 | SKIPPED | 未配置独立 `TAURI_SIGNING_PRIVATE_KEY`；不影响本地 DMG 安装验收 |

## 完成条件

Apple 公证必须返回 `Accepted`，随后 `stapler validate`、`hdiutil verify`、DMG / 挂载 App 的 `codesign` 与 `spctl` 均通过，登记最终 SHA-256 后，才能用 `taskctl complete T-640` 完成任务。
