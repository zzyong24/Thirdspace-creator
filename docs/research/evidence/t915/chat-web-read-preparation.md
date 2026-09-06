# T-915 正式聊天准备传递网页执行选项

前一批已接通网页 Worker 和统一工具装配，但正式 `prepareDurableChatTurn` 未接收或传递 workerWebRead，调用方无法通过该准备函数生成网页 Worker 声明。本次补齐这一实际遗漏。

```mermaid
flowchart LR
  O[服务端选项与当前账号] --> F[异步前固定输入与开关]
  F --> A[共用真实聊天装配]
  A --> D[生成网页 Worker 工具声明]
  D --> S[持久提交与统一工具装配]
```

- `prepareDurableChatTurn` 增加可选 workerWebRead，并在第一次异步等待前固定其值；默认行为不变。
- `prepareChatTurn` 的选项类型复用工具定义函数，并复制选项后再等待上下文组装，避免新选项漏传及调用方中途修改开关。
- 新测试验证开关真假、调用后修改选项/原 URL 均不改变冻结结果，准备阶段不解析模型凭据。
- 启动时门卫拒绝领取，原因是上一批 chat-web-read-entry.md 的进程通信证据未登记复杂度。按已确认 DEC-RUNTIME-055 补入该文档的准确哈希及限定说明后，重新领取成功；没有通过删除技术说明或改规则绕过门卫。

## 当场验证

- [红测](chat-web-read-preparation-red.log)：1 项失败、1 项通过、148 项跳过，开启选项仍得到旧声明。
- [完整聊天装配回归](chat-web-read-preparation-green.log)：150 项通过。
- [真实完整场景回归](chat-web-read-preparation-frontend.log)：1 项失败、4 项跳过。任务错误 CHAT_WORKER_INPUT_UNAVAILABLE，模型请求 0，报告 10 个未接工具；与已提交 chat-research-fullscene.log 同类同清单失败一致。该完整场景未通过，不能用 150 项装配测试替代它。
- backend/frontend 类型检查均退出 0。boundary 既有 5 项、无新增；orphan 0 errors / 100 warnings。已执行 pmem sync；[全局对账](chat-web-read-preparation-global.log) 仍为 211 errors / 1 warning，与前基线一致，未通过。
- 独立只读复核选项冻结、输入隔离与复杂度登记未发现阻断。

这使正式准备函数能够表达已接通的网页能力，尚未替换 `/api/chat` 的旧 runChatStream。完整公共入口迁移仍依赖全部工具、流式回读及任务控制接线；所有 R-05 入口、旧路径退役、性能、商业供应商与双平台验收范围继续保留。

## 公共入口仍存在的实际缺口

只读核对表明，不同场景合计还有 14 个工具未纳入统一 host（本次 topics 场景报告其中 10 个）：topic.generate、script.draft、publish.package、cover.generate、knowledge.distill、calibration.diagnose、material.screenshot、local.read、material.generate、intelligence.douyin.share、review.analyze、review.script、project.transcribe、video.edit.render。不能通过删掉这些工具来通过准入。

生产 persistence-client 尚未消费聊天提交/调度装配；route 仍直接调用 runChatStream、使用 SDK 流响应并在 onFinish 保存消息。后续必须接通持久事件流、消息唯一完成属主、断线/主动停止的控制语义，以及绑定原任务和调用的授权续接。这些均属于原 SPEC 的完整范围，本次未宣称完成。
