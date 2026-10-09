# T1101 并入 main 的实际验证

来源f97a80da的19产品/13测试文件逐字节并入main，6个控制冲突逐项解决；主链events/review-events保持原main字节，来源全原件外部归档且Git祖先保留，不拼链或重哈希。来源✅/PASS属于原树，main新记录从待验开始。T1105已按来源真实失败登记，尚未代签main复现或修复。

独立来源及规格复核先于合并，报告和initial packet保留。正式reviewctl第一次拒绝覆盖来源legacy review，第二次拒绝不合命名；原命令失败保留，不改写历史。taskctl start实际发生在主线正式record之前，但已有独立规格PASS报告；第三次沿受支持的task-specific review路径实际记录PASS[REV:146ff2046c2c]。不补造更早正式事件。

当前main实际组合：backend7文件134PASS、frontend4文件82PASS、隔离PG正式公共30PASS、联合回归3文件16PASS及双端类型PASS。较早平台公共22PASS/2FAIL和画布公共1PASS/1FAIL分别登记T1107/T1108，不洗历史；T1107真实补验24PASS、发布4原文件由两次实际执行并集71PASS。T1108最终23组件PASS、两条Chrome旅程2PASS/87.681秒，真实保存中断恢复、精确引用、返回画布库重开、生成确认/防重、图库和三平台弹窗入口；T1105最终12组件与当前70.806秒公共旅程PASS。各自原始命令/时间/exit/SHA及明确模型/故障替身边界见对应任务当前证据。

原来源前端报告归档在source-f97a80da，不再代签当前main。三份当前前端报告本次结构/文案/合同核对退出0，未带--execute、不充作taskctl重新执行或完成。LED047174PASS、boundary/semantic/orphan退出0（原5边界/100warning保留）。T1109完整实际退出1只剩逐行相同原静态27，旧全局42对账错误保留，当前完整reconcile仍待。T1110资源网络变化原失败及根因UNKNOWN保留。当前App已替换为源码87964675，新DMG、首次HTTP首页/CLI及12原任务、4稿件/工程、3原会话与结果对照实际通过，见[安装验证](INSTALLED_VALIDATION.md)；不声称目视原生窗口、本人真实扫码、供应商生成或全功能通过。

2026-10-09 本轮完整实际 reconcile 在产品修改前终态 exit1（1183.436秒），41错误/0告警；与原42逐字比较无新增，仅LED052在明确提供两个隔离PG变量后未重复。原42日志保留，不能把本轮称全仓通过。安装版18项正式read-only核对17PASS/1FAIL，纯组workbench.capabilities.list被原账号门拦截，立即登记T1112；独评后仅修声明与transport的能力目录，原业务稿件/任务及七项其它门保持。T1112源码最终64相关PASS/两类型/三门卫通过，尚待独立实现复核和新的出包安装回归。
