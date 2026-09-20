# T-1020 租约恢复测试使用官方说明快照

扩大后端回归原有 349/350：测试人为填入 `creatoros.guide` 的 `v1` 版本和一段任意正文，而现行代码会核对官方 Skill 的真实版本与完整正文，因此工具按设计返回“未冻结”。测试夹具现在从官方注册表读取这两项真值，再冻结到原任务；提交后仍故意修改内存中的正文，以验证租约恢复只读取已保存快照。

```mermaid
flowchart LR
  A[官方 Skill 版本与正文] --> B[冻结到原任务]
  B --> C[修改内存中的后续配置]
  B --> D[按租约恢复工具]
  D --> E[仍返回提交时的官方正文]
```

修复前该单测失败，错误为 `CREATOROS_GUIDE_UNAVAILABLE`，原因为 `version`。修复后 `chat-turn-submission.service.test.ts` **23/23** 通过，原测试对账号、旧租约、工具版本和参数篡改的拒绝断言仍执行。backend typecheck 仍有 13 处写集外既有测试错误；本次夹具及 T-1018 测试修正没有新增类型错误。未放宽 `chat-guide-snapshot.ts` 的运行时校验。

`pmem sync` 已完成；本轮全局 `reconcile` 为 **17 error、1 warning**，T-1020 测试通过。17 项均为 16 条历史评审回执（T-916）及桌面浏览器交付门 LED-018（T-1013）；BACKLOG 体积告警保留。
