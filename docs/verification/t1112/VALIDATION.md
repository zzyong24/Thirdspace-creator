# T1112 实际验证

新安装版源码 87964675 的 18 项正式读取是 17 PASS / 1 FAIL；空组 `workbench.capabilities.list` 实际返回 428。仅修改目录的操作归属与 transport 前置账号门，其余七项平台账号门、真实工作区归属和 response 保持。

新增正式 gateway + transport + PGlite 组合 15 项；空组和归档组真实 RED，旧账号、不同用户和其余操作边界保留。首次额外第三项失败为新增夹具漏 now，随后有效夹具 RED 是 13 PASS / 2 FAIL；当前 RED 再复现同两项。后续 GREEN 与原 CLI/工作台测试实际三文件 26 PASS，契约两文件 12 PASS，分发入口一文件 26 PASS。新增测试的 TypeScript 输入封装失败也完整保留；最终类型与冻结测试版本按 current-evidence.json 的实际终态报告，未用测试运行通过代替类型通过。

修改产品前完成的新完整 reconcile 实际 1183.436 秒 exit 1，41 错误 / 0 告警。与原 42 条逐字比较无新增，唯一未重复是 LED-052；本次两个隔离 PG 变量都已提供，不称历史根因全部修好。此运行过程中登记了 T1112 控制材料与测试；产品直到它终态后才改，不能用它代签修改后的全仓通过。

当前类型检查、独立实现复核与 main 提交后出包、安装实际目录回归仍按当场证据追加。原始日志在本机私有目录保留；不提交用户稿件、凭据或 Cookie，不产生新模型任务和采纳，不代签 T1103 的 Pi 图文候选问题，也不声称全功能已通过。

最终冻结新增测试使用逐端点泛型闭包，避免七端点联合类型误推断；两个产品文件未再变。实际 backend-typecheck-closed exit0，backend-green-closed 三文件26PASS；契约12PASS、正式dispatch26PASS，共64项当前相关回归通过。contract/backend类型与boundary/semantic/orphan退出0；原5条边界/100条warning继续保留。三次新增夹具类型失败与第一次 now 夹具错误均保留日志，未补拍历史PASS。独立实现复核与安装公共复验尚未签署。

有限实现独立复核完成：PASS_LIMITED_T1112_IMPLEMENTATION，findings=[]；两个产品、两个测试、SPEC与当前模块均按字节绑定。报告MD SHA39f8d1ac19b42a68cf4418a74efc1c0cbe36d61aafb100883ad150412610c032，JSON SHA2646bd7e01b52dcd4279943686ab87f3cd50b873e6814edd893c15960c6c19df。尚未签新安装公共复验或修改后全仓对账。
