# T-1201 知识图谱错误提示合同核对

T1200第一次实际回归：19文件148例，147通过、1失败。knowledge-graph-view.test.tsx原期望原始“无可用 LLM 凭据”，当前展示统一人话错误。图谱产品文件此次未修改。原日志保留于私有验收目录 knowledge-regressions-first.log；不伪造历史红绿、不删错误断言。先核统一错误适配及旧合同，独评后决定是否精确校准测试；本任务尚未实现。

实查产品knowledge-graph-view.tsx的relate请求先抛原接口error，再经过既有describeUserError；ai-error-humanize.ts的model_not_configured合同明确把该原始字符串映射为“还没有可用的 AI 模型。完成设置后，回到这里即可继续。”。T1200未更改这两产品文件，本任务也不更改它们。校准精确写集仅frontend/src/features/knowledge/knowledge-graph-view.test.tsx该请求失败用例：error面板必须有上述完整确切人话、不包含原始凭据术语，实际fetch一次且createKnowledgeRelation未调用、router.refresh未调用。保原400缺模型fixture，不删用例/不匹配泛化文字。独评后实际红/绿原图谱全套，随后知识全套。

当前上述测试已校准，知识全套19文件148例实际通过，原147PASS/1FAIL日志仍保留。本任务仅测试合同校准、没有产品UI或frontend journey contract，独立适用性复核后将误填的验收“待验”改为“—”；不豁免T1200整页验收，不手改任务状态。完整对账失败另明确记录后才沿taskctl收尾。
