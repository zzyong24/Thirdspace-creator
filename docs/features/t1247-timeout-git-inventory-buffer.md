# T-1247 修复超时门读取完整 Git 文件清单时缓冲区溢出

用户已授权 T-1246 记录测试问题并集中修复。本任务只修实际验收工具缺陷，不改变产品功能、数据归属、门禁规则或发布标准。

## 事实与范围

T-1246 round-2/worker-calibration/timeout-policy.log 的真实 `node tools/timeout-policy/verify.mjs` 返回非零；第一项 check.mjs:64 的 `git ls-files -z` 触发 `spawnSync git ENOBUFS`。2026-10-12 本轮只读统计实际 tracked 清单为 1114935 bytes，超过 execFileSync 默认 1 MiB，扫描并未完成。原日志及原非零退出保留。

大白话：门卫在读完整文件名单时容器太小，名单还没读完就退出；应让它读完，继续按原规则检查每个文件。

```mermaid
flowchart LR
 A[完整 Git 文件清单] --> B[明确足够且有限的缓冲区]
 B --> C[原排除规则与原逐文件检查]
 C --> D[真实结果与非零失败]
```

唯一实施文件：`tools/timeout-policy/check.mjs`；只在原 git execFileSync 参数添加 `maxBuffer: 32 * 1024 * 1024` 与 `timeout: 120000`。保留 stdout 原 NUL 切分、全部库存、全部 excluded/inspectSource/失败退出、原扫描统计和入口；不吞错、不截断名单、不减扫描范围、不改原测试或 verify.mjs。32 MiB 是有界工具缓冲区，超过仍明确失败；120秒只为单次库存命令预算，外层完整 Gate 另覆盖全部顺序执行和清理。

## 验收标准

- AC1：实施前真实默认命令再次返回 ENOBUFS；原 failure 不覆盖。修后本轮实际清单能完整读取，无 ENOBUFS；记录源码与库存字节 SHA。
- AC2：原 check.test.mjs 和 hyperframes.test.mjs 全部断言实际执行；静态门发现规则违规仍 exit1，不将非零称通过。
- AC3：用 fresh 隔离 APP/DB/media/profile、禁止旧 PG 与用户凭据、独立外层覆盖全串行预算运行原 `node tools/timeout-policy/verify.mjs`，记录每组原输出/最终退出和进程清理。即使其他真实检查失败也全部登记；只有完整入口 exit0 才称完整超时门通过。
- AC4：独立 SPEC 审核后再改唯一工具；实施后差异只限该参数行，不能借本任务修产品或其它失败。T-1246 的 App 验收仍未完成。

非目标：Appium/原生授权、真实平台认证/发布、补拍历史 RED、改任何执行上限或质量规则、改用户数据、改原首轮控制工件。
