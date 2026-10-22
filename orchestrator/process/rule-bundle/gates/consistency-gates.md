# 跨工件一致性

> 适用判定与证据格式见 [_GATE_EVIDENCE.md](./_GATE_EVIDENCE.md)。

术语、范围、所有者、权限和验收含义一致；完成阶段不能依赖已 invalidated 的上游。同步实际受影响的工件，不因检查而创建休眠材料。

## 已启用追溯时

```bash
node orchestrator/process/orphan-scan.mjs
```

程序双向核对：下游 PAGE/COMP/API/TEST 能追到 FR/NFR/FLOW/DEC；上游已实现的发布关键需求有实现和测试。返回 0 表示通过，1 表示断链或格式错误，2 表示缺失。reconcile 按实际配置整合结果。

机器只读 `id-registry` 和 `traceability` 围栏，列名与 ID 语法见 `templates/ID_REGISTRY_TEMPLATE.md` 和 `templates/TRACEABILITY_MATRIX_TEMPLATE.md`。保留 `NONE` 及 `OK|BROKEN|DEFERRED|RISK|PLANNED` 枚举，中文说明写在围栏外。PLANNED 可表达尚未实现的确认范围；发布前必须处理。

阶段清单使用模板规定的阶段映射，不换成列表。`orphan-scan` 核对追溯，manifest 结构与状态由 `reconcile` 核对，不能混淆两者能力。

证据记录命令、返回值、受影响行和问题处理；风险接受遵循公共门约定。
