# 剪辑验收运行环境超时诊断

2026-10-13，T-1274验收真实发生以下阻断，不改已有超时规则，不给旧成功样例补签PASS。

- 隔离Next服务连续两轮Ready后停在首页编译，原300000ms启动预算耗尽；尚未进入剪辑UI。日志：`docs/verification/t1274/e2e-first.txt`、`e2e-second.txt`。
- 最后一轮生产公共链测试的PGlite beforeAll超过120000ms，3例跳过；早一轮相同公共链2例实际通过，不能代替最新可选素材保护回归。日志：`backend-media-diagnostics.txt`、`public-green.txt`。
- 执行超时政策扫描本身failures=[]、CLI公共拒绝短预算通过；后续真实执行账本的初始化/任务测试超过120000ms，使verify整体exit1。日志：`timeout.txt`。
- 观测到机器其它长驻Next进程及低free pages，但尚未证明是根因；不终止他人服务，不接入用户真实库或媒体根绕过隔离。

需求：定位这些真实阻断，使T-1274能在原隔离数据/媒体/登录态约束下执行完整公共链和实际媒体/UI验收。先检查本次合法启动/DB初始化调用链、CPU/内存/锁、缓存和执行期限，不猜业务失败，不提高固定预算洗绿。若发现产品缺陷，缺陷须有实际RED、窄修和公共链复验；重大服务契约、架构或归属改动仍走独立SPEC评审。

补充：本轮全局reconcile运行超过20分钟仍在既有测试链，最终输出缺失，已停止owned verifier子树；记录为interrupted，不当全局PASS。

验收：原服务成功启动；相同公共read/propose/apply读回、真实preview/MP4、桌面与窄窗走查、类型/build和timeout所需链路有当场证据。保留以上失败；T-1274原范围不缩小，未验收部分仍待验。
