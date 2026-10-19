# T1216 最小测试修复验收

2026-10-11 当场执行，完整前端 tsc 修改前退出码 1，五条诊断只涉及自动截图 fixture 的未注册属性与丢失推断；只补 base.extend<{ t1207ScenarioCapture: void }> 泛型后退出码 0。运行主体逐字不变，没有 any、忽略诊断、排除文件或改预算。

命令及原始输出：

- [修改前](before.log)
- [修改后](after.log)
- [前置与最终独立复核](independent-review.md)

`git diff --check` 通过。边界扫描无新增（保留原 5 条基线），当前 reviewctl audit 仍有既有历史收据错误；本次未修改产品页面或服务，不宣称全功能通过。最近完整 reconcile 的 27 项失败保留于 [全局记录](../t1212/REPORT.md)，T1204 持续跟踪；本次测试校准不覆盖其验收。

仅测试文件变化，不产生新客户端行为，因此沿用已安装产品候选 a091de271 的实际验证，不重复出包。

任务交接记录：context-compile 原因是两任务缺 binding；已补精确测试写集、读集及真实验证命令。progress generate 被旧 T1026 write_set 校验阻断，保留旧控制与校验器；只按既有 schema 加入两个新 pending 队列条目，不推定 done 或 e2e_verified。原有队列条目与 leases 保留。随后两份 Task Packet 实际编译成功。此兼容处理不作为全局流程 Gate 通过。
