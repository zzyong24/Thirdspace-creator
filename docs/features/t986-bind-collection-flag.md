# T-986 新绑定默认采集系统标记透传

T983独立审查发现既有路径缺口，本轮按用户“不扩展范围”单独登记，未修改生产代码。

`backend/src/application/scheduling/controls.ts` 的 bootstrap `createJob` 将 `systemManaged` 写成仅 `sourceKind === "intelligence.sync"`；`collection-bootstrap.ts` 对 `self.traffic/self.detail` 模板传入true，但被丢弃。`scheduling.service.ts` 拒绝未带系统标记的这两类任务。

预期复现条件：新绑定账号、两类任务不存在，ensure逐项catch后创建失败，需后续启动兜底补齐。当前证据是代码路径独立审查，尚无新绑号真机复现。

后续需隔离真实service composition红测，最小透传已授权模板标记；保持普通用户创建系统任务的拒绝和账号归属校验，验证新绑定当次即创建完整独立任务。不得为测试删除用户账号或现存计划。
