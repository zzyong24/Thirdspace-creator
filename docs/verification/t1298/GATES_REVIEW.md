# T-1298 构建与门禁复核

当前验收源码：`8dbccad6a`；生产修复提交：`b6ef3314f`。后续提交仅修改一份E2E测试，在窄窗刷新后点击真实“打开编导”入口，再继续校正，不改生产代码，原单元/构建Gate可复用。本文件复核已有实际日志，不启动浏览器、不重建 Worker 或 Next 产物。产品流程技能与项目版本均为 `3.29.0`；BUILD当前任务和受影响两项任务已实际完成，未将此范围扩张为全局阶段通过。

| 检查 | 结果与证据 | 证明范围 |
| --- | --- | --- |
| Worker适配器、外部调用与ACP回归 | PASS：8文件176例，`logs/worker-green.log` | 工具直连及原边界的隔离回归 |
| 配置读回负例 | PASS：1文件36例，`logs/config-negative-final.log` | 额外项、重复项等配置拒绝边界 |
| 前端Provider、文章/图文port、候选及首次挂载 | PASS：6文件100例，`logs/copilot-final-green.log` | 真实组件装配与并发/卸载保护；不代替真实模型旅程 |
| Worker构建与类型 | PASS：`logs/worker-build.log`、`logs/worker-typecheck.log`；主会话实际执行退出0 | 正常构建与类型检查 |
| frontend生产构建与类型 | PASS：`logs/frontend-build-final.log`、`logs/frontend-typecheck-final2.log`；主会话实际执行退出0 | 最终修改后的构建及类型检查；`frontend-typecheck-final.log`为空文件，不作为通过证据 |
| 物理边界 | PASS：`logs/boundary.log` | 无新增违规；原5条基线仍保留 |
| 超时规范 | PASS：`logs/timeout.log` | 静态2836文件无失败及门内消费者回归；未单独实测ASR或生成图片 |
| orphan | PASS：`logs/orphan.log` | 0错误、100项既有警告，不能写成零警告 |
| LED-047 | PASS：8文件174例，`logs/led047-final.log` | 主会话poll会话41603实际退出0；复核者只读日志 |
| LED-055 | PASS：backend3文件61例、worker3文件68例，`logs/led055-current.log`和`logs/led055-worker-green.log` | 原完整门worker失败后，仅修原四参数断言缺少本轮第五参数true；backend未变复用61例，主会话poll37493确认worker退出0 |
| LED-061 | PASS：5组共379例（23+124+72+132+28），`logs/led061-green.log` | 完整`node docs/verification/t1073/verify-resource-lifecycle.mjs`重跑；主会话poll21030实际退出0 |
| 全局reconcile | FAIL原样保留：33错误、0警告，`logs/reconcile.log` | 源码修改期间的完整取样，不能将后续局部门通过改写成完整门全绿 |
| 当前公共真实模型旅程 | PASS：`prepared-e5d626b5ff97ae2d/result.json`、`strict-run-result.json`与`content-review-checks.json`，四轮真实Codex均采纳/精确/刷新通过；测试和owned宿主均退出0 | 1536/1280宽度公共路径；4209源码/产物哈希无变化；内容与视觉复核已完成 |
| T1298正式完成门 | PASS：taskctl实际再次运行四轮，`prepared-78ec5dfefb16c9e9`，test0/shutdown0/4209无变化；receipt`1f86f42c65e8` | 当前源码重新执行公共旅程，四轮第二次逐字/投影核对，`FORMAL_RESULT.md` |
| 受影响T1294/T1296回归 | PASS：各首次与正式门均10项/2项通过，receipt`84a45cc08b08`/`e78e5852a1d7` | 真实Codex对话；平台保存及全高剪辑助手采纳/刷新/MP4；未覆盖原生App或ASR/生图 |
| pmem sync | PASS：`logs/pmem-sync-closeout.log`，退出0；先前同步日志保留 | 三项正式完成后PROJECT @8dbccad6a、边界原5基线、codegraph已刷新；未改BACKLOG/events |
| 最终静态receipt核 | PASS本轮范围：`logs/receipts-final-before-commit.json`，退出0 | 三任务✅、实际verification_executed、前端错误0、本轮审核错误0；20项既有审核错误保留 |
| 派生progress同步 | FAIL既有入口阻断：`logs/progress-done-final.log`，退出2；原`progress-generate.log`保留 | T1111 unsafe write_set在全模块预校验拒绝；未绕门手写派生状态，T1292/T1083跟踪 |

## 红测与失败归属

`adapter-red.log`是动态工具直连缺失的行为红测；`adoption-red.log`包含采纳误报及候选预览的失败；`copilot-mounted-editor-red.log`是稳定Provider及编辑器port后首次挂载聊天应发送1次却为0的有效红测。后者还保留真实卸载为0通过。修复后的最终前端100例通过。

`adoption-test-syntax-failure.log`是测试编写错误；早期Copilot重挂port或未触发根StrictMode重放的夹具失败不算有效TDD红测。所有原日志保留，不追溯制造通过。

`led055-current.log`、`led061-current.log`首次失败都命中本轮新增参数后未同步的`worker-runtime.test.ts:537`断言，属于本轮修复项，不能归为历史欠债。补齐精确第五参数`true`后，分别由worker68例及完整LED-061门证明恢复。

## 全局差异与当前待验

完整33项中29项身份与T1296记录的既有基线一致，由T1292继续跟踪；新增4项是T1294/T1296前端receipt代码漂移与LED-055/061。逐项清单见`GLOBAL_RECONCILE_COMPARISON.json`。不重写原33项日志，也不冒称重新跑出29项完整门。

2026-10-15 20:02（Asia/Shanghai）只读调用实际`auditReviewReceipts`得到20项既有审核错误，T1294/T1296/T1298审核无新增错误；`auditFrontendReceipts`返回空数组。但是T1294/T1296当时已回到进行中、验收待验，空数组只证明没有已登记的失效PASS，不能证明新的旅程receipt已完成。须等公共旅程实际执行及taskctl完成后再核。

正式完成后再次只读核定：T1294/T1296/T1298均✅，receipt和完成事件相符且都实际执行旅程；前端receipt错误0，本轮审核错误0，20项既有审核错误仍在原29项身份中。新增4项已闭合，原完整33ERROR不改写。不宣称全局suite重跑全绿。

未安装或验收用户现用App，不部署；ASR、图片生成、图文第二页视觉及原有键盘欠债按报告保留。派生progress未更新，不等同canonical任务未完成。
