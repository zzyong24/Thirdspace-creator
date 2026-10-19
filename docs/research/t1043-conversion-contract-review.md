# T-1043 作品互转契约草案独立复核

作者：conversion_audit 子 Agent。复核：主 Agent，2026-10-01。仅复核 `contract/src/resources/output-conversions.ts` 与 `contract/tests/output-conversions.test.ts`；不代表整个 T-1043 的合同 Gate 或验收。

当前结论：草案表示层测试通过，**完整服务契约仍待闭合，不准注册未接通操作**。

当场 14 条通过，记录 `docs/research/evidence/t1043/conversion-contract-independent-review.log`；作者三轮真实红/绿日志保留。已处理两个问题：多字段回执不能用单项成功冒充整稿完成；一个结构候选可覆盖多个字段，不强制拆模型请求。多结果复用既有 bundle，primary resultId/taskId 指向真实单项，来源选区与冻结请求一致。聚合状态与既有 creative-results 规则逐项核对。

仍须在接通前落实：

1. 同一结构候选覆盖多字段时，独立采用和剩余项安全重绑如何回读。当前 shared result 的任务/状态必须一致；后端不能把一个字段采用标成其余字段全部已采用。应在 owner 显式区分候选执行状态与字段采用状态，并闭合公共回执后再审。
2. cardBriefs 没有现成 creativeKind，需作为图文 owner 的结构化候选字段闭合生成、编辑、采用、版本恢复；不另建执行器，不变成 Asset。
3. 完整来源类型须贯穿 owner 校验、模型 schema 和重试；视频当前/历史正式稿读取端口尚缺。UTF-16 边界、代理对、真实段落与文件归属必须通过 owner 读取后校验，schema 测试不能代替。
4. 安全未提交与已启动未知回执的恢复合同、目标稳定创建与 result 预约之间的公共调用链必须完成故障注入验证。

未修改批准 SPEC，也未把待验证 owner/模型能力记成 PASS。现有手工创作、旧稿及表单仍可用。
