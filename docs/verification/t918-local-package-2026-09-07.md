# T-918 本地安装包交付

候选：`9ead4cb7237852ae2c723911b47723cee9b864a5`。独立干净工作树 `/tmp/creatoros-t918-package`，固定入口 `CREATOROS_LOCAL_SKIP_INSTALL=1 pnpm -C frontend desktop:package-local` 退出 0。

- 产物：`/Users/zyongzhu/Downloads/CreatorOS-1.1.0.dmg`
- 版本：1.1.0；macOS Apple Silicon（aarch64），最低 macOS 13.5。
- 大小：437156865 字节。
- SHA-256：`544351268d2004bb4cc46230c18229300f926b7742bcbbdc8a3421984ccfee0e`，与打包 attestation 一致；attestation creator commit 与候选一致。
- `hdiutil verify`：VALID，退出 0。
- `codesign --verify --deep --strict` 对构建应用：退出 0；ad-hoc 签名，未 Apple 公证。
- Next 生产编译与类型检查通过；隔离 sidecar 真启动、GET / 200、浏览器 hydration PASS，dispatch 未授权返回 403。隔离数据、media 和 workspace 目录，不使用业务媒体目录。
- 七类 Worker 在打包 Node 下启动/ready IPC 成功并结束进程；这项证据来自前一候选 2429b1db 的同版 Worker，最终候选仅随后修复宿主定时器启动顺序并登记任务，无 Worker 代码变化。
- 全量 Chromium 1223 与原生依赖已纳入本地打包资源。

本次修复聊天类型接线、已退役 runner 的残留引用、Worker 外置依赖包闭包及宿主定时器初始化顺序。没有运行用户已要求暂缓的业务自动测试、四项独立打包 vitest 或全局 reconcile；沿用用户自测安排，不记为测试 PASS。没有安装或真实启动 DMG 内应用，没有调用真实模型验证业务，没有 Windows 包、updater 制品、公证、推送或发布。

T-918 的本地包交付完成；T-915 不据此标成全项目重构/业务验收完成。完整宿主装配、部分浏览器物理边界与全功能运行验收仍未结束，AI SDK 尚有短路径/流协议适配用途。建议用户实测聊天自主执行、联网搜索/浏览器失败恢复、暂停/继续/取消以及分享导入。

本地原始日志：`/tmp/t918-package-5.log`、`/tmp/t918-dmg-verify.log`、`/tmp/t918-worker-startup.json`。
