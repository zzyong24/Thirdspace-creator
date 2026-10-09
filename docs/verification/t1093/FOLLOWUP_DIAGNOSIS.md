# T1093 实际安装后续缺口

新包冻结main77003717。Pi native task ai-task-434be109-186已真实候选成功：仅trimStart0→120000、duration1791000→1671000，原速/声音/其它轨道不变，DTO无写、同key返回原消息；未采用。

Pi creation task ai-task-434be109-200第一次work.creation.read空对象成功，三次propose实际graphic.ruleSnapshotRef分别为{}、省略、省略，被正确拒绝；没有合法null调用，不能声称宿主拒null。当前无联合候选，有限部分完成文本已明确尚未完成、没有候选。原所有失败和ID保留，未重发。

独立只读核对合同、实际prepare JSONschema与Pi codec均保留必填anyOf(object,null)。下一步登记T1095核原任务及模型schema遵循，不继续堆提示或放宽原门。

另外messages/results公开读取成功，而原ai.tasks.get连续400，data.status不匹配六状态enum。completion写ai_tasks.status=partial，execution projection在partial保留原DTO status，公共aiTaskStatus漏partial。这是独立确定缺陷，登记T1094；需独评实际公共终态消费者并按真实partial修复，保旧任务结果、定义/摘要、归属与回放，不把部分完成说成全成功。

原始私有证据目录 `/Users/zyongzhu/CreatorOS-local-acceptance/main-installed-20261008/t1093`。repair-observe-run.log SHA256 f500f89ccc2fecce1467bf63e7448e245f24f337bb8a1da396f5bf0a7fb61b5a；独立CREATION_REPAIR_DIAGNOSIS.md SHA256 66ad2165361b850559b385b0df066629288b2a70af14bd3155fb1e63afbc6506。该轮完整回归真实44错误/0告警，新增两项测试门卫已修接线并局部验证；T1094新完整回归已真实结束、42错误/0告警与原日志逐字相同。T1093/T1091均不能签完整通过。
