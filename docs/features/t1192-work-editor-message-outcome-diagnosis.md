# T1192 核对作品精调公共链的消息结果断言

用户要求全功能可用性验证，发现问题立即建任务并修复。T1191扩大到真实后端submit/lease/worker/账本/完成消息/原owner公共链，当场50.852093秒exit1，四文件11 PASS/4 FAIL。两个联合创作用例在work-creation-chat.integration.test.ts:104严格解析消息output时拒绝__creatorosOutcome，已有T1092负责，保留原任务和范围。另两个Pi/Codex协议精调用例在chat-work-editor-worker.test.ts:110期待完整消息output等于候选；日志可见真实output含__creatorosOutcome。原日志SHA267b6238360e59d74dec23f43279a9ec859dac187f8064dea221fb3bf2e38043，完整原字节与receipt归档本任务。

当前只读诊断：核真实工具结果合同、账本保存、完成消息投影、前端候选消费者和可信回执解包，不凭额外字段就判旧测试错误，也不假设长候选内容完全相等。T1191唯一产品写集为前端copilot，未改变此后端公共链；精调与联合创作的测试和保护目前均未改。须明确原消息与候选正文的分层，以及原owner采纳、长正文完整性、零自动落库、同task/source/lease与可信结果状态。

若来源证明原测试未按已确认可信回执解包，先补精确SPEC并独立审核后只校准该断言，同时保完整候选相等与可信回执检查；不得用删除字段、objectContaining宽松匹配候选、放宽schema或移除__creatorosOutcome来洗绿。若正文或receipt真实有缺口，按实际契约修产品，不混同测试校准。不改执行预算、source/父任务/组/member/fence/取消/unknown保护，不启动真实模型、用户App/库、发布或第三次上传实验。

原11PASS/4FAIL保留；T1092两例失败和T1188/1189及全局欠债不由本任务代签。任何自身完成必须有完整原公共链、可信回执与原owner反例、类型/边界和独立实施复核的当场收据。当前根因仍待来源诊断，任务未实施，不声称公共链或全功能通过。

```mermaid
flowchart LR
 A[原工具候选] --> B[完成消息携带可信回执]
 B --> C[两个精调完整相等期待失败]
 C --> D[核正文与回执真实消费者]
 D --> E[独评后精确修复]
```
