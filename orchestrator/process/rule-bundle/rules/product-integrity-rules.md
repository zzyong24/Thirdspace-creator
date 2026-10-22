# Product Integrity Rules（产品整体性守护）

局部实现、局部测试和局部评审都不能单独证明产品成立。只保留会跨任务累积的通用失效形状，
并把每条规则落到可复核证据。

## 1. Mock / fixture 必须有退出路径

- 引入 fixture、seed 或 mock 时，同时登记消费者、退役条件和可执行的消费点检查。
- 接入真实路径的任务只有在真实路径替代假路径、旧消费者归零后才完成；并存必须是显式风险决定。
- 读失败显示真实错误状态，不静默回退到假数据。

## 2. 交互必须诚实且读写闭环

- 未接线控件不冒充可用能力：不渲染，或显示用户可理解的“规划中”，并登记负责人/任务。
- 写动作在同一验收旅程中读回最终状态；成功响应不能替代用户可见结果。
- 验收使用非 fixture witness，覆盖空值、失败、返回和刷新，而不是只走数据最完整的演示实体。

## 3. 横切概念只有一个来源

- 跨页面状态词、动作词、格式化规则和时钟由共享定义拥有；第二套同义实现是漂移。
- 用户可见文案来自 `PRODUCT_VOCABULARY.md`，不显示控制 ID、机器错误码或实现层术语。
- 错误文案先说明发生了什么、影响和下一步；安全诊断值仅作为次要“参考编号”。

## 4. 旅程证据高于局部绿色

- 分开记录 logic、surface、journey 与 human experience；下层 PASS 不推出上层 PASS。
- 页面合同声明即时反馈、settled postcondition、next action、返回/刷新上下文和必要组合状态。
- 页面组验收在真实运行环境执行合同，并生成绑定当前规格、commit、witness 和 watched paths 的收据。
- SHIP 仍须以用户身份走完整核心旅程；断点进入 BACKLOG，不能用单测或截图集合代替。

## 5. 跨项目旅程只有一个完成权

- 用户旅程跨多个独立项目或部署时，启用 `rules/program-orchestration-rules.md`。
- 业务依赖先决定 ready set；文件写集只决定同一 ready set 内能否并行。
- `completion_authority` 固定为 `program-gate`。只有绑定当前 FLOW、release set、receipt 与实际执行证据的
  `GO` 可以声明父旅程完成；各项目绿色仅是局部实现证据。

## 校验对应关系

| Failure shape | Executable / gate evidence |
|---|---|
| 假数据不会退役 | `MOCK_DATA_SPEC.md` ledger → `gates/08-mock-data-gate.md` → integration consumer check |
| 假交互或写真读假 | `rules/ui-implementation-rules.md` → `gates/09-frontend-implementation-gate.md` |
| 非真实 witness | `gates/10-frontend-validation-gate.md` + validation receipt |
| 用户语言或组合状态漂移 | PAGE contract → frontend validator → `taskctl` receipt → `reconcile` |
| 跨项目局部绿色冒充产品完成 | program config → `program-gate.mjs --execute` → `gates/14-integration-gate.md` |
