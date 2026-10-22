# 前端真实旅程验证

> 适用判定与证据格式见 [_GATE_EVIDENCE.md](./_GATE_EVIDENCE.md)。

## 适用证据

区分逻辑、单页响应、连续旅程和人工体验四个层次。下层通过不证明上层；未请求的人工体验可以 `not-requested`，不从测试结果伪造。

在真实浏览器/桌面运行 `frontend-journey-contract/v2`，使用有代表性的非 fixture 数据。`watched_paths` 指向存在的实现、状态、适配和测试路径；主从旅程使用两个不同且角色互斥的实体见证。

核对所有后置条件、反馈、下一步、返回/刷新及 required_conditions；执行正常和最小两个不同视口。写入后读回同一实体，空态有可操作下一步，列表/选择/详情一致。

同次运行导出可见文本，校验控制面 ID 和实现术语泄漏；安全诊断值只在次级“参考编号”下呈现。报告无未关闭缺陷，按当前校验器提供适用的 RED 证据，不以截图堆替代命令结果。

## 执行与收据

```bash
node orchestrator/process/frontend-validation.mjs validate --execute --report <report> --task <T-ID>
```

报告包含 `frontend-validation/v1` 块。严格项目的 verify_key 必须映射到 `reconcile.config.json.frontend_verify_commands`，报告 commit 为当前 HEAD，contract_sha 对应当前 PAGE_SPEC，watched_paths 执行前后干净。

`taskctl complete ... --evidence <report>` 校验后写入 `PASS:<hash>`。程序核对结构、证据绑定、视口、状态和文本等条件，但不能保证项目命令覆盖了所有瞬态，也不能独立判断见证数据的业务真实性；这些由项目验证设计和人工体验判断承担。
