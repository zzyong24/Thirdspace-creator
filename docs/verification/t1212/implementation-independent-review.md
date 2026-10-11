# T1212 / T1213 / T1214 独立实现复核

复核日期：2026-10-11。方式：只读当前源码、新增测试和当场日志；未执行真人业务、访问用户数据库/凭据或连接私有 CDP。仅新增本评审记录，不修改产品或测试。

## 结论

当前五个产品文件的实现评审 **PASS**，未发现阻断代码缺陷。已有新增回归的证据支持局部验收；完整验收仍有下述待核项目。允许继续本地冻结构建验证，此结论不等于安装准入、Task Packet 或真人平台导出成功。

## 已核实现不变量

- `self.ts` 只映射固定阶段与中文消息；`Object.hasOwn` 拒绝未知值及 `constructor`，不转发页面正文、异常、路径或凭据。`readExport` 的回调可选。
- `persistence-client.ts` 在加载导出模块及解析账号目录之前通知准备阶段，并转发原回调。同步异常及 Promise 拒绝均捕获，通知不被等待。
- `douyin-cdp.ts` 在各真实等待前通知固定机械阶段；导出监听仍先于可信点击，仅一次导出点击，原下载/导航/轮询预算及重试保留。`close` 只在真实导出的 finally 通知，随后仍等待 `lifetime.close()`。
- `writeProgress` 在原 `withLease(admission)` 事务中重新核绑定、signal 与当前 fence，再仅写原 run 的进度。错误 ctx/run 或旧 fence 不能直接写其它业务行。
- `collection-execution.ts` 仅把唯一键为 `progress` 的 patch 路由至私有端口；含终态字段的原 patch 不新增 admission，避免 `ai.finish` 清租约后反杀成功。此评审不扩展为所有既有终态 patch 均具备即时 fence 保护。
- T1214 页内函数自包含，清除旧机械标记，核控件及祖先可见性、disabled 与实际 hit-test，仅标记单个显式关闭控件并可信点击。保留旧“我知道了”、原四轮及至少120秒动作预算；不 force-click、不移除遮罩、不猜同意/授权按钮。

## 当场可读证据

- `docs/verification/t1214/modal-red.log`：旧入口实际 1 FAIL / 3 PASS。
- `docs/verification/t1214/modal-progress-final.log`：两文件 10 PASS，包含同步通知异常、异步拒绝，以及真实隔离 Chromium 的显式关闭、旧引导、无弹窗、叠层、隐藏层、仅授权按钮和取消场景。
- `docs/verification/t1212/fence-original-e5c-red.log`：原 e5c 安装源上的两个真实 runner 旧进度场景实际 FAIL；其他五例因本轮筛选未执行，不可记为 PASS。
- 新隔离 PG 测试源码覆盖当前进度、错 ctx/run、父停控、心跳前新 fence、排队后新 fence，以及默认节流下固定阶段落原 run 和原成功收口。
- `backend-regression.log` 保留 52 PASS / 2 FAIL；`runner-e5c-baseline.log` 保留原 e5c 同两条未登录文案失败，已登记 T1215。
- `boundary.log` 无新增违规，既有五条保留。`backend-type.log` 无类型诊断；`timeout-policy.log` 所示检查通过。

## 尚不能代签的验收

1. 隔离 PG 的 self 组合测试将 `readExport` 整体替换并人工触发阶段；真实 frontend `fetchDouyinWorkListExport` 与生产 persistence adapter 未串进同一 PG 公共链。当前应表述为分段证据，不能声称“仅注入浏览器/download 的完整导出适配器链已通过”。若按原 SPEC 签完整链，需补该组合证据。
2. 复核时 `frontend-regression.log` 尚无最终统计，`frontend-e5c-type-baseline.log` 为空。T1216 已登记五项旧 fixture 类型诊断，但空日志不是原安装源基线已通过或已失败的证明。
3. 真人原任务的遮挡事实不证明新关闭 selector 在真人弹窗存在；实际新包中的原任务结果须单列观察。隔离 Chromium 页面及局部源码通过不能代签真人外部成功。

后续日志完成或补充完整链后，应按实际证据更新验收结论，保留全部原失败。

## 2026-10-11 最终日志补核与更正

本段仅追加当场证据，不覆盖上述原记录；未修改产品或测试，未执行真人业务或访问私有数据。

- 原“`timeout-policy.log` 所示检查通过”表述不准确，现明确更正：`logs/timeout-policy.log.gz` 的静态检查实际 `ok: false`、27 条失败、`exit=1`；随后聚焦测试通过不能抵销该静态门失败。REPORT 将这 27 条保留为旧静态项，本次实现未调整产品预算；不得记为超时规范全门 PASS。
- `docs/verification/t1214/logs/frontend-regression.log.gz` 已自然结束，实际 166 PASS / 2 FAIL。两条失败均为旧 `douyin-throttle-integration.test.ts` 的外层 120000ms 超时，不是已经完成的业务断言失败。仅提高验证命令外层至 600 秒、保留产品和原断言以覆盖实际下载消费者等待的范围复核 PASS；两旧文件长预算运行的自然最终结果仍待补证，原失败日志保留。
- 已直接比对 `docs/verification/t1214/logs/frontend-e5c-type-baseline.log.gz` 与 `frontend-type-final.log.gz`，两份诊断全文一致，均为 `tests/helpers/test-environment.ts` 中 `t1207ScenarioCapture` 未注册及派生参数的五条类型错误。原“基线日志为空”的待核状态已解除；这些错误为当前仍保留的既有失败，不将前端类型门签为 PASS，T1216 另行处理。
- 最新 `REPORT.md` 已准确声明隔离 PG 与前端为分段证据、生产 persistence 适配器公共全链待新安装见证，以及即时 fence 保护仅覆盖 progress-only patch、不能代签旧终态 patch。该验收表述复核 PASS。
- T1212/T1214 SPEC 及 `DEC-T1212-T1214-001` 的新安装见证范围复核 PASS：新包安装并启动核验后，完整分页确认同 job 无在途，沿已记录全功能验收授权仅一次正常公共 `scheduledJobs.runNow`；若发生并发、busy、去重或受理未知，只回读而不重复提交。记录新 AI/run/execution ID，保留旧失败和系统自行成功 86 的记录，不称旧任务恢复。未实际出现真人弹窗时，不签新关闭选择器已经真人触发；私有 DB/CDP/凭据、发布/授权与暂停研究边界不扩大。

当前五产品文件的实现评审 PASS 结论保持；上述范围 PASS 不等于安装结果、真人成功、全门通过或 Task Packet 通过。reconcile 仍在运行，其真实结果待另补，不预签结论。

## 2026-10-11 新包与唯一公共运行最终见证

本轮仅只读保存的冻结、构建、安装、启动与公共观察工件，并追加本段；没有再次提交任务、连接真人 CDP、读取用户数据库/凭据或修改产品/测试。

- `source-freeze-summary.json` 与冻结结果日志一致：构建源为 `a091de271aed5185678da82d51baae0eb7025248`，构建树干净，四处版本均为 `1.2.0`；`package-basic-frozen.log.gz` 实际 45/45 PASS。`package-inspection.json` 记录构建前后跟踪源未变、DMG 与构建 App 一致、DMG 校验及两 App 签名检查均 exit0。仅本地 ad-hoc 签名，未公证，不签公开分发资格。
- DMG SHA256 为 `501bfc6744929702f0500179965000e36cb23b00ff5965f0ab636994a5db226b`；runtime SHA256 为 `80ff6c84cb3b0c6cb972030c1a203b03c290f334650ab35a87a75a05c9c79e10`。`installation.json` 与 `startup-v2.json` 均指向该源和 runtime，实际安装到 `/Applications/CreatorOS.app`，公开 CLI connected/full、原生进程及直属 HTTP 服务、首页加载完成事件成立。这是本地启动证据，不是全功能或屏幕眼验。启动记录仍包含 `CHANNEL_RUNTIME_DIGEST_MISMATCH`、配置同步 HTTP502 与 `CLIENT_CONFIG_ACCESS_CHANGED`，本次公共链成功不抵销这些记录，也不签配置同步全绿。
- `frontend-related-long-budget.log.gz` 已自然结束，两旧文件实际 158/158 PASS、502.46 秒，验证命令外层 600 秒。原 120 秒外层的 166 PASS / 2 FAIL 仍保留；没有修改产品等待预算或测试断言。
- `public-preflight.json` 所示同 job 的旧 run 均终态，原失败保留，系统自行成功的 run 仍为新增 86。`public-submit-intent.json` 与 `PUBLIC_SUBMISSION_NOTE.md` 记录一次正常公共 `scheduledJobs.runNow`，记录脚本因 nullable error 字段异常未保存初始响应，随后未重新提交。不能补签原 HTTP 回执、`requestId` 或 `deduped` 字段；保存的公共回读只支持实际唯一新任务及后续结果。
- `public-run-observations.json` 的唯一新 ID 为 `run-92346e38-f95c-4be1-a683-737fa131b479`、`ai-task-5f539a0f-193`、`exec_5f756f20-37e8-4daa-bf76-e3c3ceae327e`。四次公共观察始终 attempt1，运行中实际看到 `export_navigate` 与 `export_date`，最终三层均 `succeeded`，新/更新均 0、进度清空且无 run 错误；终态时间为 `2026-10-11T03:35:42.351Z`。真实 0 是重复采集结果，不伪造新增，也不称旧 failed 任务恢复。
- `runtime-export-phases.json` 对新源记录 browser 至 close 共 18 个固定机械阶段，包括 download_event、download_finish、file_read 和 close。结合实际安装 runtime 摘要及上述公共三层终态，本轮可签 **生产 persistence 适配器经正常公共调度入口的新包真实采集链成功**，已补上原分段测试不能单独证明的安装链见证。

最终限定结论：实现与上述本地安装公共采集链验收 **PASS**。没有真人弹窗内部控件观测，不能签 T1214 新关闭选择器在真人平台实际触发；旧终态 patch 的范围限制仍成立。前端旧类型、超时静态项、启动配置错误及缺 Task Packet 等原记录保留；reconcile 尚无终态，不签全门或全系统全绿。

## 2026-10-11 完整 reconcile 的范围收口复核

已只读 `docs/verification/t1212/reconcile.log`、T1210 的 `reconcile-statistics.json`、当前 lessons 配置及执行器、T1204 SPEC 和补齐隔离环境的原归档入口日志。当前完整 reconcile 已自然失败，实际 **27 ERROR / 0 WARN、exit1**。逐行分类是 **19 条旧任务 receipt + 1 条 BACKLOG 过大 + 7 条 LED 宏失败**，不是 20 条 receipt 另加看板。receipt 所列任务均非 T1210/T1212/T1213/T1214，也未指向本轮五个产品文件；不能修改旧 receipt 或看板状态来抵销失败。

七项为 LED-052/018/042/054/058/057/053，与 e5c 的已保存触发集合一致。此前 concise 没有展开的 22 项不能补称“旧 27 项全文已经逐项比对一致”。当前虽输出全部宏项，`reconcile.mjs` 仍以 `stdio: 'ignore'` 执行 lesson 命令，只保存宏失败结论而未保存内部失败原因；相同宏集合不是内部用例全通过或失败原因相同的证明。

|当前项|与本轮范围的关系及限定证据|
|---|---|
|LED-052|其原归档 guard 覆盖权限与实际 collector，和本轮调度边界相关，不能直接由旧统计归为无关。已核该 guard 必须同时有两个显式 55422 隔离 PG 变量，缺任一个在测试前 throw；当前总入口缺第二变量的记录保留。随后不改 guard/断言、补齐两个变量的原入口日志 `archive-guard-explicit-environment.log` 已自然 **3 文件 59/59 PASS，108.21 秒**，支持当前归档准入/claim/账本相关回归通过；这不是拿 T1209 旧 59 项冒签当前结果，也不改变本次 reconcile FAIL。|
|LED-018|宏同时串抖音 CDP/启动安全与 Rust Windows 检查，涉及本轮导出文件，不能笼统说整宏与范围无关。当前两旧文件 600 秒外层 158/158 PASS 已覆盖其 CDP 部分；宏内 Rust/Windows 的真实失败原因不在完整日志中，仍归 T1204 调查，不能签整宏 PASS。|
|LED-053|本轮产品预算未改；当前静态 27 项失败均位于五文件之外，下载真实消费者及长预算原导出回归已保留，不能把聚焦通过代签静态门或全部公共链。|
|LED-042/054/058/057|命令分别覆盖雷达分页、其它执行/宿主 I/O、模型续跑及 Windows 目录复用，未给出本轮五文件或四任务的具体失败断言。T1210 真实消费/拒绝/unknown/新 fence 聚焦证据及 T1213 进度竞态证据已另存；宏内部缺展开仍由 T1204 诊断，不虚构各内部用例通过或逐项旧基线一致。|

限定收口结论 **PASS**：在当前独立实现、真实隔离回归、原导出完整预算回归、补齐原环境的归档 guard 与新安装公共采集链证据成立的前提下，本次完整输出未提供本轮新增的具体代码缺陷或验收断言失败，可将上述全局失败如实挂到既有 T1204 诊断范围，当前修复任务按原 `taskctl` 收口，evidence 必须明确保留 **reconcile exit1 / 27 ERROR**、未展开的 LED 内部根因及 T1215/T1216 等已登记既有失败。此结论是本轮任务范围判断，不是旧 27 项完整基线证明，不签全局 Gate、Task Packet 或全部原归档内部路径以外的成功。

末次退出结果补证：父任务已保存原 guard 当前候选的自然 **exit0、59/59 PASS、无 skip**，两个变量均显式指向 55422 隔离 PG，与上述实际日志统计一致。没有发现本轮范围内阻断，可按已限定 evidence 用 `taskctl` 完成 T1210/T1212/T1213/T1214；T1204 全局 FAIL 及 T1215/T1216/T1196 未修状态继续保留，不将此 59 项通过扩称其它 LED 宏通过。

## 2026-10-11 验收列适用性独立复核

结论 **PASS：T1210/T1212/T1213/T1214 为非产品 UI journey 任务**。已重读四份 SPEC，它们均未包含 `frontend-journey-contract`，要求的是服务端消费、租约/归属、固定机械进度、外部平台浏览器自动化和实际安装公共链证据。T1210 的原三产品路径均在 backend；当前 `e5cdb4406..a091de271` 实际产品增量仅三个 backend 路径和两个 `frontend/src/server` 路径，没有 CreatorOS 应用页面、组件、布局或交互 journey 修改。T1212 增加的阶段消息通过既有 progress 合同回写，未修改应用 UI 消费组件。T1214 的隔离 Chromium 静态外部平台页面验证可信点击和自动化，不是 CreatorOS 产品 UI 两 viewport 旅程，也不能冒充其报告。

已核 `taskctl.mjs`：验收列为“待验”时会把 `--evidence` 作为 frontend report 路径验证；列为“—”时仍检查所链接 SPEC 是否含 journey contract，实际有合同就拒绝完成。本轮失败来自初建适用性元数据误标，不能伪造 UI report 解决。沿既有 `DEC-T1201/T1202-001` 的适用性校准规则，可先追加本次 DEC，仅将这四行验收列由“待验”校准为“—”，不手改状态，再用原 `taskctl complete --evidence` 记录真实审计事件。

该校准只纠正 UI journey 的适用性，不降低四份 SPEC 的既定回归、安装见证、原权限/预算/归属或真实错误记录要求；不得改 validator/Gate/guard、测试断言、旧 receipt 或造 UI 证据。原 taskctl exit1 和未改状态事实、完整 reconcile 27 ERROR、T1215/T1216/T1196 未修及真人 modal 控件未观测等边界继续保留。本复核仅追加本记录，没有编辑 BACKLOG、SPEC、DEC、代码或任务状态。
