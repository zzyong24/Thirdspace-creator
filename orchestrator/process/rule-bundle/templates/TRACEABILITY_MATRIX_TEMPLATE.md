# 需求追踪矩阵

仅在项目启用追踪时维护。`orphan-scan.mjs` 只解析一个 `traceability` 代码块；字段名和枚举为机器协议，保留英文，说明写中文。

固定列为 `Product | Flow | Entity | Page | API | Test | Status`。关联只填登记的 ID、逗号分隔列表、`..` 范围或 `NONE`。状态为 `OK | BROKEN | DEFERRED | RISK | PLANNED`；建设期间可用 PLANNED，发布前必须完成或明确处理。DEFERRED 必须有 DEC/RISK 依据、负责人、触发条件及看板任务，不能静默漏交付。

```traceability
| Product | Flow | Entity | Page | API | Test | Status |
| --- | --- | --- | --- | --- | --- | --- |
| FR-001 | FLOW-001 | ENT-001 | PAGE-001 | API-001 | TC-API-1..3 | OK |
| FR-002 | NONE | NONE | NONE | NONE | NONE | DEFERRED |
```

示例与配套登记/矩阵模板共同通过扫描；使用时一起替换为真实编号。当前要求必须连到实际实现和验证，不能以示例作为项目完成证据。编号稳定后不因排序变化重编号，说明与缺口放在代码块之外。

修改关联后运行 `node orchestrator/process/orphan-scan.mjs`：0 为通过，1 为结构或关联失败，2 为缺少材料。
