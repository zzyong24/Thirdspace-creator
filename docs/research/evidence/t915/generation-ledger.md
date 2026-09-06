# T-915：共享结构化生成账本服务

日期：2026-09-06。基于 `51eb4814`；T-915 仍在 BUILD，完整迁移未完成。

原宿主只能准备选题、定位输入。本次接通私有命名端口、首次准备持久化、专属模型身份、子调用账本与宿主候选重建。真实 Worker 的执行函数和自动恢复分类还未接入，因此仍不声明 chat.structured 能力。

```mermaid
flowchart LR
 A[真实父工具与原账号] --> B[持久保存第一次生成准备]
 B --> C[绑定专属模型]
 C --> D[用已确认回执重建下一请求]
 D --> E[统一账本预留、启动、结算]
 E --> D
 E --> F[宿主重建候选，等待采纳]
```

## 实际改动

- `execution-chat-generation.service` 共用两种结构化节点，不能请求任意模型能力、参数或候选对象。
- 从真实聊天映射、父工具声明和当前回合取得参数。宿主授权后使用 nodePreparations 缓存第一次节点输入、候选锚点、前采信息、输出上限和原 Skill。后续不重读作品生成不同请求。
- 私有凭据按真实账号、任务和节点能力解析；子模型 identity 继续绑定模型/端点/协议配置，密钥不进入持久化准备。
- `/model/n` 是逻辑序号；同序号明确拒绝的重试单独记录 retryOfCallId，不冒充下一次修复。已确认回执由原 runStructuredNode 无网络回放，逐字段比对真正下一请求，保留原预算。
- prepare/reserve/start/settle/complete/fail/restore 及凭据端口已挂到 dispatcher 和受控 IPC；结算端口支持停止后的幂等记账。没有 Worker 模型 execute 回流宿主。
- 完成时只消费完整回执，由原 normalizer 生成 topic.card / positioning.suggestion，父回执与流式投影仍经原后端服务。没有新增领域采纳写入。
- `modelFor` 与回放共用结构化协议选择函数，避免自定义 openai_chat 默认文本模式发生漂移。

## 当场发现并修复的恢复漏洞

独立审查指出：已成功模型前缀之后，修复调用明确拒绝并成功挂起；若挂起 ACK 丢失，通用迟到 unknown 会绕过旧“全部子调用 rejected”保护，将父工具污染为 unknown。

新增真实账本测试在修复前确实失败，父工具变成 unknown，见 `generation-ledger-prefix-red.log`。修复扩展已挂起保护，接受有效供应商回执且计量完整的 settled 前缀与尾 rejected；不接受 reserved/started/unknown/损坏前缀。修复后测试继续经过 resume、重新 claim、原逻辑序号重试，产生最终候选且准备只执行一次。

## 验证结果

- 新服务缺实现红测保留在 `generation-ledger-red.log`；另有上面的实际行为红测，二者不混称。
- 共享生成服务、原 hooks 服务、调用账本、dispatcher、真实开场 Worker：**109 passed / 5 files**。
- provider-factory、provider-identity 与无网络回放：**32 passed / 3 files**。
- 真实 SDK 对本地 HTTP 供应商发送结构化节点请求，通过新共享端口结算；重建节点后 HTTP 总请求仍为 1。此为本地供应商协议测试，不是商业上游验收，也不是新结构化 Worker 子进程验收。
- 覆盖选题与定位两个分支、前采候选身份、原生结果、协议拒绝后文本降级、伪造请求、跳号、未知/普通拒绝不能完成、错误结构与伪造候选拒绝、并发同键预留、鉴权恢复、成功前缀后的修复恢复、取消后禁止启动、跨任务父调用。
- 新真实 HTTP 测试初次失败源于测试未模拟 IPC 的 JSON 序列化，修正测试边界后通过；没有修改协议来允许 undefined。后补的准备端口完整性检查让旧能力缺失 fixture 在启动 Worker 前被拦，fixture 改为合法但不应被调用的 prepareGeneration spy；仍验证真实 Worker 的能力声明、零凭据、零模型、零调用账本。定位测试初次把提交 RequestContext 当成执行 RequestContext，已改为验证真实 execution requestId/source 和原 user/account。
- backend 与 ai-worker TypeScript 通过。boundary 仍 5 条既有违规；orphan 0 error / 100 warning。pmem sync 已执行；reconcile 实测 **211 errors / 1 warning**，仍是全局对账失败，未声明全绿；最终原始日志随提交留存。
- 独立只读 `/root/worker_review` 找到上述阻断，修复后复核未发现新的具体 blocker；审查者未运行测试。

## 尚未完成的接线与完整范围

真实 Worker 调用这些端口、成功/拒绝前缀的自动 checkpoint/scheduler 恢复，以及坏结构回执的明确失败投影仍待完成。目前坏结构不会产生伪造候选，但不能据此宣称其用户可见恢复已完成。实际 Worker 不广告 chat.structured；未切换生产 /api/chat，也未减少完整场景未迁工具清单。

T-915 所有 R-05 入口迁移和旧路径退役、同条件性能验收、真实商业模型及 macOS/Windows 分发包仍待完成。没有 taskctl complete、push、发布或用户数据改写。

工程门卫要求精确文件哈希。本次在既有 DEC-RUNTIME-055 / R-02 范围内重新绑定 supervisor 的复杂度记录，并登记本证据文档的 IPC 术语标记；未扩展拓扑或授权范围。
