# T-1259 用户当前版绑定与配置异常排查修复

用户2026-10-12明确要求分析原因、实际排查，确认当前版本有bug即修复。用户口述当前版本1.12，旧版本1.11；附件堆栈runtime-images/1.1.0-461f89527244仅是运行时路径事实，不作为壳版本结论。先核发布版本/缓存选择机制，不未经证据改写用户版本。

来源：T1258四份日志，完整性与初步分类见docs/verification/t1258/REPORT.md。范围是扫码成功后身份已读、绑定失败及EPERM清理；正式采集缺登录态；持续配置同步invalid/retryable。账号未选与定位未保存只在确认非合法空态时修复。全部保持当前账号组所有权、单浏览器profile归属、登录态持久化与安全验签，不删用户正式目录，不重发用户采集，不部署/发布或花费。

沿现有BUILD缺陷入口；非产品方向、数据归属或公共合同改动。定位根因后在此补精确写集与验收，独立只读复核修复候选，TDD真实RED→GREEN与公开调用链验证；Windows真实文件锁与用户安装版不能由mac测试代签。配置如果日志不足不猜根因、不削弱验签，报告已证/未知与所需证据。重大修复收尾运行适用boundary/orphan/timeout、pmem sync与reconcile，保范围外全局失败并登记关联。

当前预计读取：frontend/src/server/ingestion/douyin-cdp.ts、douyin-auth-staging.ts、account-binding-stage.ts、persistence-client.ts、backend执行浏览器生命周期、frontend/src/server/activation/client-config.server.ts与同步协调、Rust runtime缓存选择与发布来源。精确写集随实际缺陷补齐；不允许仅为隐藏日志删除保护。

## 已证实现缺陷与精确修复候选

1. EncryptedClientConfigStore.save无条件open(dir,r)后directory.sync。Windows libuv只读目录句柄传给FlushFileBuffers缺GENERIC_WRITE，保存到rename之后仍会失败；refresh的错误状态save还可能遮住原CLIENT_CONFIG_INVALID。修复只在Windows省去不支持的目录fsync，保留临时文件写入/fsync/close/chmod、rename、密文认证读回；POSIX目录fsync保留，所有实际磁盘与认证错误继续失败，不调整合同或验签。
2. chromium-guard.track监听close事件立即release，而主动ctx.close仍可能处于原close Promise等待。同步或提前close事件会让真实租约与队列提前释放，目录搬移/下一浏览器得以抢先；修复在主动close等待中不把close事件作为完整停止证明，待原close成功后release。主动close失败仍保留占用和重试能力，独立外部close事件保持释放行为。

生产写集：frontend/src/server/activation/client-config.server.ts；ai-worker/src/runtime/browser/chromium-guard.ts。测试写集：frontend/src/server/ingestion/binding-profile-close.integration.test.ts；ai-worker/src/runtime/browser/chromium-guard-close-order.test.ts；frontend/src/server/activation/client-config.server.test.ts追加隔离公共refresh用例；frontend/src/server/ingestion/chromium-guard.test.ts仅校准两例旧超时的虚拟时钟，原预算与断言不改。控制面及本任务验证文档由root单写。全部其他已有dirty文件不纳入提交。

验证：真实RED先确认Windows模拟目录sync失败及close事件早到释放竞态；GREEN后原配置同步/安全拒绝回归、原guard/shutdown/pool与宿主实际租约/临时文件搬移链；本机真Chromium临时profile关→搬→重开可读Cookie（不连平台）。Windows真锁、用户确切壳/运行时版本与正式扫码仍需其环境证据，不虚签。Node/SDK等待预算沿原值不改；新增测试显式120秒以上。

新增防复发登记：orchestrator/LESSON_LEDGER.md LED-062/063及orchestrator/process/reconcile.config.json两条精确守卫。共享配置已有其他人的两行改动保持，不纳入本任务提交。
