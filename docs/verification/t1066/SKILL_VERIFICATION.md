# 通用Skill沉淀与项目应用

已本地提交product-to-code-orchestrator `4b5406d7`，VERSION=3.27.4；规则入口始终加载timeout-budget-rules.md，研究/集成/TDD、自检与历史教训同步，新增机械预算校验器。未推送或远端发布。

| 检查 | 适用及真实结果 |
| --- | --- |
| 全量selfcheck/engine测试 | PASS，见logs/skill-selfcheck-retry.log；此前一次旧迁移fixture并发抖动FAIL保留，隔离复跑2项通过后全量重跑通过。 |
| 新机械预算5项测试 | PASS；独立外层、重试/退避、缺失/非法字段、continuous与原共享deadline分别校验。缺字段不能PASS。 |
| universal/public严格校验 | 本版6错误31告警；以3.27.3原包归档实际复测也6/31。均是既有历史个人路径/旧平台文字等，根因任务T-1067已登记，未把它们改写为PASS；见对应validation日志。 |
| 适用表 | 已有跨层维护需求采用通用原则；媒体与批量报告两个领域示例；项目下限由输入决定，通用规则没有写死CreatorOS两分钟。 |
| 触发/入口 | 本需求必须加载orchestrator；oil-skill-creator用于已有Skill整改和适用/验证，不增加发布授权。 |
| 非适用项 | 无新增Skill安装/删除、无外部账号/发送信息/内容生成，无需伪造技能分发或用户采纳证据。 |
| 项目更新 | 支持`--update --topology single`复制引擎至3.27.4；既有看板两个活动表使strict receipt migration阻断，日志保留；之后实际执行pmem sync与完整reconcile，未称全绿。 |

该校验器只验机械预算，不证明动态调用链、真机或供应商成功。项目公共链、SDK默认、失败归属和原任务恢复仍由项目规范与LED-053回归验证。
