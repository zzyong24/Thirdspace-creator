# T-915 topic.generate 独立审查

最终结论：PASS。本次限定增量及定向修复复核未发现剩余阻断。只读审查产品实现，未修改产品代码或重跑测试。

## 本轮发现与修复

1. execution-topic-read.service 的正常 settleTopicRead 仅验证调用身份，未拒绝 unknown → settled。通用 ledger 允许部分恢复场景补结算，因此专用读取服务必须自行拒绝未知事实被普通完成回执覆盖；新完成同时要求 startedAttempt 属于当前租约。既有 settled 的完全相同回执可重放。
2. ordinal 2 只检查 Worker 自报 retryable 与阻塞白名单，PERMISSION 等非临时错误带 retryable=true 也可取得第二次读取。只允许 TRANSIENT 且 retryable 的已确定回执进入下一次。

两项均已定向复核修复：正常结算在 ledger 同事务回调中仅允许当前 startedAttempt 的 started 或既有 settled；unknown 被拒绝。host 与 Worker 的第二次读取均要求 TRANSIENT 且 retryable。既有 settled 仍受通用账本完整回执一致性约束。

另核对了来源域名别名兼容修复：URL 与配置域均经同一 webDomainFromUrl 规范化后比较，保留实际来源 URL，不将 www/v.douyin 历史配置误判为越权。

实现者提供 topic-read-boundaries-red.log 的真实 2 FAIL / 8 PASS，修复后绿测，以及别名红绿；最终 topic-read-final-green.log 为 11 PASS，topic-read-final-types.log 类型检查通过。本审查只读代码并核对修复，未重新执行这些测试。

## 已核对范围

- 每个读取目标来自冻结 __topicGenerate；Worker 不能提交 URL、来源名称、域或搜索 query。来源 ID 必须唯一命中。
- 回执绑定请求摘要与目标，成功读取优先回放；新的登录恢复轮次由宿主精确认可的旧阻塞 call ID 派生，普通 attempt 变化不会开启新轮。
- sessionAccess.read 已使用未知 IPC 包装；普通生成不启动浏览器，读取资源懒加载并接关闭。
- dispatcher 读取登录态、领取 profile 后重新验证；取消检查及 pending 跟踪保留。停止证明和释放仍沿既有宿主机制。
- topic 候选采纳调用 candidate 与 positioning 的同事务服务，旧有效序号来源键保留。

边界：本次 host 读取服务已冻结；root 最后整组回归仍以其实际输出为准；本记录不代表完整 T-915、真实供应商或安装包验收。
