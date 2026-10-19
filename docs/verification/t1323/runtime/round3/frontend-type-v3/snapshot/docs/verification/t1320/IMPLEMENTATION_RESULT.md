# T1320 本地实施结果

已修复真实 Codex 混合回合中 Host none 输入早投影与普通 worker 输入前缀互相误判的问题。受控完整目标链已成功；本任务不声明整体验收 PASS：原生恢复保护仍在现有 checkpoint 层失败，未进入本次投影代码，已交 Root 按独立 T1323 处理。真实新包、供应商模型和原 chat824/execution825 未重跑或重发。

## 实际改动与绑定

仅生产 `backend/src/modules/execution/chat-tool-stream-projection.service.ts`，SHA256 `33168684e7b3a74504d6d446e99038239c1580c0e9187f2582e4dd4da6ee4da9`。唯一新组合测试 SHA256 `a5ecf2558bf1d40fa61e4407c4f3b7b5f88e1a76a27bebae3d6d080cc2fa28fa`；路径与字节见 runtime/FINAL_SOURCE_MANIFEST.json。旧产品其他源、SDK、账本、恢复、合同均未改。本次源 diff 31 行增加、4 行删除。

按真实单 root 调用树验证所有已存输入：普通输入保持原顺序前缀及逐字节一致；Host 输入必须有同 root 唯一 external_tool、可信冻结定义、原参数 digest/proof 与真实回执。未知、重复、错 root 等仍拒绝。补齐普通输入时保留既有混合流顺序，proposal 仍只在原终态事务投影。不吞冲突、不改变费用、usage、授权、fence、期限或 UNKNOWN。

ensureInputs 的事件读取限定为“本 task 的当前 root 事件或全部 tool-input-start/available 事件”，保 foreign-root 输入污染检查与 sequence 排序，避免反复读取其他工具的大输出。未改全局历史读取。

41 项原锁在首次执行前逐一核 SHA/bytes，0 漂移，见 INITIAL_INPUT_VERIFICATION.json。每次运行前保存全部锁源、测试、配置、原生替身、runner 与 immutable worker 完整字节。worker 固定 5618216 bytes / `3851b4fb132035f1b03528d68b0fa1c5ab86bda8134d8b98795252295c5a6454`；无 build/dist 写入。自有 PGlite、媒体根、空 CODEX_HOME，外部仅原生 Codex JSON-RPC 子进程被受控替身替换；真实公开提交、prepare、dispatcher、worker、SDK、节点、ledger、projection、最终 commit 均实际执行。0 真实外部模型不等于 0 调用：每场有真实合成 root/child turn 与调用账本。

## 原始运行与覆盖

| 原 run | 自然结果 | 实际含义 |
|---|---|---|
| red-v1 | exit1 / 23.002s | 路由夹具误选未提供 vision 能力的 Codex，业务前拒绝；不是目标 RED |
| red-v2 | exit1 / 28.224s | 有效目标 RED：Host system.features → 普通 topic.generate；完整 usage/ledger 已结算，completeChatGeneration 后置 ensureInputs 首抛“工具输入卡与模型回执不符” |
| green-v1 | exit0 / 29.391s，1 PASS | 同目标完整公开链最终 succeeded；候选、两类输入输出卡、assistant 与 finish 正确 |
| green-protection-v1 | exit1 / 136.775s，5 PASS / 2 FAIL | 反序、多次交错、proposal 前后、同 key 重复及终态重放通过；integrity 为 callIndex 唯一约束夹具错误，recovery 为错误期待自动恢复，均保原 |
| green-protection-v2 | exit1 / 53.279s，1 PASS / 1 FAIL | integrity 真正通过；原公开 resume 的恢复仍在现有 checkpoint 失败 |
| backend-type-v1 | exit0 / 64.270s | 最终生产字节类型通过，测试当时为保护 v1 字节 |
| frontend-type-v2 | exit0 / 55.404s | 最终源与最终测试类型通过；此前 frontend-type-v1 exit0 / 71.659s 亦保留 |
| boundary-v1 | exit0 / 0.316s | 原命令 `node orchestrator/process/boundary-scan.mjs --quiet` |
| semantic-v1 | exit0 / 0.352s | 原命令 `node orchestrator/process/semantic-boundary-scan.mjs` |

实际不同场景共 7 个成功、1 个恢复阻断。类型命令为 `pnpm --dir backend/frontend exec tsc --noEmit --incremental false`。所有执行记录和原 stdout 在对应 run 下，不合并失败为全绿。测试预算 3600000ms、hook180000ms、外层86400s、retry0、单 worker；未缩持久任务期限。共享 timeout-policy Gate 按 Root 统一安排由 C 最后独占执行，本报告当前待引用，未冒已通过。

integrity 在真正完整链终态前受控改变原件，逐项验证参数字节、toolCallId、other-root 输入、重复输入、陌生输入、重复 external call、digest、proof.callId、普通输入前缀顺序及错误 fence 均拒绝；之后恢复精确原行，真实最终 commit succeeded。见 cases/green-protection-v2/integrity/integrity-proof.json 与前后快照。proposal 两族原终态前无卡，终态后唯一输入输出；重复调用/重复 commit 不新增卡、ledger 或 native turn。普通 topic-only 对照沿既有 T1310 受控原件，不将缺 usage 族充成本 RED。跨 user/group/account、取消与费用门源码未变，本轮未逐项新公共执行，不能追签新覆盖。

## 恢复限制与原现场边界

恢复场景真实停止本 harness 拥有的 worker，原 root 保留 thread/turn；首次 unknown_result、自动 drain 0 claim。随后仅调用原公开 resume，attempt2 的 readCheckpoint 首抛“内部模型调用的父工具归属损坏”。真实父树是 external_agent(root) → external_tool，另有 tool(root) → model，全部由生产端口建立；external-task-tool.service.ts:73 与 external-chat-call-tree.ts:16–33 明确支持，而 execution-call-tree.ts:9–13 的通用 partition 只允许 model 子项，checkpoint:111 先拒 Host 子项。见 RECOVERY_LIMITATION.json、恢复 after-drain.json 及原 RPC；未增加 native turn，未到新 ensureInputs，不能宣称恢复成功。Root 已确认另立 T1323，当前不越生产 W 修复。

本次新 RED 的具体首断言已经确定，但旧 825 只有安全 port/category 事实，未补出原断言；因此不认定原现场首因已证。新包真实混合聊天待验，未操作旧 UNKNOWN 任务或用户数据库。

## 安全、资源与交接

实际独立扫描 26578 个保留文件，高置信私钥/API token/Bearer 特征 0 命中，见 SECRET_SCAN.json；不将模式扫描称全秘密证明。任务 fence 快照为 SHA256。逐 case host.stop、persistence.dispose 清理收据均保留；独立检查 52 个由本 fixture 审计记录的原生 PID 均不存在，见 RESOURCE_CLEANUP.json。自有 PGlite 磁盘目录保留作隔离产物，不宣称已删盘；未触 C 两个 controller、现包、配置或认证。

OUTPUT_INDEX.json 覆盖报告、受控原始 JSON/log、全部运行前快照、runner/fixture 和最终清单；可再生 cache 与自有 PGlite/临时目录不列作提交证据，排除规则明确写入 index。交 B 独立只读审核；本地修复目标已通过，整体任务、恢复与新包验收未签 PASS。未 commit、未改任务状态或控制记录。
