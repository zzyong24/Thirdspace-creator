# T1335 后端边界结果

同套 60 项 GREEN 全部通过：staging 16、原 Pi 10、native 34，0 skip。原始执行 exit0 / 86.2239645 秒；完整 backend 类型检查 exit0 / 51.0979 秒。4 个 registered PID 实际身份均为 null，remainingOwnedGroup、cleanup、afterInputDrift 均为空。外部供应商模型与 worker 执行均为 0；本结果为真实服务组合边界，B 的完整 worker 公共链单列。

原 RED exit1 / 121.2398 秒，60=53 PASS+6目标 FAIL+1夹具 FAIL。目标是当前真实 record 合法族被拒，以及 5 种显式错误 callId 在 started 被接受。foreign-evidence 原夹具把外键改为不存在的 execution，未到来源门；原输出及原源码完整保留，Root 准最小修为先建立真实另一个 owned execution 后迁移该证据，再由真实来源门拒绝。未删外键或放松正向/负向断言，没有重拍旧 RED。

新增当前正例由实际 bindCodexCall / recordCodexToolCall 写原完整事实；缺 callId 旧族明确以历史形状装配。stage、证据、tool settle、ledger settle、checkpoint、commit、并发 confirm、知识及修订读回和原回执幂等均调用真实服务；外部模型 receipt 为 worker 四字段的合成 I/O。纯组身份和清除未使用的初始 native-tool 是测试装配事实，非产品运行行为。具体 60 名字及实际状态见 GREEN_CASE_RESULTS.json。

record/canonical 的正确、缺省、foreign/null/异型/empty 归属，精确 map key/tool id/name/input 字节、重复 canonical，以及未结算/晚到/跨 execution 的证据反例均保；原 staging 与 Pi 测试逐字未改。只有 native 测试有授权改动；唯一生产 service 由 B 实现，R 未写生产。

首 backend type exit2 / 61.6955 秒是新增联合类型缺判别，原日志保留；增加硬 kind 检查后 type-v2 exit0，再于最终 service+FK 夹具状态完整 type0。GREEN 输入锁以 RED 实际 after0 为未改项基线，仅登记 B service、已准 test 及新增量 helper；执行 wrapper 前后完整核 35918 文件 / 455 链接，均无漂移。独立 cache/TMP 在授权 T7 owned 根，所有 DB 为内存，不连接用户库、修改共享 dist 或续任何持久任务期限。

Root 已实际读取 GREEN 原结果、全部测试名、清理及最终 type，接受本边界 GREEN。源码/依赖读窗已 RELEASE；测试保现字节，不替代最终包或 U35 新真实策略链验收。
