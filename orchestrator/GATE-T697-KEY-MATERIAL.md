# GATE-T697 — Growth 渠道配置签名材料

日期：2026-08-05

## 产物

- `keyId`：`growth-client-config-20260805-01`
- CreatorOS 公钥：`cG3l6VkbAEENtr3ulPKufX9ajN57TWKZMM5gYDuE+WU=`（Ed25519 raw 32 bytes，Base64）
- Growth 私钥：仅存在仓库外
  `/Users/zyongzhu/.config/thirdspace-growth/secrets/client-config-signing/growth-client-config-20260805-01.seed.b64`；
  文件权限 `0600`，父目录权限 `0700`，本文不记录私钥内容。
- Growth 运维真相：
  `/Users/zyongzhu/Workbase/Thirdspace-growth/docs/operations/T-133-client-config-signing-trust-material.md`

## 新鲜验证

1. Growth `ClientConfigBundleSigner` 使用新私钥签名最小 `growth-client-config-bundle-v1`，由登记公钥
   独立验签：`SIGN_VERIFY_OK keyId=growth-client-config-20260805-01 publicKeyBytes=32`。
2. 两仓排除 `.git/node_modules/.next/target` 后按私钥原始内容扫描：`PRIVATE_KEY_REPO_SCAN_OK`。
3. 私钥物理检查：`PRIVATE_KEY_MODE=600 PRIVATE_KEY_BYTES=45`（Base64 编码的 32-byte seed）。
4. CreatorOS 使用真实公开材料执行：

   ```bash
   CREATOROS_CLIENT_CONFIG_PULL_ENABLED=1 \
   CREATOROS_GROWTH_CLIENT_CONFIG_ORIGIN=https://growth.aitongban.cloud \
   CREATOROS_GROWTH_CONFIG_PUBLIC_KEY_B64=cG3l6VkbAEENtr3ulPKufX9ajN57TWKZMM5gYDuE+WU= \
   CREATOROS_GROWTH_CONFIG_KEY_ID=growth-client-config-20260805-01 \
   cargo check --manifest-path frontend/src-tauri/Cargo.toml
   ```

   结果：`Finished dev profile`；仅保留既有 `decoy_gate.rs` dead-code warning。
5. Growth 与 CreatorOS 受影响文件分别执行 `git diff --check`：通过。

## 边界

- 本 Gate 证明密钥配对、签名/验签、构建注入格式和仓库防泄漏正确。
- 本 Gate 不代表 Growth 已部署新私钥，也不代表三仓真实激活码 E2E 已完成；最终上线仍由 J-133
  Program Gate 的真实 release set 和 non-fixture receipt 判定。
