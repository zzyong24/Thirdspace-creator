# T-926 macOS 本地包交付

用户清理空间并明确要求重试；沿用冻结候选 `cc75de0f08656289011b1e575f934660cd2038e8`，干净 detached 工作树 `/tmp/creatoros-t918-package`。未改产品或构建脚本。此前 DMG 封装失败作为历史记录保留，本次固定入口重试退出 0，阻塞已解除；没有据重试成功反推上一轮内部错误原因。

- 入口：`CREATOROS_LOCAL_SKIP_INSTALL=1 pnpm -C frontend desktop:package-local`
- 产物：`/Users/zyongzhu/Downloads/CreatorOS-1.1.0.dmg`
- 版本：1.1.0，macOS Apple Silicon（aarch64），最低 macOS 13.5。
- 大小：438804271 字节。
- SHA-256：`1c50e3e3364c88764c41fbe7674b1b4bdec77cf39176df794280e84375036b15`，与 attestation 相同。
- `hdiutil verify`：VALID，退出 0。
- 构建应用 `codesign --verify --deep --strict`：退出 0，本地 ad-hoc 签名，未 Apple 公证。
- 生产编译、TypeScript、Pi闭包/浏览器资源、混淆后隔离运行目录真启动、首页200、浏览器hydration PASS、未授权dispatch403通过。

本包包含 Pi 持续执行、恢复修复和数据变更驱动页面缓存。包成功不代表业务验收通过；AI真实模型、账号/项目切换体感待用户验证。按已有用户授权未跑业务自动测试、四项独立打包vitest或全局reconcile。未安装/启动DMG内应用，未打Windows包、未生成updater制品、未公证、未推送或发布；main未更改，GitHub run不适用。没有修改用户业务数据。

日志：`/tmp/t926-package-retry.log`、`/tmp/t926-dmg-verify.log`。
