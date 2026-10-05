# T-986 新绑定默认采集系统标记透传

T983独立审查发现既有路径缺口，本轮按用户“不扩展范围”单独登记，未修改生产代码。

`backend/src/application/scheduling/controls.ts` 的 bootstrap `createJob` 将 `systemManaged` 写成仅 `sourceKind === "intelligence.sync"`；`collection-bootstrap.ts` 对 `self.traffic/self.detail` 模板传入true，但被丢弃。`scheduling.service.ts` 拒绝未带系统标记的这两类任务。

真实复现：2026-09-30 在隔离 CreatorOS 页面中新扫码绑定抖音账号，自动化页当次只有 4 项默认任务；`self.traffic` 与 `self.detail` 未创建。重启后启动兜底才补齐为 6 项。

修复：组合层把模板传入的 `systemManaged` 原样透传给调度服务；调度服务继续拒绝普通用户手工创建受管任务。对应 service composition 回归在新账号绑定时核对 6 项任务，且手工创建系统任务仍被拒绝。后端相关 5/5 测试通过；隔离页面重启回读 6 项任务。未在修复后再次使用另一只真实抖音账号扫码，故“新号当次真实扫码 6 项”仍由组合回归而非第二次真机证明。
