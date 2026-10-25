# T-1416 真实浏览器断言修复验收

2026-10-25，规格审核 `47d4fbfd6861`；实现提交 `2309e1183`，执行候选 `4128c68c82a71e485110a026c1fbd288c549f363`。独立代码复核见 `implementation-review.md`。生产源码、URL 安全策略、账号及租约检查不变，仅两处测试从已消失的可见标题改为精确来源和完整可见正文。

| 验证 | 实际结果 |
|---|---|
| 原两文件 RED（75b74649e） | 31 PASS / 2 FAIL / 0 skip；两处旧标题断言失败，五个 realTest 实际执行 |
| 原 LED-054 整条 `&&` 链 | frontend 33、worker 31、backend 79，共 143 PASS / 0 skip；自然退出 0，228450 ms |
| 原五个真实浏览器用例 | 全部通过：中断恢复、PID socket、宿主重启、两账号隔离与取消、旧 Playwright 档案交接 |
| frontend typecheck | `next typegen && tsc --noEmit` 自然退出 0，79980 ms |
| owned PG | 原机制确认停止、临时根移除；测试与类型检查均 closed，无残留组成员、超时或信号 |

原 RED 位于 `../t1412/resumed-validation/cft-five.log` 及 receipt；页面原因绑定见 `cause-evidence.json`。GREEN 原命令、环境键、配置与源码 SHA 见 `candidate.json`，执行后源码 SHA 不变，见 `candidate-after.json`。首次自编 driver 把配置字段误读为 id，在启动 PG/测试之前准入失败；4128 修为真实 led 字段后才开始本次执行，没有把该准备失败记成产品 RED 或已执行测试。

原 55 项 full 的 54 hold / 1 fire 和退出 1 继续保留。本项只为那条失败守卫补上修复后的完整 143 PASS，不声称新候选跑过一次全绿 full。未变 54 项使用原证据。外站与网络依赖仍存在；未来页面变化仍会使严格断言失败。

安装仍是 `f9e5e5ece`，后续仅控制面与测试修改，无须把相同产品重新打包，也不重新标记二进制提交。本项不代签官方 Pi 402 恢复、安装版 UI、图片服务端幂等资格或推送条件。
