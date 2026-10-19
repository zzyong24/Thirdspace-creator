# T1313 独立规格初审

本轮为 initial，评审方式为 homogeneous，模型沿用 GPT-6.1 Sol / high。未发现需要阻断实施的规格问题，JSON findings 为空；本文件不自行给出工具 verdict 或开工收据。

| 冻结输入 | SHA256 |
| --- | --- |
| SPEC | 737c474553d94654d9ac52c9323ac589f0bc615c88dd4944d1d9a0b5bd63997f |
| INPUT_LOCK.json | 3cc91c1ffd238c48e6805ac034087f176780ac8600e85f6a05389a705fc08f94 |
| MODULE_SCOPE.json | 0717c9df94e5dc90bd8a2761102ac4e661f1d40f6351c62420d0030657585c5f |
| SYSTEM_ARCHITECTURE.md | eb1826d4c09054df622d9718c38ca372bd19833e72bd1a752757631a5747c1df |

38 项输入的当前字节与锁逐项匹配。实际 T1312 产品提交为 `4e73d0f59be2bd44eaace8b2be9253106480b326`；旧锁 baseHead 与原 done 错锚不作为产品未整合的依据。本轮未修改冻结输入或控制记录。

正式文本已闭合前期草案歧义：仅 legacy 实际 ctxA 在两个阶段分别先锁账号、会员、实际组；原预约与提交仍是两个独立事务，普通 group/filter 不增加 B 的会员或 active 门，wake 保持提交后。新报告冻结盖章不改变原 request/key 或 AI 原输入 fingerprint；未绑定与已映射重复分别核原幂等入口和完整映射，不把 receipt 存在当作旧混合 pending 已修。

私有 reader 的 owner 来自现有 `AiService.getTaskExecutionRuntime` 原行端口，三个生产文件即可完成接线；现存两测试的 aiFor 都返回真实完整 AiService，不需要给外部 DTO 伪造 accountId。精确 report/task/owner、snapshot.scope、scopeKey 和 frozenContext.projectId 的约束足以保留持久冻结来源，公开 get/list/status/request/confirm 仍走原父门。已核公开 project 删除事务清理 report/composition 与对应 AI task；没有虚构独立 composition 删除入口。

新测试写集为两个现存文件与一个明确允许新增的生产组合文件，受控完整链与安全/恢复覆盖可以在该边界内实现。原 T1311 的 reportnull/AI legacyG 及 0 execution/0 provider 失败成立；旧 project/composition 未拍实际行，不能推成旧 project 必为 null。实施必须先取新父 tuple、完整源/test/config/immutable worker 前快照和自然 RED，再按真实输入决定最小修改。旧 pending、旧 FAIL 和缺证继续保留。

本轮仅审规格与可执行性，没有运行测试、模型、HTTP、服务或控制命令；尚无 T1313 实施或新包验收结论。真实初审裁决、lease/packet、前置 RED 和后续 Gate 均由后续阶段当场发生。
