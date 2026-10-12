# 两条设置原完整用例：补充诊断工具准备

尚未执行 test body 或启动 Next。产品仍冻结 533224f334c43cdb81a344424e420cad93784dd1，首轮原失败不覆盖。

实际 --list：e2e/settings.spec.ts:158 和 :283，共 2 条，均实际 timeout=74,100,000 ms。整个 settings 原文相同；network-policy 原文相同；test-environment 仅透明 history 包装，Reflect.apply 原函数原 this/参数/返回值，移去 injection.txt（包含插入的空白行）后与原生成 helper 逐字相同。

每条 body 保持 74,100,000；project 默认及其真实 afterHooks/workerCleanup/traceStop/finalGracefulClose 仍 672,660,000。外层 5,530,920,000 ms，逐项见 JSON；仅单调 deadline 到期才触发终止，最长单次 timer 60,000 ms；正常完成立即回收。不缩实际内部预算。

fresh os.tmpdir creatoros-playwright-*，端口 61349，任务数据库/媒体/授权目录/TMP/cache/backups 全部 own root。HOME 与 CODEX_HOME 保留父进程原值（当前分别核对 true/true），不复制官方 auth、不重定义这些系统变量；其余环境采用无 secret allowlist。原17视觉 baseline 只读，唯一自有 visual-baseline 输出，原100/生成100/driver8/产品253/Worker11 SHA 与精确目录前后核对。无主App/安装/授权/模型调用/foreign PG。已安装浏览器二进制目录仅显式只读使用。

执行前 exclusive net.listen 确认61349空闲；Next复用关闭。清理仅对 spawn runner 现场观测的 PPID 血缘后代且每次重核 PID birth-time 发信号，脱离 process group 的已观测 owned Next 同样追踪；外来listener只登记不发信号。

输出：/Users/zyongzhu/.codex/worktrees/integrated-dev-acceptance/Thirdspace-creator/docs/verification/t1246/settings-full-history-runs/2026-10-11T17-19-06-539Z。列表前后库存无差异，无 Next/浏览器 test body。执行必须带另一 Agent 静态审核后的工具 SHA 环境值；本工具不能自签。

完整绑定及所有原输入 SHA：PREPARATION.json、该输出目录 list-before.json/list-after.json。透明 history 原始行输出 history-events.jsonl；原情景 fixture 保留每 case ID、截图、errors；Playwright trace:on、screenshot:on、results.json。

```sh
CREATOROS_T1246_SETTINGS_REVIEW_APPROVED_SHA=f2ef3152bfdebc16fe307a22346fac2077c50c3ecaa61be970a150b177a1f38c node /Users/zyongzhu/.codex/worktrees/integrated-dev-acceptance/Thirdspace-creator/docs/verification/t1246/settings-full-history-tool/launch.cjs execute /Users/zyongzhu/.codex/worktrees/integrated-dev-acceptance/Thirdspace-creator/docs/verification/t1246/settings-full-history-runs/2026-10-11T17-19-06-539Z
```
