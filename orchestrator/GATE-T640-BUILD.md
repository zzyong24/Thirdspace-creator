# T-640 本地签名安装包 Gate

> 结论：本地 Developer ID 签名安装包已成功产出；Apple 公证凭据尚未建立，因此“签名包”通过，“公证 / staple / Gatekeeper”仍待完成。本文件不记录任何密码、私钥或 API Key。

## 构建基线

- Git 分支：`main`
- 构建 commit：`cfe0e4cc`
- Bundle ID：`cloud.aitongban.creatoros`
- Apple Team ID：`2K9D3QH3YJ`
- 签名身份：`Developer ID Application: zhu zyong (2K9D3QH3YJ)`

## 产物

- App：`frontend/src-tauri/target/release-fast/bundle/macos/CreatorOS.app`
- DMG：`frontend/src-tauri/target/release-fast/bundle/dmg/CreatorOS_0.2.1-beta.3_aarch64.dmg`
- DMG 大小：`404235109` bytes
- DMG SHA-256：`2a24496c3a4a66a77e9c55be11af1bc9c6d945439acc4bf1e911bfd666096232`
- 发布清单：`frontend/src-tauri/target/release-fast/bundle/creatoros-release-manifest.json`
- 产品清单：`frontend/src-tauri/target/release-fast/bundle/creatoros-product-manifest.json`
- 发布证明：`frontend/src-tauri/target/release-fast/bundle/creatoros-release-attestation.json`

## Gate 结果

| 检查项 | 结果 | 证据 |
| --- | --- | --- |
| 前端生产构建 | PASS | Next.js production build 成功 |
| sidecar 构建与内置资源 | PASS | ffmpeg / ffprobe 已内置，真实 sidecar smoke：ready、GET / 200、未授权 dispatch 403 |
| Rust / Tauri release-fast | PASS | `.app` 与 `.dmg` 均生成 |
| `.app` Developer ID 签名 | PASS | `codesign --verify --deep --strict` 通过 |
| `.dmg` 签名 | PASS | `codesign` 验证通过 |
| DMG 完整性 | PASS | `hdiutil verify` 返回 VALID |
| Apple 公证 | BLOCKED | App Store Connect 团队 API 访问已获批，但 Active Keys 为 0；本机无 notarytool profile |
| staple | BLOCKED | 依赖公证成功 |
| Gatekeeper | BLOCKED | `spctl` 当前为 `Unnotarized Developer ID`，签名来源与 Team ID 正确 |
| Tauri updater 产物 | SKIPPED | 未配置独立 `TAURI_SIGNING_PRIVATE_KEY`；不影响本地 DMG 安装验收 |

## 后续闭环

1. 在 App Store Connect → Users and Access → Integrations → App Store Connect API 中生成团队 API Key。
2. 将 `.p8` 放入本机受控目录并设为 `600`，再写入 `notarytool` 钥匙串 profile；禁止提交仓库。
3. 重新提交 DMG 公证、staple，并复跑 `spctl`。
4. 公证、staple、Gatekeeper 全部通过后，才能用 `taskctl complete T-640` 完成任务。
