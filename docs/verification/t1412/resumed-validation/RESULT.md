# T-1412 恢复后的原门与完整回归

2026-10-25，在外盘独立候选 `75b74649e43e001bf6682867c331e14308074a61` 执行。安装包仍来自产品源码相同的 `f9e5e5ece06d7d86dbb5bd38db76d18cc2437d84`；75 的变更仅控制面。环境与依赖的独立检查见 `environment-review.md`，候选和配置绑定见 `full-candidate.json`。没有继承用户凭据、数据库连接或注入型 Node 环境。

| 原入口 | 真实结果 | 墙钟毫秒 |
|---|---|---:|
| `node tools/timeout-policy/verify.mjs` | 174 PASS，0 skip，自然退出 0 | 51405 |
| `node docs/verification/t1022/run-archive-guard.mjs` | 原 3 文件 59 PASS，0 skip，自然退出 0 | 81592 |
| `node orchestrator/process/reconcile.mjs --profile full` | 55 lesson：54 hold、1 fire；整体 1 ERROR / 13 WARN，自然退出 1 | 2187525 |

唯一 fire 是 LED-054：两处真实 Chromium 提取测试仍期待 example.com 已移除的可见标题。full 原输出只保留失败尾部；在同一未改源码候选串行执行原两文件并增加 verbose，真实得到 31 PASS / 2 FAIL / 0 skip，五个 realTest 均实际执行。两处失败都定位到 `Example Domain` 旧断言。详细证据 `cft-five.log` / `cft-five.receipt.json`；修复及整条原 LED-054 的后续验收归 T-1416。原 full 失败不改写为 PASS。

所有原入口及定向 RED 都 processClosed=true、remainingOwnedGroupMembers=[]，未超时、无信号。owned PostgreSQL 已由原归属校验/停止机制停止并移除临时根，见 `owned-pg-stop-summary.json` 及原 stop-cleanup.json。锁文件、门配置、两份既有 IPC 内存基线的前后 SHA 全同，见 `original-gates-summary.json`。基线仅恢复历史原件，不是新测量。

`full-results.json` 从真实完整日志抽取 55 项身份、耗时及结果；`lessons-stats-after-original-full.json` 保全外盘 runner 实际生成的统计，不回写为主树伪全绿。历史中断/失败收据继续保留。后续若仅修 T-1416 的测试断言，可引用这些未变检查的证据，必须写明“原 full 失败后单项修复复验”。

这份记录只签上述本地验证事实，不证明官方 Pi 已恢复、官方同步图片具备服务端幂等资格、安装版 UI 已验收或具备推送条件。看板既有健康债务仍单列，quick、full lessons、真实产品验收互不代签。
