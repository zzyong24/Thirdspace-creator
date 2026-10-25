# CreatorOS 任务看板(BACKLOG)

> **单一执行真相。每个会话必读(SessionStart hook 自动注入)。** 规则见 `CLAUDE.md` 的「任务流程铁律」。
> 状态:📋 待办 · 🔨 进行中 · ✅ 完成 · ⏸️ 搁置 · ⛔ SPEC 审核 FAIL(没过审不准开工)。
> 读取顺序:**本看板 → 任务引用的 SPEC → 代码**。
> 铁律:需求即任务(提了就建);开工从看板顶取;做完改状态+提交;**禁止 P0/P1 分级、禁止多阶段执行**,任务清楚即起 Workflow/并行 subagent 一次做完。

## 🔨 进行中 / 📋 待办(按执行顺序,从上往下取)

|ID|任务|状态|审核|验收|文档|一句话|
|---|---|---|---|---|---|---|
|T-1416|修复真实浏览器验收的过时页面断言|✅|PASS[REV:47d4fbfd6861]|—|[SPEC](docs/features/t1416-browser-visible-document-assertions.md)|核对可见正文及来源，保留真实浏览器、账号隔离与全部原断言。|
|T-1415|收口恢复验收后的只读Stop与两份宪法审核|✅|PASS[REV:abe1e1aaf662]|—|[SPEC](docs/features/t1415-resumed-verification-control.md)|保留日常只读Stop，真实重审规则恢复导致过期的T915/T859，完整验收不降级。|
|T-1414|恢复关键链路可用性规则摘要|✅|PASS[REV:19fcdb3c4a1f]|—|[SPEC](docs/features/t1414-critical-path-rule-summary.md)|恢复规则摘要漏掉的既有安全降级与完整回归要求，保留原LED043测试。|
|T-1413|恢复重构后六项lesson正式链语义覆盖|⏸️|PASS[REV:2a5f6be66c40]|—|[SPEC](docs/features/t1413-lesson-semantic-coverage.md)|修复3个已删除测试文件的6处守卫引用；补齐当前链语义与严格封面参考约束，官方图片恢复须先证明幂等资格。|
|T-1412|修复完整对账的执行预算与测试隔离|✅|PASS[REV:61ef55ddadbf]|—|[SPEC](docs/features/t1412-full-reconcile-isolation.md)|处理已查明的 lesson 执行配置缺失、旧固定端口守卫与 CLI 测试副作用；保持原验收强度。|
|T-1411|修复文本连接测试鉴权丢失与结果说明|✅|PASS[REV:40d357fc2e44]|—|[SPEC](docs/features/t1411-model-probe-auth-parity.md)|[D]|
|T-1410|修复历史审核证据与看板对账|✅|PASS[REV:568fd798a094]|—|[SPEC](docs/features/t1410-review-evidence-reconciliation.md)|[D]|
|T-1409|修复官方Pi支付拒绝的安全诊断|✅|PASS[REV:04839f8bcbce]|—|[SPEC](docs/features/t1409-managed-pi-payment-diagnostics.md)|[D]|
|T-1408|修复官方Pi与未通过验收并在通过后推送|⏸️|PASS[REV:2a4274de9f10]|待验|[SPEC](docs/features/t1408-official-pi-acceptance-and-push.md)|[D]|
|T-1407|整理现有修复、安装复验并准备合并推送|⏸️|PASS[REV:4538b35201d4]|待验|[SPEC](docs/features/t1407-local-integration-install-merge-preparation.md)|[D]|
|T-1405|修复CLI真实对话的组上下文、模型错误与开销|🔨|PASS[REV:2537258f8796]|—|[SPEC](docs/features/t1405-chat-model-combination-fixes.md)|[D]|
|T-1403|沿用已确认账号并实测CLI对话组合|⏸️|—|待验|[SPEC](docs/features/t1403-cli-chat-combination-acceptance.md)|[D]|
|T-1402|历史激活码无感升级模型权益与原授权恢复|🔨|PASS[REV:523d1050324a]|待验|[SPEC](docs/features/t1402-legacy-license-one-click-upgrade.md)|[D]|
|T-1401|接入试用设备一次模型权益与明确恢复|🔨|—|待验|[SPEC](docs/features/t1401-trial-device-model-benefits.md)|[D]|
|T-1400|修复选题 Copilot 长候选采纳区裁切|⏸️|—|待验|[SPEC](docs/features/t1400-topic-adoption-scroll.md)|[D]|
|T-1399|固定侧栏 AI 助手页脚与收拢入口|⏸️|—|待验|[SPEC](docs/features/t1399-sidebar-assistant-footer.md)|[D]|
|T-1398|修复 Copilot DeepSeek 强制工具请求、失败重试与错误诊断丢失|🔨 待办|—|待验|[SPEC](docs/features/t1398-copilot-deepseek-failure.md)|[D]|
|T-1397|修复main Verify并核实已知失败|⏸️|—|—|[SPEC](docs/features/t1397-verify-main-green.md)|[D]|
|T-1380|解除协作者本地Mac完整构建对作者私钥的依赖|⏸️|PASS[REV:fade0e6a2c0c]|—|[SPEC](docs/features/t1380-independent-local-mac-build.md)|[D]|
|T-1378|诊断每日观测HTTP422与接收端固定清单兼容|🔨|PASS[REV:48c6e24fa806]|—|[SPEC](docs/features/t1378-observability-http-422-registry-diagnosis.md)|[D]|
|T-1385|修复 Verify 的 Node 堆内存耗尽|🔨|—|—|[SPEC](docs/features/t1385-verify-ci-memory.md)|[D]|
|T-1393|按真实密度重排内容雷达三栏|⏸️|—|—|[SPEC](docs/features/ui-fixes-2026-10-21/T-1384.md)|[D]|
|T-1392|重新规划内容雷达三栏与来源操作布局|⏸️|—|—|[SPEC](docs/features/ui-fixes-2026-10-21/T-1383.md)|[D]|
|T-1387|统一主导航宽度并恢复选题页1440px完整布局|⏸️|—|—|[SPEC](docs/features/ui-fixes-2026-10-21/T-1378.md)|[D]|
|T-1388|修复项目页首开自动滚动到口播脚本|⏸️|—|—|[SPEC](docs/features/ui-fixes-2026-10-21/T-1379.md)|[D]|
|T-1389|补全选题来源中文标签与未知值兜底|⏸️|—|—|[SPEC](docs/features/ui-fixes-2026-10-21/T-1380.md)|[D]|
|T-1390|移除雷达作品卡片重复的升级为项目按钮|⏸️|—|—|[SPEC](docs/features/ui-fixes-2026-10-21/T-1381.md)|[D]|
|T-1391|容错雷达作品未知转写状态避免整页崩溃|⏸️|—|—|[SPEC](docs/features/ui-fixes-2026-10-21/T-1382.md)|[D]|
|T-1374|查明并恢复所有已绑定媒体的既有数据展示|⏸️|PASS[REV:16648a3ea984]|待验|[SPEC](docs/features/t1374-all-bound-platform-data-recovery.md)|[D]|
|T-1369|修复首页平台筛选后的连续侧栏导航卡死|🔨|PASS[REV:01444fedd32f]|待验|[SPEC](docs/features/t1369-dashboard-filter-sidebar-navigation.md)|[D]|
|T-1373|核对完整对账中真实CLI的用户目录与联网副作用|📋|待审|待验|[SPEC](docs/features/t1373-reconcile-cli-side-effect-isolation.md)|[D]|
|T-1367|恢复视频号折叠导航下的报表入口|⏸️|PASS[REV:c7a98f074848]|待验|[SPEC](docs/features/t1367-wechat-video-collapsed-navigation-entry.md)|[D]|
|T-1366|核对导航诊断新增的旧宽路径收据失配|📋|待审|待验|[SPEC](docs/features/t1366-navigation-diagnosis-wide-receipt-drift.md)|[D]|
|T-1360|核对本批绑定首页与切组变更导致的旧宽路径收据失配|📋|待审|待验|[SPEC](docs/features/t1360-current-binding-dashboard-receipt-drift.md)|[D]|
|T-1358|核对隔离首页首次装配与组读取长耗时|📋|待审|待验|[SPEC](docs/features/t1358-unselected-home-readiness-latency.md)|[D]|
|T-1353|核对本轮工作区与日报接线导致的旧宽路径验收收据失配|📋|待审|待验|[SPEC](docs/features/t1353-current-batch-legacy-receipt-drift.md)|[D]|
|T-1351|核对账号管理进入组与驻留视频宿主的离开保护边界|📋|待审|待验|[SPEC](docs/features/t1351-manager-video-leave-guard-risk.md)|[D]|
|T-1349|修复项目列表窄桌面首列标题归零与右侧动作裁切|📋|待审|待验|[SPEC](docs/features/t1349-project-list-responsive-columns.md)|[D]|
|T-1336|核对校准结果到经验置信度的既有反馈预留|📋|待审|待验|[SPEC](docs/features/t1336-calibration-learning-confidence-bridge-observation.md)|[D]|
|T-1333|明确结构表脚本历史来源读取兼容|📋|待审|待验|[SPEC](docs/features/t1333-structured-script-history-source-compatibility.md)|[D]|
|T-1321|诊断图文重新组织与手动校正未形成可采纳候选|⏸️|PASS[REV:271af53ebf46]|待验|[SPEC](docs/features/t1321-graphic-reorganization-candidate-diagnosis.md)|[D]|
|T-1300|恢复Codex各能力可用性并落实已定位性能优化|⏸️|PASS[REV:6094ba8d7ed5]|待验|[SPEC](docs/features/t1300-codex-functionality-and-performance.md)|[D]|
|T-1297|修复原生时间轴缩放滑块被全局方向键拦截|📋|待审|待验|[SPEC](docs/verification/t1296/REPORT.md)|[D]|
|T-1292|核对合并后的全局对账失败并逐项归因|📋|待审|待验|[SPEC](docs/features/t1292-post-integration-global-reconcile-findings.md)|[D]|
|T-1291|核对旧原生编辑器验证器与当前715源码库存|📋|待审|待验|[SPEC](docs/features/t1291-legacy-native-verifier-source-inventory.md)|[D]|
|T-1289|修复原生构建清单随解包目录深度变化|🔨|PASS[REV:92eba9d78497]|待验|[SPEC](docs/features/t1289-native-build-graph-virtual-module.md)|[D]|
|T-1288|校准合并剪辑后的两个契约测试库存|🔨|PASS[REV:cf5a6070b2b5]|待验|[SPEC](docs/features/t1288-integrated-editing-contract-inventory.md)|[D]|
|T-1287|闭合Growth全量回归的旧夹具与隔离缺项|📋|待审|待验|[SPEC](docs/features/t1287-growth-full-regression-fixtures.md)|[D]|
|T-1286|校准模型来源接线后的旧前端集成夹具|🔨|PASS[REV:be715ef3b46d]|待验|[SPEC](docs/features/t1286-model-routing-frontend-fixtures.md)|[D]|
|T-1283|核对Codex账号工作区路由预检拒绝并恢复粗剪|📋|待审|—|[SPEC](docs/features/t1283-codex-account-routing-preflight.md)|[D]|
|T-1279|接入模型来源新迁移的真实数据库谱系护栏|🔨|PASS[REV:3056f3673e0a]|待验|[SPEC](docs/features/t1279-model-routing-migration-lineage.md)|[D]|
|T-1278|统一激活授权并允许官方、自配和本地Codex按能力组合|🔨|PASS[REV:c23accf0a926]|待验|[SPEC](docs/features/t1278-unified-license-capability-routing.md)|[D]|
|T-1276|修复原片准备事务内根设置连接自等待|⏸️|PASS[REV:f677c9cdf3ed]|待验|[SPEC](docs/features/t1276-production-source-transaction-runtime.md)|[D]|
|T-1275|排查剪辑验收隔离服务冷编译与数据库初始化超时|⏸️|—|待验|[SPEC](docs/features/t1275-editing-verification-runtime-timeouts.md)|[D]|
|T-1274|参考ChatCut可复用模块重设计CreatorOS剪辑工作区与自然语言剪辑链路|⏸️|PASS[REV:55a3f14a70a5]|待验|[SPEC](docs/features/t1274-chatcut-editing-redesign.md)|[D]|
|T-1277|核对原生AAC首尾有效样本与音画对齐|📋|—|待验|[SPEC](docs/features/t1277-native-aac-valid-samples.md)|[D]|
|T-1273|CreatorOS反逆向加固严格零性能损耗|🔨|PASS[REV:f993e9496349]|待验|[SPEC](docs/features/t1273-release-anti-reverse-hardening.md)|[D]|
|T-1271|CreatorOS Codex调用不保存个人历史会话|🔨 待办|PASS[REV:b5247eee4711]|—|[SPEC](docs/features/t1271-codex-ephemeral-sessions.md)|[D]|
|T-1265|修复本地Codex结构化输出Schema适配导致真实400|🔨 待办|PASS[REV:54a830e5bcfc]|待验|[SPEC](docs/features/t1265-codex-structured-output-schema-compatibility.md)|[D]|
|T-1264|修复协议账本读取前Next元数据恢复顺序|🔨 待办|PASS[REV:363fd9378c93]|待验|[SPEC](docs/features/t1264-protocol-ledger-next-closure-order.md)|[D]|
|T-1263|修复协议验收替身与隔离临时根的归属校验冲突|🔨 待办|PASS[REV:b4fda4422df6]|待验|[SPEC](docs/features/t1263-protocol-fixture-owned-temp-root.md)|[D]|
|T-1272|校准新增观测后的前端回归夹具与迁移库存|🔨|PASS[REV:57f7140fcca6]|待验|[SPEC](docs/features/t1272-current-observability-frontend-test-fixtures.md)|[D]|
|T-1270|校准当前观测迁移后的原回归库存|🔨|PASS[REV:ed99956c0313]|待验|[SPEC](docs/features/t1270-current-observability-migration-test-inventory.md)|[D]|
|T-1268|闭合集成契约测试库存与手工保存类型|🔨|PASS[REV:b9d6a2958cc7]|待验|[SPEC](docs/features/t1268-integrated-contract-inventory-and-manual-save-test.md)|[D]|
|T-1267|校准Pi公共聊天验收能力键与HTTP最终审计|🔨|PASS[REV:cc01d69f8185]|待验|[SPEC](docs/features/t1267-pi-public-fixture-capability-and-http-audit.md)|[D]|
|T-1266|核对并修复设置偏好首载时ASR菜单不可达|🔨 待办|PASS[REV:bda5b2a67bbd]|待验|[SPEC](docs/features/t1266-asr-menu-preference-layout-race.md)|[D]|
|T-1269|补齐原持久分场失败的可读诊断与原任务重试验收|🔨|PASS[REV:03376b43b303]|待验|[SPEC](docs/features/t1269-managed-video-failure-diagnostic.md)|[D]|
|T-1261|修复开发包验收暴露的运行时缺陷与用例合同|🔨 待办|PASS[REV:cd5f6ec85eda]|待验|[SPEC](docs/features/t1261-runtime-acceptance-defect-closure.md)|[D]|
|T-1260|核对T1255审核绑定生成PROJECT造成收据漂移|📋|—|—|[SPEC](docs/features/t1260-generated-project-review-binding.md)|[D]|
|T-1259|排查用户1.12版扫码绑定与配置同步异常并修复确认缺陷|✅ 待办|—|—|[SPEC](docs/features/t1259-user-binding-config-repair.md)|[D]|
|T-1258|分析用户2026-10-12四份加密运行日志异常|✅ 待办|—|—|[SPEC](docs/features/t1258-user-log-diagnosis.md)|[D]|
|T-1257|将当前已安装版本制作本地签名安装包|✅ 待办|—|—|[SPEC](docs/features/t1257-installed-local-signed-installer.md)|[D]|
|T-1255|加密日志直传Growth、异常采集与运行指标观测|🔨 待办|PASS[REV:ec21be841d64]|待验|[SPEC](docs/features/t1255-reporting-full-delivery.md) · [SPEC](docs/features/t1255-observability-research.md)|[D]|
|T-1256|修复Doocs静态原适配三处无用绑定编译失败|🔨 待办|PASS[REV:b3d116e19a48]|待验|[SPEC](docs/features/t1256-doocs-static-unused-bindings-build-closure.md)|[D]|
|T-1254|闭合内置Doocs两份真实请求30秒默认预算与源码交付一致性|🔨 待办|PASS[REV:1ebe2f90de0b]|待验|[SPEC](docs/features/t1254-doocs-request-budget-and-source-closure.md)|[D]|
|T-1253|闭合原Worker夹具可信回执与未知恢复验收|🔨 待办|PASS[REV:e890e7d4ffac]|待验|[SPEC](docs/features/t1253-worker-fixture-receipt-and-unknown-closure.md)|[D]|
|T-1246|整合完成会话并打开发包及浏览器和App逐项验收|🔨 待办|PASS[REV:883f7fe733ba]|待验|[SPEC](docs/features/t1246-integrated-dev-package-acceptance.md)|[D]|
|T-1252|闭合CLI/MCP HTTP默认300秒早于合法原生RPC的消费者预算|🔨 待办|PASS[REV:5ceaed23e00c]|待验|[SPEC](docs/features/t1252-cli-http-consumer-budget-closure.md)|[D]|
|T-1250|闭合真实短执行预算与静态消费者误判|🔨 待办|PASS[REV:73326e8df3e3]|待验|[SPEC](docs/features/t1250-positive-timeout-consumer-closure.md)|[D]|
|T-1251|保留结构化生成可信失败状态并校准原受控崩溃验收|🔨 待办|PASS[REV:41b45f1c67d4]|待验|[SPEC](docs/features/t1251-chat-generation-failure-and-fixture-closure.md)|[D]|
|T-1249|校准持久聊天原八例的当前受控回执合同|🔨 待办|PASS[REV:19cbaf3743b6]|—|[SPEC](docs/features/t1249-durable-chat-current-receipts.md)|[D]|
|T-1247|修复超时门完整Git库存读取缓冲区溢出|🔨 待办|PASS[REV:b75c6d75921d]|—|[SPEC](docs/features/t1247-timeout-git-inventory-buffer.md)|[D]|
|T-1248|恢复已知旧冻结系统候选工具的严格合同兼容|🔨 待办|PASS[REV:2d9887301cb3]|—|[SPEC](docs/features/t1248-frozen-system-action-compatibility.md)|[D]|
|T-1238|本地Codex统一执行文本与生图并免独立模型配置|🔨 待办|PASS[REV:6b70a2a85595]|待验|[SPEC](docs/features/t1238-codex-unified-text-image-engine.md)|[D]|
|T-1245|修复自动化窄窗口筛选挤出与任务查看不便|🔨 待办|—|待验|[SPEC](docs/features/t1245-automations-narrow-layout.md)|[D]|
|T-1244|验收自动化立即运行的准入与授权等待|🔨 待办|—|待验|[SPEC](docs/features/t1244-automation-run-now-login-wait.md)|[D]|
|T-1243|复验项目稿面视频素材的真实预览|🔨 待办|—|待验|[SPEC](docs/features/t1243-draft-video-preview-recheck.md)|[D]|
|T-1239|验证复盘经验采纳与知识库回流并核候选裁决可见性|🔨 待办|—|待验|[SPEC](docs/features/t1239-review-learning-public-acceptance.md)|[D]|
|T-1241|排查复盘页浏览器验收时开发编译器崩溃|🔨 待办|—|待验|[SPEC](docs/features/t1241-review-dev-compiler-panic.md)|[D]|
|T-1242|核对复盘刷新后纯组账号镜像的测试断言|🔨 待办|—|待验|[SPEC](docs/features/t1242-review-pure-group-cookie-assertion.md)|[D]|
|T-1240|复验素材选择器全库分页与真实照片操作|🔨 待办|—|待验|[SPEC](docs/features/t1240-asset-picker-public-recheck.md)|[D]|
|T-1227|实际核验本地执行引擎全功能及免模型配置落地情况|⏸️ 待办|—|—|[SPEC](docs/features/t1227-local-engine-full-capability-verification.md)|[D]|
|T-1228|核对审核和发布物料子任务的父执行partial结果|📋 待办|—|—|[SPEC](docs/features/t1228-chat-child-partial-verification.md)|[D]|
|T-1229|核对内容雷达选题生成持续无效输出及检查点恢复|🔨 待办|—|—|[SPEC](docs/features/t1229-radar-topic-output-recovery-diagnosis.md)|[D]|
|T-1231|核对雷达升级项目后原账号读取404的范围分歧|🔨 待办|—|待验|[SPEC](docs/features/t1231-radar-promoted-project-scope.md)|[D]|
|T-1233|校准雷达正文模型替身并验证正文真实贯通|🔨 待办|—|待验|[SPEC](docs/features/t1233-radar-body-fixture-protocol.md)|[D]|
|T-1232|验证设置对话框分类交互与公开读回持久性|🔨 待办|—|待验|[SPEC](docs/features/t1232-settings-dialog-public-verification.md)|[D]|
|T-1235|修复外观密度关闭设置后刷新未恢复|🔨 待办|—|待验|[SPEC](docs/features/t1235-density-reload-persistence.md)|[D]|
|T-1236|修复模型保存并测试成功后界面结果丢失|🔨 待办|—|待验|[SPEC](docs/features/t1236-model-probe-visible-result.md)|[D]|
|T-1237|修复设置窄窗口分类栏挤压内容与裁切|🔨 待办|—|待验|[SPEC](docs/features/t1237-settings-narrow-layout.md)|[D]|
|T-1234|验证账号组下Skill定制按钮的真实可用性|🔨 待办|—|待验|[SPEC](docs/features/t1234-group-skill-customize-availability.md)|[D]|
|T-1230|修正素材空态仍宣称按抖音号隔离的旧文案|🔨 待办|—|待验|[SPEC](docs/features/t1230-assets-empty-workspace-copy.md)|[D]|
|T-1226|补齐浏览器上传验收媒体目录隔离|🔨 待办|—|—|[SPEC](docs/features/t1226-playwright-media-root-isolation.md)|[D]|
|T-1225|补齐素材中心有数据画廊与选择详情的真实上传夹具|🔨 待办|—|—|[SPEC](docs/features/t1225-assets-gallery-real-fixtures.md)|[D]|
|T-1224|校准内容雷达公共旅程的短测试预算与证据输出|🔨 待办|—|—|[SPEC](docs/features/t1224-radar-e2e-budget-evidence.md)|[D]|
|T-1223|修复截图总览把历史运行记录当用例数及重复锚点|🔨 待办|—|—|[SPEC](docs/features/t1223-verification-gallery-record-identity.md)|[D]|
|T-1222|核对文章图文编导的空态与功能指引脱离当前稿件|📋 待办|—|待验|[SPEC](docs/features/t1222-director-context-guidance.md)|[D]|
|T-1221|校准双工作区切换端到端旧账号选择器|🔨 待办|—|—|[SPEC](docs/features/t1221-group-switch-e2e.md)|[D]|
|T-1217|修复内容雷达来源任务在旧账号和冻结组范围间卡住|🔨 待办|—|—|[SPEC](docs/features/t1217-source-sync-workspace.md)|[D]|
|T-1207|用 Playwright/App 自动化对全功能建立逐项验收并留图|🔨 待办|—|待验|[SPEC](docs/features/t1207-full-feature-acceptance.md)|[D]|
|T-1208|复核T-1207暴露的浏览器功能失败并修复确认缺陷|🔨 待办|—|待验|[SPEC](docs/features/t1208-t1207-e2e-failure-triage.md)|[D]|
|T-1199|查明并修复账号组内其他已绑定媒体定时任务不可见|🔨 待办|—|待验|[SPEC](docs/features/t1199-bound-platform-scheduled-visibility.md)|[D]|
|T-1200|整体重设计知识库工作区并统一新旧操作入口|🔨 待办|—|待验|[SPEC](docs/features/t1200-knowledge-workspace-redesign.md)|[D]|
|T-1201|核对知识图谱错误提示回归的旧原始异常断言|🔨 待办|—|—|[SPEC](docs/features/t1201-knowledge-graph-error-contract.md)|[D]|
|T-1202|核对自动化复杂排期编辑的旧术语断言|🔨 待办|—|—|[SPEC](docs/features/t1202-automation-cadence-error-contract.md)|[D]|
|T-1203|消除自动化既有React编译与effect静态检查欠债|📋 待办|—|待验|[SPEC](docs/features/t1203-automation-react-lint-debt.md)|[D]|
|T-1204|核对本轮全局对账29项失败及新增触发项|🔨 待办|—|—|[SPEC](docs/features/t1204-current-reconcile-failures.md)|[D]|
|T-1197|核对旧外部MCP窄权限配对来源与当前账号组兼容|📋 待办|—|待验|[SPEC](docs/features/t1197-external-agent-pairing-source-convergence.md)|[D]|
|T-1196|排查新安装版启动配置同步502与运行摘要拒绝|📋 待办|—|—|[SPEC](docs/features/t1196-installed-config-sync-502.md)|[D]|
|T-1193|核对结果待确认时的重复发送暗示与恢复状态可读性|📋 待办|—|—|[SPEC](docs/features/t1193-copilot-unknown-request-presentation.md)|[D]|
|T-1192|核对作品精调公共链的消息结果断言|📋 待办|—|—|[SPEC](docs/features/t1192-work-editor-message-outcome-diagnosis.md)|[D]|
|T-1191|核对编导发送前准备失败与恢复入口|🔨 待办|PASS[REV:ad518ff0cf03]|—|[SPEC](docs/features/t1191-pre-submit-copilot-recovery-diagnosis.md)|[D]|
|T-1189|核对聊天子进程状态与取消的七项当前失败|📋 待办|—|—|[SPEC](docs/features/t1189-chat-worker-entry-current-state-diagnosis.md)|[D]|
|T-1188|核对雷达活动任务期间的采纳保护断言|📋 待办|—|—|[SPEC](docs/features/t1188-radar-active-task-adoption-test-diagnosis.md)|[D]|
|T-1182|区分隐藏文件注入与真实上传按钮的刷新等待|🔨 待办|PASS[REV:456a0d53bb41]|—|[SPEC](docs/features/t1182-real-upload-button-control.md) · [SPEC](docs/research/t1182-upload-ui-refresh.md)|[D]|
|T-1181|核对真实素材上传成功后视频列表不可见|⏸️ 待办|PASS[REV:f8b0038f725b]|—|[SPEC](docs/features/t1181-uploaded-video-list-visibility.md)|[D]|
|T-1180|核对真实上传探针的File请求体字节测量失败|🔨 待办|PASS[REV:36946ee35804]|—|[SPEC](docs/features/t1180-upload-probe-file-bytes.md)|[D]|
|T-1179|核对素材上传回归未触发完成接口的实际原因|🔨 待办|PASS[REV:13d0145a7fcd]|—|[SPEC](docs/features/t1179-asset-upload-regression-diagnosis.md)|[D]|
|T-1171|无损压缩当前超限任务看板|🔨 待办|—|—|[SPEC](docs/features/t1171-current-backlog-compaction.md)|[D]|
|T-1159|在当前main整合微信原生报表、绑定归属与调度闭包|🔨 待办|PASS[REV:914cad514a19]|待验|[SPEC](docs/features/t1159-current-wechat-native-report-integration.md) · [SPEC](docs/verification/t1159/PAGE_SPEC.md)|[D]|
|T-1155|核对浏览器导航时本地服务连接中断日志|⏸️ 待办|—|—|[SPEC](docs/features/t1155-browser-navigation-connection-abort.md)|[D]|
|T-1149|在当前main整合封面用途与图片页组统一画幅|🔨 待办|PASS[REV:0a91f954eb8f]|待验|[SPEC](docs/features/t1149-current-cover-group-aspect.md)|[D]|
|T-1144|核对素材旅程完成后测试进程未退出|🔨 待办|—|—|[SPEC](docs/features/t1144-picker-worker-cleanup.md)|[D]|
|T-1135|核对安装版粗剪成片解码画面比原素材偏暗|⏸️ 待办|—|—|[SPEC](docs/features/t1135-installed-render-color-fidelity.md)|[D]|
|T-1118|核对本机验收原始日志目录消失|📋 待办|—|—|[SPEC](docs/features/t1118-verification-directory-disappearance.md)|[D]|
|T-1116|核对稿件并发保存回归在本轮完整对账中的再次失败|🔨 待办|—|—|[SPEC](docs/features/t1116-artifact-cas-global-regression.md)|[D]|
|T-1101|修复画布素材选择、生成防重复与连线透传，整合三平台扫码绑定及错峰采集|🔨|PASS[REV:146ff2046c2c]|待验|[SPEC](docs/features/t1101-canvas-binding-collection.md)|[D]|
|T-1101-global-gates|核对独立main工作树全局对账失败及历史收据漂移|📋 待办|—|—|[SPEC](docs/verification/t1101/global-gates.md)|[D]|
|T-1109|修复超时验证入口默认10秒初始化导致原测试未执行|🔨|PASS[REV:a85dda74b249]|待验|[SPEC](docs/features/t1109-timeout-verification-default-budget.md)|[D]|
|T-1110|核对浏览器验收开发资源ChunkLoadError与测试状态准备竞态|📋 待办|—|—|[SPEC](docs/features/t1110-browser-development-resource-diagnosis.md)|[D]|
|T-1107|核对平台公共接口新增操作与发布归属回归失败|🔨|PASS[REV:9c9181db2c1c]|待验|[SPEC](docs/features/t1107-platform-public-regression.md)|[D]|
|T-1105|修复共享资源面板失效读取后持续加载|🔨|PASS[REV:675552d2d02f]|待验|[SPEC](docs/features/t1105-shared-resource-loading.md) · [SPEC](docs/features/t1105-shared-resource-loading-diagnosis.md)|[D]|
|T-1103|排查Pi联合提案反复遗漏完整图文参数|🔨|—|—|[SPEC](docs/features/t1103-pi-joint-argument-diagnosis.md) [SPEC](BACKLOG-details.md#t-1103)|[D]|
|T-1102|排查并恢复本地安装首次运行时展开失败|🔨|—|—|[SPEC](docs/features/t1102-installed-runtime-extraction.md) [SPEC](BACKLOG-details.md#t-1102)|[D]|
|T-1094|修复部分完成AI任务公开查询状态合同缺口|🔨|PASS[REV:5d2c91b81b45]|—|[SPEC](docs/features/t1094-public-partial-task-status.md) · [SPEC](docs/verification/t1093/FOLLOWUP_DIAGNOSIS.md) [SPEC](BACKLOG-details.md#t-1094)|[D]|
|T-1096|核对文章工作流与任务父归属旧回归断言的实际漂移|📋|—|—|[SPEC](docs/verification/t1094/RELATED_BASELINE_DIAGNOSIS.md)|[D]|
|T-1099|修复工具明确业务拒绝回执缺失与末次失败被算成功|⏸️|PASS[REV:b5aa667d8485]|—|[SPEC](docs/features/t1099-tool-domain-recovery.md) · [SPEC](docs/features/t1099-tool-domain-recovery-diagnosis.md) [SPEC](BACKLOG-details.md#t-1099)|[D]|
|T-1098|核对安装重启后的定期同步失败与采集未启动|📋|—|—|[SPEC](docs/features/t1098-installed-scheduled-failure-diagnosis.md)|[D]|
|T-1097|修复文章编导参考资料与候选审读保护缺口|🔨|PASS[REV:3f5ea43b69f5]|—|[SPEC](docs/features/t1097-article-director-options-diagnosis.md)|[D]|
|T-1095|验证Pi联合创作必填nullable字段遵循与原任务恢复方法|⏸️|PASS[REV:b3b9dda4753e]|—|[SPEC](docs/features/t1095-tool-parameter-recovery.md) · [SPEC](docs/verification/t1093/FOLLOWUP_DIAGNOSIS.md) [SPEC](BACKLOG-details.md#t-1095)|[D]|
|T-1093|校准编导数字参数、联合首次读取与真实候选失败恢复|🔨|PASS[REV:267bf399a6b1]|—|[SPEC](docs/features/t1093-director-method-recovery.md)|[D]|
|T-1091|补齐公开编导消息的Codex选择与文章图文视频目标定位并安装验收|🔨|PASS[REV:dcd0b932fca7]|—|[SPEC](docs/features/t1091-public-director-context.md) [SPEC](BACKLOG-details.md#t-1091)|[D]|
|T-1092|核对联合创作旧集成测试未解包可信回执的契约漂移|📋|—|—|[SPEC](docs/verification/t1091/CREATION_BASELINE_DIAGNOSIS.md)|[D]|
|T-1072-owned-devices|配合 Growth 轻量手机号账号与正式双设备，补齐新电脑连接与已激活账号入口|🔨 待办|PASS[REV:eb02b3e28c7b]|待验|[SPEC](docs/features/t1072-owned-devices.md)|[D]|
|T-1066-timeout-policy|全系统统一两分钟超时下限、嵌套预算与Skill防复发|⏸️ 待办|PASS[REV:13310516269c]|待验|[SPEC](docs/features/t1066-timeout-policy.md) [SPEC](BACKLOG-details.md#t-1066-timeout-policy)|[D]|
|T-1067-skill-verification|清理通用产品流程Skill既有公开分发校验债务|📋 待办|—|待验|[SPEC](docs/verification/t1066/SKILL_VERIFICATION.md) [SPEC](BACKLOG-details.md#t-1067-skill-verification)|[D]|
|T-1018|清理本轮测试暴露的全局类型与边界欠债|📋 待办|—|待验|[SPEC](docs/verification/t1017-rewrite-first.md) [SPEC](BACKLOG-details.md#t-1018) [SPEC](BACKLOG-details.md#t1173-t1018-global-debt-history)|[D]|
|T-1083|复核流程升级后的旧任务写集通配符兼容缺口|📋 待办|—|—|[SPEC](docs/verification/t1080/post-package-progress-block-failure.json)|[D]|
|T-1082|复核合并来源任务的当前评审与UI验收记录归属|📋 待办|—|—|[SPEC](docs/features/t1082-source-receipt-revalidation.md)|[D]|
|T-1081|核对整合后原主线的14处短执行预算与超时扫描误报|📋 待办|—|待验|[SPEC](docs/verification/t1080/timeout-static-dispositions-corrected.json)|[D]|
|T-1026|补齐新增 Agent 功能的公开 CLI 并逐项验收安装版|🔨|—|—|[SPEC](docs/features/t1026-agent-cli-acceptance.md)|[D]|
|T-1027|修复评论采集完成统计与失败诊断|🔨|—|—|[SPEC](docs/features/t1027-comment-collection-evidence.md)|[D]|
|T-1025|重新核验 constitution 变更后的历史评审与前端验收回执|📋|—|—|[SPEC](docs/features/t1025-receipt-drift-revalidation.md)|[D]|
|T-1077|修复采纳与作品素材读取的项目返回值|🔨 待办|PASS[REV:a36209c19783]|待验|[SPEC](docs/features/t1077-material-parent-port.md) [SPEC](BACKLOG-details.md#t-1077)|[D]|
|T-1075|修复安装验收发现的素材标签观察与纯组生图证明|🔨 待办|PASS[REV:73a6052db08f]|—|[SPEC](docs/features/t1075-installed-ai-observation-gaps.md) [SPEC](BACKLOG-details.md#t-1075)|[D]|
|T-1074|全面验收与补齐AI助手系统操作、工具开放性和功能提示词|🔨 待办|PASS[REV:b19144c34cab]|待验|[SPEC](docs/features/t1074-ai-system-operations.md) [SPEC](BACKLOG-details.md#t-1074)|[D]|
|T-1071|修复账号绑定和页面Tab切换卡顿|🔨 待办|PASS[REV:a53e25bf48df]|待验|[SPEC](docs/features/t1071-navigation-latency.md) [SPEC](BACKLOG-details.md#t-1071)|[D]|
|T-1070|打通Codex执行与编导精调，脚本一键生成文章和图文|🔨 待办|PASS[REV:b195ac203ec0]|待验|[SPEC](docs/features/t1070-director-script-workflow.md) [SPEC](BACKLOG-details.md#t-1070)|[D]|
|T-1069|修复安装版素材导入慢与跨Tab丢失，重设计素材选择并补多平台绑定入口|🔨 待办|PASS[REV:19bad8ef6f93]|待验|[SPEC](docs/features/t1069-installed-media-and-binding.md)|[D]|
|T-1066|落实本地客户端优先出包并移除人为构建超时|⏸️ 待办|PASS[REV:0d40d8466937]|—|[SPEC](docs/features/t1066-local-package-build-only.md)|[D]|
|T-1062|汇总各会话改动统一提交并打包本地客户端，逐项验收含Skill粗剪|🔨 待办|PASS[REV:5912ba60da16]|待验|[SPEC](docs/features/t1062-consolidated-local-client-acceptance.md) · [SPEC](BACKLOG-details.md#t-1062)|[D]|
|T-1063|修正流程工具误拒合法字面方括号文件路径|🔨 待办|PASS[REV:4d99824da112]|待验|[SPEC](docs/features/t1063-orchestrator-literal-path-boundary.md)|[D]|
|T-1024|紧急排查充值50元后Growth受管Omni模型仍报余额不足|🔨 待办|—|待验|[SPEC](docs/verification/t1024-managed-credit-diagnosis.md)|[D]|
|T-1022|按账号组统一多平台工作区、绑定管理、首页与复盘|⏸️ 待办|PASS[REV:2f179f8d9380]|待验|[SPEC](docs/features/t1022-account-group-workspace.md) [SPEC](BACKLOG-details.md#t-1022)|[D]|
|T-1023|修正既有任务绑定glob导致的progress生成阻断|📋 待办|—|—|[SPEC](docs/features/t1022-account-group-workspace/VERIFICATION.md)|[D]|
|T-1021|CreatorOS封面与小红书图文双模板库、行业分类及私人收藏|🔨 待办|PASS[REV:475a70aef2e0]|待验|[SPEC](docs/features/t1021-cover-template-library.md)|[D]|
|T-1019|按观众具体任务与双九宫格持续生成可实测选题|⏸️ 待办|PASS[REV:3a0362412b23]|待验|[SPEC](docs/features/audience-task-topics/README.md)|[D]|
|T-1020|统一可视化推荐、作品承接与科学运营观测|📋 待办|待审|待验|[SPEC](docs/features/creator-operations/README.md)|[D]|
|T-1017|简化内容雷达：按账号定位一键生成可编辑改写稿|🔨 待办|PASS[REV:d2fb4541c82d]|待验|[SPEC](docs/features/t1017-content-radar-rewrite-first.md)|[D]|

|T-1015|核实剩余教训失败并校准过期回归断言|🔨 待办|—|—|[SPEC](docs/verification/t1014-reconcile-triage.md) [SPEC](BACKLOG-details.md#t-1015) [SPEC](BACKLOG-details.md#t1173-t-1015-same-identity-history)|[D]|
|T-1004|冻结共享能力协议与 NomiFun 迁移依赖|📋 待办|—|—|[SPEC](docs/features/t1003-agent-workbench.md) [SPEC](BACKLOG-details.md#t1173-t-1004-same-identity-history)|[D]|
|T-1005|实现多步计划、连续执行与原任务续跑|📋 待办|—|—|[SPEC](docs/features/t1003-agent-workbench.md)|[D]|
|T-1006|接入统一工具网关与长结果回读|📋 待办|—|—|[SPEC](docs/features/t1003-agent-workbench.md) [SPEC](BACKLOG-details.md#t1173-t-1006-same-identity-history)|[D]|
|T-1007|补齐任务文件空间与受控命令执行|📋 待办|—|—|[SPEC](docs/features/t1003-agent-workbench.md)|[D]|
|T-1008|迁移 NomiFun 浏览器能力并协调既有采集|📋 待办|—|—|[SPEC](docs/features/t1003-agent-workbench.md)|[D]|
|T-1009|实现产物版本、隔离预览与原生导出|📋 待办|—|—|[SPEC](docs/features/t1003-agent-workbench.md) [SPEC](BACKLOG-details.md#t1173-t-1009-same-identity-history)|[D]|
|T-1010|装配研究创作报告 Skill 与兼容扩展|📋 待办|—|—|[SPEC](docs/features/t1003-agent-workbench.md)|[D]|
|T-1011|实现对话内计划进度与文件交付交互|📋 待办|—|—|[SPEC](docs/features/t1003-agent-workbench.md)|[D]|
|T-1012|验收完整多步 Agent 与旧功能兼容|📋 待办|—|—|[SPEC](docs/features/t1003-agent-workbench.md)|[D]|
|T-1013|验证双端安装包多步 Agent 与升级兼容|📋 待办|—|—|[SPEC](docs/features/t1003-agent-workbench.md)|[D]|
|T-998|收敛业务代码硬编码模型名|📋 待办|—|—|[SPEC](docs/research/2026-09-04-architecture-agent-audit.md)|[D]|
|T-997|修复 ai→ai-runtime 反向依赖边界违反|📋 待办|—|—|[SPEC](docs/research/2026-09-04-architecture-agent-audit.md)|[D]|
|T-996|消除 review/reviews 双模块命名混淆|📋 待办|—|—|[SPEC](docs/research/2026-09-04-architecture-agent-audit.md)|[D]|
|T-993|同步 main 分支到最新(落后 origin/main 573 提交)|📋 待办|—|—|—|[D]|
|T-992|修复 Windows 升级启动运行环境切换拒绝访问|🔨 待办|—|—|[SPEC](docs/features/t992-windows-runtime-upgrade.md)|[D]|
|T-989|校正知识图谱错误提示的既有回归断言|📋 待办|—|—|[SPEC](docs/features/t989-knowledge-error-test.md)|[D]|
|T-984|本地打包并实测拆分采集修复|⏸️ 待办|—|—|[SPEC](docs/verification/t984-local-collection.md)|[D]|
|T-986|修复新绑定账号默认采集任务系统标记透传|📋 待办|—|—|[SPEC](docs/features/t986-bind-collection-flag.md)|[D]|
|T-980|纳入助手修复重新运行 V1.2 双端流水线|🔨 待办|—|—|[SPEC](docs/features/t980-release-rerun.md)|[D]|
|T-979|自动化页面慢轮询与切换对象回写防护|⬜ 待办|—|—|[SPEC](docs/features/t979-automation-polling.md)|[D]|
|T-976|修复安装版 AI 助手 RedFox 再次失败与脱离对话的任务交互|🔨 待办|—|—|[SPEC](docs/features/t976-chat-inline-redfox.md)|[D]|
|T-957|排查 AI 失败、全场景验收并优化 Agent 提示词|🔨 待办|—|—|[SPEC](docs/features/t957-ai-real-acceptance.md)|[D]|
|T-956|修复安装版点击采集一直抓取中|🔨 待办|—|—|[SPEC](docs/features/t956-installed-collection-stuck.md)|[D]|
|T-954|接入抖音流量来源并以专家方法改进编导交互|🔨 待办|—|—|[SPEC](docs/features/t954-director-content-loop.md)|[D]|
|T-951|修复自动化采集缺 jobRunId 与千条作品采集失败|⏸️ 待办|—|—|[SPEC](docs/features/t951-collection-reliability.md)|[D]|
|T-950|排查并恢复当前产品缺失历史数据|⏸️ 待办|—|—|[SPEC](docs/verification/t950-data-recovery.md)|[D]|
|T-945|排查并修复当前视频渲染再次失败|⏸️ 待办|—|—|[SPEC](docs/verification/t945-render-failure.md)|[D]|
|T-943|拉取并跑通 JY_IPAgent，调研数字人 API 与 CreatorOS 接入|⏸️ 待办|—|—|[SPEC](docs/features/t943-jy-ipagent-research.md)|[D]|
|T-940|补齐应用内签名远程更新闭环|📋 待办|—|—|[SPEC](docs/features/t939-positioning-release.md)|[D]|
|T-935|修复整稿子任务长时间排队无执行|🔨 待办|—|—|[SPEC](docs/verification/t935-script-queue.md)|[D]|
|T-934|统一 CLI 与页面的持久聊天工具入口|🔨 待办|—|—|[SPEC](docs/verification/t934-cli-chat-unification.md)|[D]|
|T-933|安装并验收本轮Agent Runtime桌面版|🔨 待办|—|—|[SPEC](docs/verification/t932-runtime-alignment.md)|[D]|
|T-919|定位并修复本地包主导航卡顿、助手通知刷屏与搜索停滞|🔨 待办|—|—|复用 T-912/T-909 导航契约与 [SPEC](docs/superpowers/specs/2026-09-04-agent-runtime-refactor.md)|[D]|
|T-915|根治 AI 卡慢、失败不重试与搜索/浏览器缺少自主循环，收敛架构与执行能力|🔨 待办|PASS[REV:8d309f0236d1]|—|[SPEC](docs/superpowers/specs/2026-09-04-agent-runtime-refactor.md)|[D]|
|T-916|修复工程对账与历史任务证据漂移，恢复可信重构基线|🔨 待办|—|—|[SPEC](docs/research/2026-09-04-architecture-agent-audit.md) [SPEC](BACKLOG-details.md#t-916) [SPEC](BACKLOG-details.md#t1173-t-916-same-identity-history)|[D]|
|T-917|记录 T-915 媒体测试事故并防止测试再次访问真实媒体根|📋 待办|—|—|[SPEC](docs/research/evidence/t915/2026-09-06-media-test-incident.md)|[D]|
|T-908|真实复测 douyin-transcribe Skill，并对照 CreatorOS 当前抖音抓取链路判断是否需要兼容修复|📋 待办|—|—|—|[D]|
|T-906|放大 AI 助手默认窗口并支持拖拽缩放与跨启动尺寸记忆|⏸️ 待办|—|待验|—|[D]|
|T-905|调研独立的极简手机口播创作产品，以人设选稿、灵感写稿、实拍与“123321”真人换口型为核心|📋 待办|—|—|—|[D]|
|T-884|只读诊断用户加密日志中的 ASR 转写失败|⏸️ 待办|—|—|复用 T-768 ASR 通用回退、T-639 MiMo ASR 与 T-676 逐字稿队列契约|[D]|
|T-883|提交并推送 T-881/T-882 候选，触发 GitHub macOS 与 Windows 官方安装包流水线|⏸️ 待办|—|—|复用 [SPEC](orchestrator/T881-FRONTEND-VALIDATION.md)、[SPEC](orchestrator/T882-BUILD-VALIDATION.md) [SPEC](BACKLOG-details.md#t-883)|[D]|
|T-878|让生图模型连接测试正确识别并提示 401/403 鉴权失败|📋 待办|—|—|[SPEC](docs/research/2026-08-17-dudu-image-auth-failure-diagnosis.md)|[D]|
|T-867|恢复 AI 对项目素材与分镜场景的自动语义匹配|🔨 待办|—|待验|[SPEC](BACKLOG-details.md#t-867)|[D]|
|T-860|修复竖屏素材底边与左下人物框边界重合|🔨 待办|—|待验|[SPEC](BACKLOG-details.md#t-860)|[D]|
|T-859|竖屏素材段人物收进左下角，并消除切换白闪|🔨 待办|PASS[REV:44a0172c0850]|待验|[SPEC](BACKLOG-details.md#t-859)  [SPEC](docs/superpowers/specs/2026-08-16-portrait-material-pip-smooth-transition.md)|[D]|
|T-858|把剪辑方法真正落到 CreatorOS，根治竖屏统一舞台、字幕重点词与动态 PPT|🔨 待办|PASS[REV:2798870c87f4]|待验|[SPEC](BACKLOG-details.md#t-858)  [SPEC](docs/superpowers/specs/2026-08-16-video-direction-stage-and-caption-emphasis.md)|[D]|
|T-857|构建当前已提交候选的 CreatorOS 1.1.0 Windows 安装包|⏸️ 待办|—|待验|[SPEC](BACKLOG-details.md#t-857)|[D]|
|T-856|重做竖屏成片的统一舞台、字幕可读性与重点词强调|⏸️ 待办|—|待验|[SPEC](BACKLOG-details.md#t-856)|[D]|
|T-855|构建包含 T-854 与当前已提交修复的 CreatorOS macOS 本地安装包|⏸️ 待办|—|—|[SPEC](BACKLOG-details.md#t-855)|[D]|
|T-851|支持录制“123”短视频生成本人授权的 AI 数字人口播|📋 待办|待审|待验|[SPEC](BACKLOG-details.md#t-851)|[D]|
|T-850|支持只上传未粗剪口播录像，由 AI 理解实拍语义并生成可确认粗剪|📋 待办|待审|待验|[SPEC](BACKLOG-details.md#t-850)|[D]|
|T-847|补齐 Windows 正式包的 CreatorOS CLI runtime 并重跑 1.1.0 双端流水线|⏸️ 待办|—|—|[SPEC](BACKLOG-details.md#t-847)|[D]|
|T-846|提交当前批准候选并运行 CreatorOS 1.1.0 macOS/Windows 官方双端构建|⏸️ 待办|—|—|[SPEC](BACKLOG-details.md#t-846)|[D]|
|T-845|根治 Windows 用户机成片在 HyperFrames 启动阶段缺失分层模块解析器|🔨 待办|—|待验|[SPEC](BACKLOG-details.md#t-845)|[D]|
|T-843|为 CreatorOS 建立可由 Codex 完整操作的官方 CLI，并复用现有全部业务能力|🔨 待办|PASS[REV:ea17774db868]|—|[SPEC](BACKLOG-details.md#t-843)  [SPEC](docs/superpowers/specs/2026-08-15-creatoros-codex-cli.md)|[D]|
|T-835|取消制作分镜逐字保真失败对整稿候选的阻断，并给出可诊断恢复|🔨 待办|—|待验|[SPEC](BACKLOG-details.md#t-835)|[D]|
|T-833|根治结构化节点 schema 兼容报错与多张局部改稿卡无法连续采纳|🔨 待办|—|待验|[SPEC](BACKLOG-details.md#t-833)|[D]|
|T-831|重排官方渠道模型配置并复核上游图生图能力|🔨 待办|—|待验|[SPEC](BACKLOG-details.md#t-831)|[D]|
|T-829|建立并执行上游模型全能力真实兼容矩阵，覆盖渠道托管与用户中转站|🔨 待办|—|待验|[SPEC](BACKLOG-details.md#t-829)|[D]|
|T-828|诊断行业热点出题不可用、Windows 滚动条异常与 DeepMind/Max 模型报错|🔨 待办|—|待验|[SPEC](BACKLOG-details.md#t-828)|[D]|
|T-827|根治选题中心来源筛选失效与候选操作按钮无法点击|🔨 待办|—|待验|[SPEC](BACKLOG-details.md#t-827)|[D]|
|T-826|根治 CreatorOS v1.1 Windows 新安装包安装后无法启动|🔨 待办|—|待验|[SPEC](BACKLOG-details.md#t-826)|[D]|
|T-824|根治昨日文稿 Skill 与内容动效卡片迭代在标准版成品中无明显效果|🔨 待办|PASS[REV:853ab9b0f7ea]|待验|[SPEC](BACKLOG-details.md#t-824)  [SPEC](docs/superpowers/specs/2026-08-13-continuous-voiceover-storyboard-pipeline.md)|[D]|
|T-823|根治架构图等主视觉被信息卡遮挡并修正跨段画面切换滞后|🔨 待办|—|待验|[SPEC](BACKLOG-details.md#t-823)|[D]|
|T-821|网站内容因未登录或权限不足读取失败时引导用户前往登录保管库|🔨 待办|—|待验|[SPEC](BACKLOG-details.md#t-821)|[D]|
|T-819|让编导在普通对话中按自然语言定位并改写当前稿单段|🔨 待办|PASS[REV:20281a3415d4]|待验|[SPEC](BACKLOG-details.md#t-819)  [SPEC](docs/superpowers/specs/2026-08-13-natural-language-current-script-section-editing.md)|[D]|
|T-820|修复选题补卡到项目与文案的数据丢失并保存生成消费血缘|📋 待办|—|—|[SPEC](BACKLOG-details.md#t-820)|[D]|
|T-816|让当前确认稿成为配图与封面生成的第一内容真相|🔨 待办|PASS[REV:de532b22b58b]|待验|[SPEC](BACKLOG-details.md#t-816)  [SPEC](docs/superpowers/specs/2026-08-13-current-script-truth-and-natural-language-section-editing.md)|[D]|
|T-814|统一 CreatorOS 多页面 AI 对话体验并保留场景上下文与自由讨论能力|📋 待办|—|—|[SPEC](BACKLOG-details.md#t-814)|[D]|
|T-779|根治参考历史作品生成封面时误探本机工具并中断生图|🔨 待办|—|待验|[SPEC](BACKLOG-details.md#t-779)|[D]|
|T-773|更新 CreatorOS 1.0 最新使用教程、匿名化截图并新建成交型测试版教程|🔨 待办|—|待验|[SPEC](BACKLOG-details.md#t-773)|[D]|
|T-768|任何云端 ASR 故障都必须自动回退本地 Whisper|🔨 待办|PASS[REV:3a5532adc550]|待验|[SPEC](BACKLOG-details.md#t-768)  [SPEC](docs/superpowers/specs/2026-08-11-asr-universal-local-fallback.md)|[D]|
|T-762|根因复盘并设计渠道 ASR 密钥的短时租约闭环|🔨 待办|—|—|[SPEC](BACKLOG-details.md#t-762)|[D]|
|T-759|根治已绑定 B-roll 因 inventory 失配显示空白|🔨 待办|—|待验|[SPEC](BACKLOG-details.md#t-759)|[D]|
|T-754|根治 CreatorOS v1.0 官方包启动无限转圈|🔨 待办|—|—|[SPEC](BACKLOG-details.md#t-754)|[D]|
|T-748|补齐“重新输入激活码”原生命令 ACL 并重打官方包|🔨 待办|—|—|[SPEC](BACKLOG-details.md#t-748)|[D]|
|T-741|下移知识库“记一条经验”入口到录入操作行|🔨 待办|—|待验|[SPEC](BACKLOG-details.md#t-741)|[D]|
|T-739|根治制作视频跨项目灌入 B-roll、无证据改稿偏好与超长复盘卡|🔨 待办|—|待验|[SPEC](BACKLOG-details.md#t-739)|[D]|
|T-738|根治发布物料生成成功后无处查看并恢复卡内查看闭环|🔨 待办|—|待验|[SPEC](BACKLOG-details.md#t-738)|[D]|
|T-735|根治渠道受管模型成功产物被误判失败并建立 C 端稳定性闭环|🔨 待办|—|待验|[SPEC](BACKLOG-details.md#t-735)|[D]|
|T-734|根治 Windows 扫码绑定在启动前误依赖缺失 Playwright CLI|🔨 待办|—|待验|[SPEC](BACKLOG-details.md#t-734)|[D]|
|T-733|本地模型可用时收起渠道配置误报警并纠正票据不适用状态|🔨 待办|—|待验|[SPEC](BACKLOG-details.md#t-733)|[D]|
|T-732|根治局部改稿锚点失效后阻断全部 Copilot 对话|🔨 待办|—|待验|[SPEC](BACKLOG-details.md#t-732)|[D]|
|T-730|恢复可选“立论点”UI并增加适用场景引导，不重新变成写稿门槛|🔨 待办|PASS[REV:aeda30778cf2]|待验|[SPEC](BACKLOG-details.md#t-730)  [SPEC](docs/superpowers/specs/2026-08-09-optional-thesis-guidance.md)|[D]|
|T-731|支持按电商等创作场景生成并自定义创作框架|📋 待办|—|待验|[SPEC](BACKLOG-details.md#t-731)|[D]|
|T-729|根治渠道专属包仍跳官方入口并拆分官网、下载、人工反馈与反馈 API|📋 待办|—|待验|[SPEC](BACKLOG-details.md#t-729)|[D]|
|T-726|退役项目“论点骨架”并让写稿直接消费 Brief 与素材|🔨 待办|PASS[REV:a9cb8ebdc520]|待验|[SPEC](BACKLOG-details.md#t-726)  [SPEC](docs/superpowers/specs/2026-08-08-thesis-skeleton-retirement.md)|[D]|
|T-721|根治素材包导出回流造成递归嵌套并恢复大素材库完整可见性|🔨 待办|—|待验|[SPEC](BACKLOG-details.md#t-721)|[D]|
|T-720|根治特定 Windows 设备抖音内置浏览器页面崩溃导致内容雷达主页验证失败|📋 待办|—|待验|[SPEC](BACKLOG-details.md#t-720)|[D]|
|T-719|根治桌面端启动后二次白屏闪烁与首页排期提醒不可用|🔨 待办|—|待验|[SPEC](BACKLOG-details.md#t-719)|[D]|
|T-718|补齐智溯AI包内品牌并交付完整 Growth 配置后重打本地包|🔨 待办|—|待验|[SPEC](BACKLOG-details.md#t-718)|[D]|
|T-716|完善 Copilot 局部改稿、脚本版本回退、附件上下文与素材中心稳定排序|🔨 待办|—|待验|[SPEC](BACKLOG-details.md#t-716)|[D]|
|T-715|在 CreatorOS 增加 Growth AI 额度账户连接、查看与充值入口|🔨 待办|—|待验|[SPEC](BACKLOG-details.md#t-715)|[D]|
|T-714|接入工程教训闭环并迁移旧账本，确保真实踩坑可被后续任务自动复用|📋 待办|—|待验|[SPEC](BACKLOG-details.md#t-714)|[D]|
|T-713|构建包含通用智能体语义边界与当前制作修复的 macOS 0.3.0 本地测试包|🔨 待办|—|待验|[SPEC](BACKLOG-details.md#t-713)|[D]|
|T-712|优先采用用户上传素材进入 B-roll 时间线、恢复成片预览并收回渠道同步常驻提示|🔨 待办|—|待验|[SPEC](BACKLOG-details.md#t-712)|[D]|
|T-709|将 macOS Developer ID 签名与 Apple 公证凭据接入 GitHub 正式发布流水线|🔨 待办|—|待验|[SPEC](BACKLOG-details.md#t-709)|[D]|
|T-708|全局审计并软化 AI 工具中不合理的创作完整度门禁|🔨 待办|—|待验|[SPEC](BACKLOG-details.md#t-708)|[D]|
|T-707|将定位前采收敛为 Copilot 主导的自适应编导访谈并直接闭环定位中心|🔨 待办|PASS[REV:3a3d3862a60b]|待验|[SPEC](BACKLOG-details.md#t-707)  [SPEC](docs/superpowers/specs/2026-08-01-positioning-pre-interview-workflow.md)|[D]|
|T-705|根治 macOS 本地包启动后落入 Page Not Found|🔨 待办|—|待验|[SPEC](BACKLOG-details.md#t-705)|[D]|
|T-703|根治视频制作从分镜到预览、对话调剪、采纳与再制作的多处断裂并重打本地包|🔨 待办|PASS[REV:7146b662ddb2]|待验|[SPEC](BACKLOG-details.md#t-703)  [SPEC](docs/superpowers/specs/2026-08-05-video-production-editing-loop.md)|[D]|
|T-702|根治审核“应用改写”后分镜稿格式坍缩为 Markdown 表格源码|📋 待办|—|待验|[SPEC](BACKLOG-details.md#t-702)|[D]|
|T-695|清理应用内硬编码品牌并让白标用户表面保持中性|🔨 待办|—|待验|[SPEC](BACKLOG-details.md#t-695)|[D]|
|T-691|补齐 Copilot 单项目全生命周期、跨项目历史与审核改稿工具闭环|🔨 待办|PASS[REV:702e78ce0ae0]|待验|[SPEC](BACKLOG-details.md#t-691)  [SPEC](docs/superpowers/specs/2026-08-04-copilot-project-lifecycle-tool-closure.md)|[D]|
|T-694|建立多渠道专属包工厂、项目级出包 Skill 与安全增量更新闭环|🔨 待办|PASS[REV:96e12f85f1b3]|待验|[SPEC](BACKLOG-details.md#t-694)  [SPEC](docs/superpowers/specs/2026-08-04-channel-package-factory-and-incremental-update.md)|[D]|
|T-686|根治定位前采联网补充直接报错并恢复国内中文公开检索|🔨 待办|—|待验|[SPEC](BACKLOG-details.md#t-686)|[D]|
|T-687|建立口播联想画面 Skill 并打通图序号引用、项目 B-roll 与成片渲染|🔨 待办|—|待验|[SPEC](BACKLOG-details.md#t-687)|[D]|
|T-685|排查并根治全流程写稿长度失控及审核不识别已采纳文案卡|🔨 待办|—|待验|[SPEC](BACKLOG-details.md#t-685)|[D]|
|T-684|根治 Copilot 联网搜素材失败后回退模型记忆并误导配置搜索模型|🔨 待办|—|待验|[SPEC](BACKLOG-details.md#t-684)|[D]|
|T-683|修复 Copilot 在 Windows 无法读取盘符绝对路径与目录授权失效|🔨 待办|—|待验|[SPEC](BACKLOG-details.md#t-683)|[D]|
|T-679|接入 Growth 按激活权益签发的受管模型凭据、真实模型白名单与用户选择|🔨 待办|—|待验|[SPEC](BACKLOG-details.md#t-679)|[D]|
|T-678|根治内容雷达生成选题继续读取旧定位|📋 待办|—|待验|[SPEC](BACKLOG-details.md#t-678)|[D]|
|T-677|优化首页与定位中心切换时整页骨架卡顿 1–2 秒|📋 待办|—|待验|[SPEC](BACKLOG-details.md#t-677)|[D]|
|T-676|根治云端 ASR 测试假阳性并接通 StepFun，同时修复 Windows 本地 Whisper 回退|📋 待办|—|待验|[SPEC](BACKLOG-details.md#t-676)|[D]|
|T-671|确定 CreatorOS 代理商业模式与官网价格边界|🔨 待办|—|待验|[SPEC](BACKLOG-details.md#t-671)|[D]|
|T-670|恢复 CreatorOS 部署前真实官网并收口公开商业信息|🔨 待办|—|待验|[SPEC](BACKLOG-details.md#t-670)|[D]|
|T-666|根治定位前采误清空既有定位并改为非破坏草稿切换|🔨 待办|—|待验|[SPEC](BACKLOG-details.md#t-666)|[D]|
|T-665|支持彻底删除内容雷达信源及其全部归属数据|🔨 待办|—|待验|[SPEC](BACKLOG-details.md#t-665)|[D]|
|T-662|根治成片把内部结构标签当正文并优化卡片文字重合|🔨 待办|—|待验|[SPEC](BACKLOG-details.md#t-662)|[D]|
|T-661|根治项目素材未进入制作、采纳后仍转圈及素材包图片无扩展名|🔨 待办|—|待验|[SPEC](BACKLOG-details.md#t-661)|[D]|
|T-660|根治雷达预填逐字稿未解锁下一步及已采纳封面仍被判缺失|🔨 待办|—|待验|[SPEC](BACKLOG-details.md#t-660)|[D]|
|T-656|收紧桌面授权本地信任链，移除生产冒烟旁路并消除 verdict 私钥明文靶点|🔨 待办|PASS[REV:0ee97952c9a3]|待验|[SPEC](BACKLOG-details.md#t-656)  [SPEC](docs/superpowers/specs/2026-08-02-desktop-verdict-basic-hardening.md)|[D]|
|T-655|接通 Seedance 文生视频适配器并修复 `seeddance` 配置报未知 provider|🔨 待办|—|—|[SPEC](BACKLOG-details.md#t-655)|[D]|
|T-654|新增 Qwen 方言 ASR 适配器并接入设置预设|🔨 待办|—|待验|[SPEC](BACKLOG-details.md#t-654)|[D]|
|T-653|支持本地自配与渠道子 Key 托管双模式模型供给|📋 待办|待审|待验|[SPEC](BACKLOG-details.md#t-653)|[D]|
|T-652|重构定位前采为必经的编导式访谈与证据辅助工作流|🔨 待办|PASS[REV:6a06cf4f57d9]|待验|[SPEC](docs/superpowers/specs/2026-08-01-positioning-pre-interview-workflow.md) · [SPEC](BACKLOG-details.md#t-652)|[D]|
|T-650|知识倾倒输入框支持拖拽文件直接导入|🔨 待办|—|待验|[SPEC](BACKLOG-details.md#t-650)|[D]|
|T-651|内容雷达默认按作品真实发布时间倒序|🔨 待办|—|待验|[SPEC](BACKLOG-details.md#t-651)|[D]|
|T-649|调研并设计激活后渠道白标：品牌名、应用内 Logo 与系统级图标边界|📋 待办|—|待验|[SPEC](BACKLOG-details.md#t-649)|[D]|
|T-646|统一优化结构化 AI 工具为结果优先、分段生成与局部修复|🔨 待办|—|待验|[SPEC](BACKLOG-details.md#t-646)|[D]|
|T-645|收敛模型配置项并同步精简 Growth 渠道模板|🔨 待办|PASS[REV:21e54e5382a4]|待验|[SPEC](BACKLOG-details.md#t-645)  [SPEC](docs/superpowers/specs/2026-08-02-capability-scoped-channel-model-authority.md)|[D]|
|T-644|根治 CreatorOS macOS 客户端持续闪屏|🔨 待办|—|待验|[SPEC](BACKLOG-details.md#t-644)|[D]|
|T-643|收口 CreatorOS 为输入 Activity 激活码后直接授权，隐藏当前权益领取入口|📋 待办|—|待验|[SPEC](BACKLOG-details.md#t-643)|[D]|
|T-642|打通内容雷达对标文案→改写策略→选题卡→项目写稿的编导证据链|🔨 待办|PASS[REV:ded8361cdf11]|待验|[SPEC](docs/superpowers/specs/2026-08-01-content-radar-creative-handoff.md) · [SPEC](BACKLOG-details.md#t-642)|[D]|
|T-641|根治发布中心“登录多日仍只有一个采集日、发布趋势不出曲线”|🔨 待办|—|待验|[SPEC](BACKLOG-details.md#t-641)|[D]|
|T-640|配置 Apple Developer ID 签名与公证，并在前序修复全部闭环后统一产出本地安装包|🔨 待办|—|待验|[SPEC](BACKLOG-details.md#t-640)|[D]|
|T-635|把 CreatorOS 正式构建绑定到 Growth 商品的统一 `projectKey`，禁止运行时覆盖产品身份或关闭严格验签|🔨 本地实现待验|PASS[REV:263c231fa57c]|待验|[SPEC](BACKLOG-details.md#t-635)  [SPEC](docs/superpowers/specs/2026-07-30-growth-product-identity-binding.md)|[D]|
|T-633|恢复创作者中心自动扫码登录|🔨 待办|—|待验|[SPEC](BACKLOG-details.md#t-633)|[D]|
|T-632|根治“新建定位母版”无效、历史母版无法恢复与逐字稿提取长时间无结果|🔨 待办|—|待验|[SPEC](BACKLOG-details.md#t-632)|[D]|
|T-631|根治大视频上传被 10MB 截断并误报 ffmpeg 缺失|🔨 待办|—|待验|[SPEC](BACKLOG-details.md#t-631)|[D]|
|T-621|补齐渠道模型 authority snapshot 生产链路回归|📋 待办|—|—|[SPEC](BACKLOG-details.md#t-621)|[D]|
|T-576|统一跟进尚未关闭的飞书线上用户反馈|🔨 免审|—|—|[SPEC](BACKLOG-details.md#t-576)|[D]|
|T-575|接通 CreatorOS 权益领取、渠道配置与问题反馈|🔨 本地PASS·待生产E2E|—|待验|[SPEC](BACKLOG-details.md#t-575)|[D]|
|T-562|根治 CreatorOS 0.2.0 Windows 安装后持续白屏|🔨 免审|—|待验|[SPEC](BACKLOG-details.md#t-562)|[D]|
|T-548|根治视频渲染重试后成片脱离项目且制作页实时预览消失|🔨 待安装版真机|—|待验|[SPEC](BACKLOG-details.md#t-548)|[D]|
|T-538|接通渠道签名上下文的产品问题反馈|🔨 本地PASS·待生产E2E|—|待验|[SPEC](BACKLOG-details.md#t-538)|[D]|
|T-536|根治“我的收藏”同步错误分类与浏览器档案锁恢复|🔨 待真实账号只读验收|—|待验|[SPEC](BACKLOG-details.md#t-536)|[D]|
## ⏸️ 暂停池（不自动派发）

> 只保留任务索引；暂停原因与恢复条件见 `orchestrator/events.ndjson` 和详情文档。恢复必须使用 `taskctl start`。

|ID|状态|审核|验收|文档|
|---|---|---|---|---|
|T-626|⏸️|—|待验|[详情](BACKLOG-details.md#t-626)|
|T-577|⏸️|—|待验|[详情](BACKLOG-details.md#t-577)|
|T-565|⏸️|—|待验|[详情](BACKLOG-details.md#t-565)|
|T-524|⏸️|—|待验|[详情](BACKLOG-details.md#t-524)|
|T-519|⏸️|—|待验|[详情](BACKLOG-details.md#t-519)|
|T-525|⏸️|—|待验|[详情](BACKLOG-details.md#t-525)|
|T-517|⏸️|—|待验|[详情](BACKLOG-details.md#t-517)|
|T-516|⏸️|—|待验|[详情](BACKLOG-details.md#t-516)|
|T-510|⏸️|—|待验|[详情](BACKLOG-details.md#t-510)|
|T-506|⏸️|—|待验|[详情](BACKLOG-details.md#t-506)|
|T-502|⏸️|—|待验|[详情](BACKLOG-details.md#t-502)|
|T-497|⏸️|—|待验|[详情](BACKLOG-details.md#t-497)|
|T-451|⏸️|—|待验|[详情](BACKLOG-details.md#t-451)|
|T-449|⏸️|—|待验|[详情](BACKLOG-details.md#t-449)|
|T-448|⏸️|—|待验|[详情](BACKLOG-details.md#t-448)|
|T-433 S2|⏸️|—|待验|[详情](BACKLOG-details.md#t-433-s2)|
|T-433 S4|⏸️|—|待验|[详情](BACKLOG-details.md#t-433-s4)|
|T-433 S5|⏸️|—|待验|[详情](BACKLOG-details.md#t-433-s5)|
|T-426|⏸️|—|待验|[详情](BACKLOG-details.md#t-426)|
|T-425W|⏸️|—|待验|[详情](BACKLOG-details.md#t-425w)|
|T-413|⏸️|—|待验|[详情](BACKLOG-details.md#t-413)|
|T-417|⏸️|—|待验|[详情](BACKLOG-details.md#t-417)|
|T-418|⏸️|—|待验|[详情](BACKLOG-details.md#t-418)|
|T-420|⏸️|—|待验|[详情](BACKLOG-details.md#t-420)|
|T-399|⏸️|—|待验|[详情](BACKLOG-details.md#t-399)|
|T-399c|⏸️|—|待验|[详情](BACKLOG-details.md#t-399c)|
|T-409|⏸️|—|待验|[详情](BACKLOG-details.md#t-409)|
|T-372 W-spike|⏸️|—|待验|[详情](BACKLOG-details.md#t-372-w-spike)|
|T-372 W-ci|⏸️|—|待验|[详情](BACKLOG-details.md#t-372-w-ci)|
|T-391 H-econ|⏸️|—|待验|[详情](BACKLOG-details.md#t-391-h-econ)|
|T-393|⏸️|—|待验|[详情](BACKLOG-details.md#t-393)|
|T-401|⏸️|—|待验|[详情](BACKLOG-details.md#t-401)|
|T-406|⏸️|—|待验|[详情](BACKLOG-details.md#t-406)|
|T-407|⏸️|—|待验|[详情](BACKLOG-details.md#t-407)|
|T-396|⏸️|—|待验|[详情](BACKLOG-details.md#t-396)|
|T-398|⏸️|—|待验|[详情](BACKLOG-details.md#t-398)|
|T-366c|⏸️|—|待验|[详情](BACKLOG-details.md#t-366c)|
|T-361|⏸️|—|待验|[详情](BACKLOG-details.md#t-361)|
|T-352|⏸️|—|待验|[详情](BACKLOG-details.md#t-352)|
|T-320c|⏸️|—|待验|[详情](BACKLOG-details.md#t-320c)|
|T-350c|⏸️|—|待验|[详情](BACKLOG-details.md#t-350c)|
|T-351|⏸️|—|待验|[详情](BACKLOG-details.md#t-351)|
|T-349d|⏸️|—|待验|[详情](BACKLOG-details.md#t-349d)|
|T-339|⏸️|—|待验|[详情](BACKLOG-details.md#t-339)|
|T-328|⏸️|—|待验|[详情](BACKLOG-details.md#t-328)|
|T-332R|⏸️|—|待验|[详情](BACKLOG-details.md#t-332r)|
|T-336|⏸️|—|待验|[详情](BACKLOG-details.md#t-336)|
|T-335|⏸️|—|待验|[详情](BACKLOG-details.md#t-335)|
|T-337|⏸️|—|待验|[详情](BACKLOG-details.md#t-337)|
|T-337a|⏸️|—|待验|[详情](BACKLOG-details.md#t-337a)|
|T-337b|⏸️|—|待验|[详情](BACKLOG-details.md#t-337b)|
|T-337c|⏸️|—|待验|[详情](BACKLOG-details.md#t-337c)|
|T-337d|⏸️|—|待验|[详情](BACKLOG-details.md#t-337d)|
|T-337e|⏸️|—|待验|[详情](BACKLOG-details.md#t-337e)|
|T-337f|⏸️|—|待验|[详情](BACKLOG-details.md#t-337f)|
|T-337g|⏸️|—|待验|[详情](BACKLOG-details.md#t-337g)|
|T-334|⏸️|—|待验|[详情](BACKLOG-details.md#t-334)|
|T-324|⏸️|—|待验|[详情](BACKLOG-details.md#t-324)|
|T-340|⏸️|—|待验|[详情](BACKLOG-details.md#t-340)|
|T-315|⏸️|—|待验|[详情](BACKLOG-details.md#t-315)|
|T-316|⏸️|—|待验|[详情](BACKLOG-details.md#t-316)|
|T-317|⏸️|—|待验|[详情](BACKLOG-details.md#t-317)|
|T-318|⏸️|—|待验|[详情](BACKLOG-details.md#t-318)|
|T-319|⏸️|—|待验|[详情](BACKLOG-details.md#t-319)|
|T-312|⏸️|—|待验|[详情](BACKLOG-details.md#t-312)|
|T-307|⏸️|—|待验|[详情](BACKLOG-details.md#t-307)|
|T-306|⏸️|—|待验|[详情](BACKLOG-details.md#t-306)|
|T-301|⏸️|—|待验|[详情](BACKLOG-details.md#t-301)|
|T-302|⏸️|—|待验|[详情](BACKLOG-details.md#t-302)|
|T-261|⏸️|—|待验|[详情](BACKLOG-details.md#t-261)|
|T-249|⏸️|—|待验|[详情](BACKLOG-details.md#t-249)|
|T-250|⏸️|—|待验|[详情](BACKLOG-details.md#t-250)|
|T-255b|⏸️|—|待验|[详情](BACKLOG-details.md#t-255b)|
|T-185R|⏸️|—|待验|[详情](BACKLOG-details.md#t-185r)|
|T-136R|⏸️|—|待验|[详情](BACKLOG-details.md#t-136r)|
|T-100|⏸️|—|待验|[详情](BACKLOG-details.md#t-100)|
|T-087|⏸️|—|待验|[详情](BACKLOG-details.md#t-087)|
|T-045|⏸️|—|待验|[详情](BACKLOG-details.md#t-045)|

## ✅ 已完成

> ✅ 已完成任务全文已归档到 [BACKLOG-archive.md](BACKLOG-archive.md)(减小本看板体积;单一执行真相仍是本文件)。

[D]: BACKLOG-details.md
