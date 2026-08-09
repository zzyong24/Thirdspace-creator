# T-696 BUILD 证据：渠道配置核实与 macOS 0.3.0 本地包

日期：2026-08-04（America/Los_Angeles）

## 结论

- CreatorOS 已实现激活后通过 Activity 配置票据向 Growth 拉取渠道配置，并将
  `activation_managed` 的受管子 Key 写入系统密钥库；前端只展示同步状态，不展示 Key 明文。
- 设置页已支持按 Growth 下发的 `homepageUrl`、`purchaseUrl`、`rechargeUrl`、`helpUrl`
  条件渲染入口；Growth 未下发某个 URL 时不显示假按钮。
- 当前不能宣称线上端到端已完成：CreatorOS 可分发构建的渠道配置开关仍默认关闭，正式流水线
  尚未注入 Growth 生产验签公钥与 keyId；Growth 当前默认 `omnihi-main` 模板的
  `rechargeUrl` 仍为 `null`。因此本轮本地包不冒用测试验签材料，保持渠道配置拉取关闭。

## 定向验证

- CreatorOS 前端渠道配置、启动同步、设置页：5 个测试文件、87 项测试通过。
- Backend 渠道模型选择：1 个测试文件、6 项测试通过。
- 桌面构建使用 Node `v25.9.0`，产品标识 `creatoros`，版本 `0.3.0`。
- sidecar 启动冒烟通过：ready、`GET / = 200`、dispatch 非崩溃。
- 最终 `.app` verdict 公钥与本轮本地测试密钥匹配。
- TLS 自包含校验通过：随包 OpenSSL 动态库、`--use-bundled-ca` 与 HTTPS 探针均通过。
- DMG 经 `hdiutil verify` 校验有效。

## 本地产物

- DMG：`frontend/src-tauri/target/release-fast/bundle/dmg/CreatorOS_0.3.0_aarch64.dmg`
- 大小：387 MiB
- SHA-256：`ebab6ebd1d729220e7e9a947fe68bd0de9180aed4bf54e19f74d273e4eaec92b`
- Bundle ID：`cloud.aitongban.creatoros`
- 本轮按用户约定仅供本地验收，未签名、未公证、未生成 updater 制品，不可作为公开发布包。

## 后续上线前置

1. Growth 为 `omnihi-main` 下发真实 Growth 充值页 `rechargeUrl`。
2. 受控发布环境注入 Growth 生产配置验签公钥与 keyId，并开启
   `CREATOROS_CLIENT_CONFIG_PULL_ENABLED=1`。
3. 使用真实渠道激活码完成 Activity → Growth → CreatorOS 的在线 E2E，核验配置、受管 Key、
   模型下拉及充值入口。
