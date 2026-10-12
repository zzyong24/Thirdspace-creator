# T1250 私有全文回归工具候选

没有应用源、没有collect或执行公共测试、没有构建dist。当前shared dist属于T1253；原9ed9与已发生结果完整保留。

```mermaid
flowchart LR
 A[入口冻结总期限] --> B[准备与真实输入绑定]
 B --> C[原全部用例收集与声明核对]
 C --> D[逐例完整body和hook预算]
 D --> E[真实关闭及日志EOF]
 E --> F[输入复核与独立结果]
 A --> G[任阶段耗尽保未知，不续期或缩内层]
```

工具入口首先捕获monotonic clock；从静态测试声明派生一次fullDeadline=entryClock+完整serial预算，prepare包含input/hash/env/binding且120秒，collect及execution不重起总期限。每child仍给完整独立budget，不用min压缩；启动前核足剩余child/lifecycle/report，任何不足拒绝。静态每file源绑定和case-name/multiplicity匹配由实际list核，regression无name filter；case数不符即零body拒绝。

每case body=max原明确声明/1.8M默认，每file per-case hooks与before/afterAll按原声明的更长值以及globalsetup计入。两个原representation只预算60k→3.6M，反向替换精确原全部字节；原pixels/hash/正文/无外网/旧输出断言不改。现存环境条件Rust60k保持原source，在本runner清除全部CREATOROS_*后仅按真实语法资格证明未运行，不删case或签它通过；后续真正public fixture由独立完整Node/Rust预算工具执行。

每collect/test child的393f真实身份/ps/TERM/KILL/group验证收尾保守槽2,160,000ms，含最大正常分支1,980,200ms并留余量；helper源不改。整个outer用60秒monotonic分段，不溢出Node32位；每实际child自身budget仍在32位内，否则网络/child前拒。

新增真实POST route/auth session/loopback guard/mcp package与tsconfig、预算读取TypeScript模块/新budget模块输入。仅两个公共HTTP组需要POST链。mock request-context与mock persistence明确记录，不签其原实现已执行。全backend/contract/迁移与实际11dist原范围保留。

STATIC_BUDGET_INVENTORY仅静态可能用例库存（含原环境跳过声明），不是实际list/PASS。纯预算检验只证明解析与保持长值，不能代替原全文运行。实际应用及fresh source/lock/dist prepare等待root与独立peer复审和执行窗口。
