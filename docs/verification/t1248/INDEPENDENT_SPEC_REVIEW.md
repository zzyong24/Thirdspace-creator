# T-1248 独立合同评审

结论：**REQUEST_CHANGES，1 项阻断（SR001）**。绑定 SPEC SHA `a060877011480ca5a5922c3cf59a5c91d124eeef51465f43d4e6114526980772`；两树 SPEC 与 golden 逐字相同。本评审只读，没有运行测试或修改产品。

代码内固定旧偏好分支、有限 read1/2 × action1/2 完整定义相等、当前公开 schema 不变及未知篡改拒绝的方向成立；当前写集尚未闭合原候选正式采用。

`assistant-system-root.ts:225-229` 只以当前 `buildChatTools` 创建 `createChatProposalSourceService` 的静态可信候选工具集。`chat-proposal-source.service.ts:50-58` 先以该工具集做绑定，再严格要求 tool.version 与 frozen.version 相同、参数定义整套相等。旧action hash 8d426…和当前ea897…已经由真实golden/诊断证实不同；外部候选的原identity/digest门同样引用可信version（73-75）。因此即使host matcher恢复旧action，原 system.action.propose 候选的真实 root/adopt 仍在此拒绝。“当前严格schema可消费旧字段子集”仅证明DTO解析，无法证明版本/来源消费者通过。

必须修订：明确可信完整catalog匹配后，原候选来源/采用消费者怎样沿**内置已知原型**选择对应版本及精确写集，保原owner/scope/claim/完整schema/版本/冻结/digest/effect/ack门；不能删版本相等、放宽未知schema或用任务自报定义构造执行器。新增真实旧action（例如原 preferences.update）的 host→seal→root采用与同回执重放、跨scope拒绝回归。旧legacy主要canvas恢复或单独旧schema测试通过都不能代替这一链。

完整证据与每个当前源SHA见 INDEPENDENT_SPEC_REVIEW.json。修订后复评；本结论不签实现、补拍RED、Gate、真实用户升级、官方模型或原生App。
