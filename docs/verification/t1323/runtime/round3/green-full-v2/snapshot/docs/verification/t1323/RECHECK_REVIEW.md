# T1323 独立复核

审核者：`/root/sol_daily_implementation_current`，GPT-6.1 Sol/high。Root 明确授权本文件；保留原 `INITIAL_REVIEW.md`（SHA `2ac9e64786ebe3f18765fee546743583d0c33f772340b0a7503e6a6e6a2ab4d7`）不覆盖。仅只读源码、原证据和修订文本，没有测试/HTTP/模型/数据库/raw log/凭据操作。

## 本次实际读取绑定

| 输入 | SHA256 |
|---|---|
| SPEC | `ba137d0729b46c31f48c63918cb78fc4524fa828971cba77dd2dbe8a4610f03c` |
| ANALYSIS | `49a5aee391a010baacdbcb5a1e8539d5799ade1c3cadf3d8ddb955f89d04feb3` |
| backend/src/modules/execution/execution-checkpoint.service.ts | `fccafb9872cae58a293d6883d20b649eb33914860a5c5a349666593200cf29ae` |
| backend/src/modules/execution/execution-lease.service.ts | `3aa4f15dbe1039adf0f031f35f7e545c63d909ad42c706361efbc6e429340cb0` |
| backend/src/modules/execution/execution-call-tree.ts | `f7199e6960648d1e8ffd17e6b4e08c6ab23a1a95f94308f41b084d010311f879` |
| backend/src/modules/ai/external-chat-call-tree.ts | `92cf1becdc4e897755879d875eaa0e2273f815e8f531dc52b3e6563cfd544b78` |
| backend/src/modules/ai/external-task-tool.service.ts | `b4fa4407eaf2c9cd788b5de85cf6b309c442b7ba36a4edb37dda0c9908e84b58` |
| ai-worker/src/execution/external-chat-worker-run.ts | `49725da1f9c2b8dff298470ccb9b178a63b891bb83b195afb026ab504ce61996` |
| ai-worker/src/execution/codex-native-turn.ts | `cde306b3311304239e6e02a4ce9adf9d8a1aab4c56efd91d26f2576ccbdebc8e` |
| ai-worker/src/execution/external-chat-recovery.ts | `88e3f8476ad9e9f58df062342e71256ad8c9432c7cba9f61c61d81ef0a231363` |
| backend/src/modules/execution/codex-read-recovery.ts | `258399f3529c963ac89d0fa93e65e35a6ccc35d26fd753de639216601e1221c3` |

这些是本次实际只读计算的 SHA，尚不是 C 已建立的正式 input lock/工具评审收据；没有把未来 source、immutable worker 新快照或 RED 写成已发生。

## 原 findings 复核

| finding | 结论 | 真实修订与源码核对 |
|---|---|---|
| REV-001 major：保护活跃窗口和目标拒因 | resolved | 新 SPEC 明确在真实完整调用账本已建立、原公开 resume attempt2 仍 running/admission 有效且最终 commit 前注入；先未污染读取成功，每项核目标中文拒因/来源、保前后账本、恢复 exact rows 后基线再次通过并最终 commit。无法命中则缺测，禁止以 succeeded 后租约拒冒树保护。这直接消除了初审所述任意 Error 假绿路径。 |
| REV-002 minor：真实 v2 consumer 来源 | resolved | 新 SPEC 将 external-chat-worker-run.ts:70/:144 和 codex-native-turn.ts 明列 read-set；ANALYSIS 明确旧 external-chat-recovery 不能代签 v2。本次实读 recoverRoutedChatChildren：只解析既有恢复名单，restore 原 callId；text child 再解析原 resolveChatGenerationCredential，不借主 root Codex spec；随后原 native read，不要求 recovery=ready 或 null token=0。 |

术语小校准：ANALYSIS 写“:144 按 executionEngine 选择”，实际该处条件为 `input.modelRoutingVersion === 2`，外层另核 executionEngine=codex。以上按真实源判断，不能把路由版本与引擎字段混同；请 C 正式化锁前机械校准该一句并绑定实际字节。这不改变本次两项关闭结论、生产单源范围或产品方向。

## 具体范围与完整链判断

单 checkpoint 源是可实施最小范围：先在严格冻结 Codex native 分支证明完整树/原 root/原定义与参数来源，再将角色传给两处 checkpoint 分类消费；通用 partition、worker、ledger、projection 均不改。普通 refs 前缀与完整 calls 的 pending/unknown/计费/预算事实保留，不能按 kind 先过滤、直接丢 Host 行或改 recovery 值。

新完整公开受控 RED 和 GREEN 必须由真实 public prepare→dispatcher→immutable worker→真实端口/ledger 形成完整树，再停自己 worker、原公开 resume attempt2、原 thread/read、最终原 commit。供应商 native RPC 才替身，0 真实模型；最终需唯一候选/卡/assistant/finish，原 turn/start 计数、ledger/费用不增加，原成功与原始失败均保留。保护窗口和具体拒因在修订后充分明确；实际实现与测试仍需终审，不能只凭 SPEC 签通过。

无新增语义阻断，原两个 concerns 已由修订解决；正式 source/input lock、真实工具评审结果、packet/lease 和执行 START 仍由 Root/C 控制。本文不授生产权、不签 T1323 已实施/全保护/真实供应商/新包/父任务完成。原 T1320 恢复 FAIL 与旧825 UNKNOWN 保留，未重发或修改。

本文件完成后单文件写权以消息明确 RELEASE。
