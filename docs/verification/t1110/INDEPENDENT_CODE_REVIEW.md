# T1110 最终源码限时复核

2026-10-09，工作树 /Users/zyongzhu/.codex/worktrees/canvas-binding-fixes/Thirdspace-creator，HEAD dc61f1d6e492643756da0b63e627d58d51aced75；审查对象包含尚未提交的当前工作树。仅只读源码、测试和既有验证日志；没有修改产品/控制面、重跑测试、读取真实账号数据库/Cookie/profile或操作平台。

**结论：本次指定代码范围未发现新的确定性源码缺陷；原两项 finding 和已知拒绝文案遗漏已闭合。** 这是已检查部分的代码结论，不代签整体任务、浏览器真人验收或视觉 Gate。

| 复核项 | 当前源码与结论 |
|---|---|
| 相同空文件的移动日期窗口 | platform-collection.service.ts:612–618 将固定顺序 startDate/endDate/timeZone/meaning 的 SHA256 selectionKey 加入内部唯一键；schema:178–180 与0131:7–9一致。原字节SHA不改，同窗口完整payload冲突仍检查。service:810明确排除内部selectionKey，严格公开DTO不扩。原page全内容摘要及generation/lease保护继续保留。 |
| 微信调度的原持久owner | service:443–449 识别 nativeReports/-reports，并先重验原冻结成员与组；返回ID仍以真实 readScheduledOwner 为条件，伪造prefix/null不授权。paused/unknown真实owner保原ID，取消/失败和扫码恢复沿原run；persistence-client.ts:4881–4883无signal扫描先判owner，不进活动map/账号队列。 |
| 已确定业务拒绝与未知响应 | native-report-panel.tsx:92–98 区分明确4xx和网络/5xx未知，SCOPE_MISSING显示扫码绑定入口(:115)，未把未核验身份说成Cookie过期。保原key，未知响应仍核对原请求；原期限耗尽仅用户明确重新同步创建新意图。 |
| 终页ACK丢失 | service仍不放宽已完成run的旧租约重放。platform-native-reports.integration.test.ts:117–124 在真实DB终页提交后人为丢ACK；公开get原ID为complete，公开start原key仍返回同ID/complete，下载一次且三份报告保留。执行器局部返回partial不能覆盖已持久complete，旧failRun被generation/status guard拒绝。 |
| 原期限、晚回调与停止确认 | wechat-native-collector.ts:85、95–99、160–162 固定原startedAt+30分钟；不因恢复/renew重新计算。:188–203独立取消/期限观察，:214–231保TASK_TIMEOUT/CANCELLED主因；未实停通过独立stopUnconfirmed保留，不在finally假释放。callback在:149–155、:204及:235封闭；worker:193–196在下载后再次核signal。 |
| 心跳和慢关闭 | collector:105–117以上一次renew结束后再setTimeout串行续租，不因callbackFailure在关闭期间误abort。test:246–253明确解析失败后实停超过20秒仍续租、保REPORT_PARSE_FAILED主因；:184–204明确driver卡close到原deadline仍返回pending stop并拒晚页；:206–242覆盖串行和真正租约失败。宿主停止重试经persistence-client.ts:4684–4699保留，资源释放只由真实onStopped证明。 |
| 全报表、部分成功与转组 | 真正执行器逐报告提交，全部2/3kind齐全且实停后才提交终页；public integration:99–114使用真实parser和DB，坏第三份保前两份。:135–142通过真实账号组service拒queued/running转组，取消原run后才可按新preview转组；未用手改数据库冒充这项公共保护。 |

既有证据核对：native-final-regression.log的原始SHA与gate-observations.json一致，日志为4文件47 PASS；public-transfer-green.log的原始SHA一致，日志为2 PASS/12筛选SKIP。backend-final-gate-typecheck.log的SHA也与索引一致。测试代码包含以上断言，但本代理未重新执行这些命令；其余24worker、57页面、59兼容、16迁移与四包类型结果来自已有实施记录，不冒称本次亲自重跑。

实际未验证：默认createWechatBrowserSource()未注入stable identity/date/total witness，configured=false，两微信能力继续unavailable；源码disabled行为不等于真实微信可用。普通账号稳定字段、日期选择实际DOM/响应witness、产品隔离profile真人扫码、五个私人实文件当前解析、1366/1024真实Chrome操作与视觉Gate仍缺。合成浏览器/profile及合成BIFF/HTML/CSV公共链不能代替这些证据。全局contract/timeout/reconcile失败按实施记录保留，本审不消除或代签。

当前字节SHA核对（“一致”是与已有gate-observations.source_sha256一致）：

| 文件 | 当前SHA256 | 证据索引比对 |
|---|---|---|
| backend/src/modules/platform-collection/platform-collection.service.ts | 1c234861a4316a6bd6e9d375c6af4af43447b7c8f7131c5950d3d456a2f35ef9 | 一致 |
| backend/src/schema/platform-collection.ts | 2ee39aba4369892075c7c23d154f6f6c3fc0bc01d5b56743400b8a1c9a83a74e | 该证据索引未列，已独立读取当前字节 |
| backend/drizzle/0131_platform_native_reports.sql | 36a411fb6ee7a77923090fa346ed768365fa548746fa62d4735f561bf0a5e84f | 一致 |
| backend/src/application/collection/wechat-native-collector.ts | b9fa83367356c6a5e3d0ae2e188c4290eb9058ad280b562939ea4b03d808839e | 一致 |
| ai-worker/src/runtime/platform/wechat-browser-source.ts | 13b8006988bd09ac05c8e6b7d7ba6fa3b44eae7627e147a2b4d136e2e6dc7e48 | 一致 |
| frontend/src/features/platform-account/native-report-panel.tsx | c79e758d4821cfb1e01f407999e83d75f84c71ac234e85b08853ee52764d2bec | 一致 |
| frontend/src/server/persistence-client.ts | 2350fef8ab9056f538b42fa747238b92e9c6febb58f843f8d2d997605bcde15e | 一致 |
| backend/src/modules/platform-collection/platform-native-reports.integration.test.ts | 921df76da8eea73b310acd33876c1ce5cdfef84a74125a9d6e1626ba27864919 | 一致 |
| backend/src/application/collection/wechat-native-collector.test.ts | eddb707930046b1f10d8cf2a4ae60801ca756a9d3424926f44058d120ff978ea | 该证据索引未列，已独立读取当前字节 |
