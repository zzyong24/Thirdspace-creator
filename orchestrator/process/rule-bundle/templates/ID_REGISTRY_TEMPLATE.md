# 稳定编号登记

仅在项目启用追踪时维护。`orphan-scan.mjs` 只解析一个 `id-registry` 代码块；字段名和枚举为机器协议，保留英文，说明写中文。

固定列为 `ID | Type | Defined In | Source IDs`。无来源写 `NONE`；多个来源逗号分隔，编号范围用 `..`，同处定义用 ` / `。编号前缀为 2–6 个大写字母，后接字母数字与连字符。废弃说明放在块外，不给固定表格追加状态列。

```id-registry
| ID | Type | Defined In | Source IDs |
| --- | --- | --- | --- |
| FR-001 | requirement | PRODUCT_SPEC.md | NONE |
| DEC-001 | decision | DECISION_LOG.md | NONE |
| FR-002 | requirement | PRODUCT_SPEC.md | DEC-001 |
| FLOW-001 | flow | BUSINESS_FLOW.md | FR-001 |
| ENT-001 | entity | LIGHT_DOMAIN_MODEL.md | FLOW-001 |
| PAGE-001 | page | PAGE_SPEC.md | FLOW-001 |
| API-001 | api | SERVICE_CONTRACT.md | FR-001 |
| TC-API-1..3 | test | api.test.js | API-001 |
```

示例与配套登记/矩阵模板共同通过扫描；使用时一起替换为真实编号。当前要求必须连到实际实现和验证，不能以示例作为项目完成证据。编号稳定后不因排序变化重编号，说明与缺口放在代码块之外。

修改关联后运行 `node orchestrator/process/orphan-scan.mjs`：0 为通过，1 为结构或关联失败，2 为缺少材料。
