# T-915 供应商任务号持久事实

素材 Worker 的视频恢复需要一个可核对的外部任务号。本批在 `execution_calls` 增加可空 `provider_job`，保存严格校验的供应商、模型、端点、可选 serviceId 和 jobId。旧调用保持 null，不回填虚构值；任务号不挤占文本供应商回执，也不存进网页 evidence。

```mermaid
flowchart LR
  SUBMIT[原调用已经开始提交] --> RECEIPT[取得供应商任务号]
  RECEIPT --> LOCK[同事务校验租约、业务归属和输入摘要]
  LOCK --> SAVE[原调用保存不可变任务号]
  SAVE --> READ[新执行权读取同一个任务号]
  SAVE --> KEEP[状态、预算和终态保持原值]
```

新的 `createExecutionProviderJobService` 验证 AI 素材任务与执行任务双向映射、账号、video 类型、原业务 prompt、冻结输入摘要、操作键、根模型调用和供应商身份。新增事实只允许当前 `startedAttempt` 的 started／unknown 调用；同一事实可幂等回放，不同任务号或供应商配置拒绝替换。保存走 settlement，因此取消后还能保存已发生的提交；读取走 admission，停止任务不能据此启动后续动作，旧 fence 不能回读或写入。

任务号只证明已经提交，不证明结果成功，也不证明用量为零。unknown 补记任务号后仍保持 unknown，账本预算和计数不变。新 attempt 可以读取旧任务号，但不能新增一条假装由原 attempt 确认的事实。

通用账本也增加一条约束：已有任务号不能结算为 rejected。供应商已经接受的任务不能重新被标成“未提交成功”，获得再次付费提交资格；此约束不改变旧空值调用的明确拒绝重试。

## 契约评审与验证

实现前独立审查确认该扩展符合已审 SPEC R01–R03，并提出供应商身份严格绑定、unknown 不自动解除、当前 startedAttempt、取消后结算、nullable 兼容等要求，已落实为服务校验和测试。本批没有增加 Worker 任意写字段端口。

- `asset-provider-job-red.log`：服务尚不存在时测试套件导入失败，0 项执行；这是实现前缺失证据，不宣称发生过 13 项行为红测。
- `asset-provider-job-first.log`：首批 13 项真实本地数据库测试通过。
- `asset-provider-job-final.log`：加入 unknown、事务回滚与敏感字段后，服务及原账本 44 项通过。
- `asset-provider-job-complete-tests.log`：最终 91 项通过，覆盖新增任务号服务、原账本、聊天节点恢复和聊天原子提交；可空迁移在同一数据库重复执行两次，旧空值保持 null。
- `asset-provider-job-rejection-red.log`：之后补查发现通用账本仍允许已存在 job 的调用变 rejected，1 项行为红测真实失败；`asset-provider-job-rejection-final.log` 记录修复后的回归。
- `asset-provider-job-concurrent-final.log`：再补并发不同 job 首写冲突后，最终 93 项通过，只有一个任务号能确认，另一方被拒绝；旧调用测试保留。
- `asset-provider-job-types-first.log`：首次类型检查发现旧聊天恢复测试夹具缺 providerJob，补真实缺省 null；原测试没有删减。
- `asset-provider-job-types-final.log`：contract、backend、ai-worker、frontend 类型检查通过。
- `asset-provider-job-final-backend-types.log`：账本限制和最终并发用例加入后，backend 类型检查通过。
- 实现后独立只读审查没有发现具体阻断；建议的并发首写冲突用例已补充。审查者没有运行测试。
- 本轮 `pmem sync` 已执行；`asset-provider-job-reconcile.log` 仍为现有 211 errors／1 warning，范围／复杂度、orphan 通过，无新增架构违规。未把全局对账写成全绿。

这些证据是本地数据库和测试夹具，不是商业供应商或独立 Worker 的生成验收。迁移尚未在用户实际数据上运行。

## 后续实际接线

新素材输入 schema 尚未加入可调度 Worker 输入联合类型，任务号端口尚未接 IPC；通用租约恢复继续对未确认 started／unknown 保守处理。接下去需要在素材执行器中预留原调用、提交前启动、确认 job 后续查，并将查询／下载和结果持久化接入同一恢复链。候选幂等提交、默认入口迁移、全部 AC 和真实供应商／双平台验收仍未完成，T-915 保持进行中。
