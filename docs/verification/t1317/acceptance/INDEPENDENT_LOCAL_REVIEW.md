# T1317 独立本地结果审核

审核者 `/root/sol_daily_implementation_current`，GPT-6.1 Sol/high。仅核实际 diff、冻结原件和 SHA，未运行测试/HTTP/模型、读取数据库/raw log/凭据或修改生产。Root 授权的唯一 W 为本文件；本文件不在 R 原冻结 210 项索引中，不改写该索引或结果报告。

结论：未发现本轮三源修复的新增产品阻断。完整公共受控链 1 PASS、后端原服务组合 6 PASS 与类型/边界/语义原退出一致；空 capabilities 的原夹具 FAIL、兄弟依赖及 Gate 记录器的前置绑定限度保留。共享 timeout Gate 待 C，本审不签新候选/真实供应商/父矩阵或全部验收完成。

## 实际绑定

| 工件 | SHA256 |
|---|---|
| workbench-public.transport.ts | `1a88067966b0e1c3528d9a2515af30597afe65b8d9dc337ea50cbbceaeceb8b8` |
| workbench-plan.service.ts | `6fd142b05bf00aa8875db24005b18c7295a8721c92164e62f5bc19eb26c0cc83` |
| workbench-public.service.ts | `d8dab91705829b6a994b4ef862c1f948a974e2dfe2867adb6bce8988a5c8d57b` |
| workbench-public.test.ts | `7f2afd4c334fe4b3947446be1b930772b4288472907a760307b7336650975fa8` |
| group-workbench-inspection.persistence-client.test.ts | `0c0101dabad1b5f791a9ce1353379b4af3f1d4f6bf5ff6f0077fe17d0f95bea1` |
| docs/verification/t1317/IMPLEMENTATION_RESULT.md | `da19b0fe3e8dd4787fabb49ddd5494f048788c63cf661e7ab7f3dac5f73ebabb` |
| docs/verification/t1317/runtime/OUTPUT_INDEX.json | `bfcce30e2d8b39ca26a27a377ceb045b59e81555e5e5dc6ea5b9339f70ba51bf` |

前三源及后端 test 位于 backend/src/modules/execution；新组合 test 位于 frontend/src/server/__module_integration__。五源与最终 manifest 逐项匹配；索引 210 件全部 bytes/SHA 匹配。red-v1 / green-v1 / green-v2 前快照分别 42/43/44 件，全部原件匹配。

## 实际 diff 与权限范围

transport 仅给原纯组 inspect/events 增加入口资格。capabilities/modelCalls 原合同保持；artifact list/read/render/reconcile/files 未增加纯组资格。原 ctx 认证与参数/响应 schema 保留，events 仍委派真实 stream.read 的原授权/分页。

plans.read 先调用原 persistent tasks.get 证明可读任务，再按该真实 task 的 user/group/account（含 null）精确查原行；inspect 的冻结 source/tools/capabilities 查询也使用已授权真实 tuple。页面筛选账号不能替代任务 owner，也没有放宽通用 workspaceFilter。只读 lookup 没有引入新写、恢复权、凭据或完整 payload 输出。

原账本分页、模型正文不公开、工具结果/参数截断、旧错误语义和摘要路径未改。没有依据业务名称猜权限或改变原 stream、费用、期限、UNKNOWN 政策。归档读遵循原 tasks.get，当前没有新的归档公开族执行证据，不能追签。

## 完整公共证据与真实 0

- red-v1 自然 exit1/24.345s：真实 public create→prepare→dispatcher→immutable worker→SDK/native 协议替身→ledger→候选和任务 succeeded 后，inspect 在真实 public transport 首门抛“当前账号不存在”。没有进入后两 SQL，不将它们追认为原请求首错。
- green-v1 自然 exit1/24.372s：source、tools、plan 已读出，测试错误要求真实空 capabilities 非空。原失败保留，不算产品新失败。
- green-v2 自然 exit0/40.061s，1 PASS：同一个原 task 在纯组及同组合法账号筛选下 source/message/plan/tools 完整一致。两种 scope 的调用各 4 页/4 calls，事件各 8 页；实际末页 hasMore 均 false。真实冻结 tools 为 48，capabilities 为 []，planRevision=1/steps=[]。计划由原真实 service.save 产生，不是手填成功行。
- 实际 foreign group、foreign user、错误 legacy account、缺任务分别对 inspect/events 共八项 OwnershipError；纯组 artifact/reconcile 前门仍拒绝。公共结果不含 fenceToken/apiKey。
- backend-public-v1 自然 exit0/38.934s，6 PASS：原五个测试保留旧读取/隔离、分页/有界结果/模型正文与供应商配置不公开、未知工具参数及异常 proposal 诊断、指定任务对账唤醒。新增第六例在明确受控原 service fixture 中提供非空 capabilities/tools/source/plan，验证原样读取与 payload/fence 不公开。这个 fixture 不代签公开业务链出现非空能力，也不是模型生成链。

新 public 主链仅替换外部 Codex CLI 协议与可用性边界，真实 prepare/dispatcher/worker/节点/ledger/完成服务没有 stub；0 真实供应商模型不等于 0 native turn/call。不接当前候选 HTTP、不重发旧任务，也不将本地受控结果当新包真实模型验证。

## 兄弟依赖与 Gate 记录限度

本任务 RED 的 mixed 前段实际依赖 T1320 修后 projection SHA `33168684e7b3a74504d6d446e99038239c1580c0e9187f2582e4dd4da6ee4da9`（产品整合 26372553e）。因此不能说固定旧包 0e1dc622 本来能完成该前段。它不在原 33 项输入锁中，T1317 独立 before 快照没有补存这一额外依赖；依赖由已先冻结的 T1320 manifest/原件及 Root 当时交叉核对、后续 SIBLING_DEPENDENCY_BINDING 明确，后者不能冒 RED 前新增快照。本审保留这个边界，不补拍。

实际 backend type-v1 exit0/67.071s、frontend type-v1 exit0/73.411s、boundary-v1 exit0/1.825s、semantic-v1 exit0/1.270s 与原收据一致。原 gate runner 复制后 sources 字段仍列额外 T1320 源与最终 frontend test，没有列 T1317 三生产源；不能声称每条 Gate 都独立保存了本三源的运行前 SHA。三源与此前 green-v2 快照及最终 manifest 字节相等，是已有交叉绑定证据；原记录没有追签改写。报告已披露该记录器缺口。

共享 timeout-policy Gate 仍按 Root 统一安排由 C 最后独占执行，本审不代跑、不自填通过。没有新包、真实供应商、原 UNKNOWN 恢复或性能结论。

## 清理和交接

R 原记录的 12 个 fixture 审计 PID 均不存在，各 case host.stop/dispose 收据保留，自有 DB 磁盘仍留存；本审只读核原件，没有发信号或碰 C controller。原秘密特征扫描的零命中有方法限度，不能当任意秘密不存在的证明。

本文件只核局部已发生结果与上述限制，未修改 R 源/测试/报告/index、控制或任务状态。最终写权以消息明确 RELEASE；正式整合与共享 Gate/新候选验证仍由 Root/C 控制。
