# T-1248 修订合同独立复核

结论：**PASS_SPEC_ONLY，SR001合同缺口关闭，无新增finding**。两树修订SPEC实际字节一致，SHA `46e35cb87e7de24066cff1b805bd38f74ff6053fac93bfa9a0136896f40d6a88`。

首阻断与原a060877 SPEC、原生成模板均单独保留；严格initial/recheck packet携带同一REV-001全部冻结字段，仅resolved及resolution_evidence更新。formal reviewctl由root执行，本Agent未写控制面。

修订明确在原scope、冻结摘要、会话/history与hostContext验证后，仅由root按固定完整已知catalog解析可信工具；Pi绑定、原/复用call解码和最终version/schema检查使用同一套工具。旧字段资格由选定旧strict request落实，外部turn/digest/claim、候选seal、采纳CAS、确认与重放保护保持。补入root/source及source.test精确路径，并要求真实旧/当前偏好候选完整host→seal→ledger→root采用链。该方案沿原owner可落地。

此处关闭合同缺口，未改产品或运行测试。实施、真实旧任务恢复/采用、类型与Gate仍待实际回执；不签旧用户数据库升级、官方模型、原生App或全功能通过。
