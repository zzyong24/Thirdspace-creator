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
