# T1309 第2轮独立规格复核

沿原 T1309 审核 lineage 复核，原首轮工具回执为 `CONCERNS[REV:d7ae5c446d0f]`。本轮仅处理 `REV-001` 和本轮精确变更，没有重新 initial，没有扩大审核范围。`REV-001` 现标记 `resolved`，没有新增 finding；正式裁决由 `reviewctl` 计算。

## 输入与身份

- Reviewer：GPT-6.1 Sol / high；作者 C 为相同模型，实际独立性类别仍为 `homogeneous`。本轮为原 reviewer 续审，未冒称全新或跨模型审核。未主动开启 Fast，工具无 tier 读回，未声称核验 tier。
- 实际 HEAD：`710f405466024cc4e00ced84d393d142da61db95`。
- 上一轮完整 packet：`docs/verification/t1309/control/RECHECK_CONTEXT.json`；其 previous_round=1、previous_verdict=CONCERNS、原 SPEC hash 与上一轮报告一致。
- 当前 SPEC SHA256：`f3e35d51af870f9f811ce8e5768372bb01c47772fecc831e4ee3526a446efe12`。
- constitution SHA256：`eb1826d4c09054df622d9718c38ca372bd19833e72bd1a752757631a5747c1df`。
- `INPUT_LOCK_ROUND2.json` SHA256：`f004661e7f30c05f19d3d7fc98db891b028328c891915b91e6c0c49285a4b6b8`；实际逐项核验 44 项路径、字节数与 SHA256，零不符。
- 当前 `MODULE_SCOPE.json` SHA256：`b6893a122257ed6eb61bb1c9f60f71e618e9cb5e683f9f690b90746735fd1849`。
- 上一轮 JSON/MD 原字节仍为 `6e231b2089125d670541c649ebdd3eaf941637786772ed696830e644396fc7a8` / `d16172079d5783bcf09ecd27293904bffb70283f8fd4b0a65d429f1e94cd794b`。
- 已再核只读 worker 为 5,618,216 字节，SHA256 `3851b4fb132035f1b03528d68b0fa1c5ab86bda8134d8b98795252295c5a6454`。

## REV-001 销账与增量检查

原 finding 的 severity、锚点、failure_mode、证据、建议、来源及其余冻结字段全部原样携带，仅改 `status` 与 `resolution_evidence`。销账依赖规格澄清，不依赖尚未发生的测试。

| 原问题 | 本轮精确约束与判断 |
| --- | --- |
| 要求原automation回归会构建W外dist | SPEC第51、69行明确原文件只读参考、不执行旧suite、不记旧suite PASS；第71、73-74行要求在已授权runtime内生成等价文件，仅移除唯一build并把两worker路径绑定已锁immutable文件。没有给W外构建或候选改写授权。 |
| 局部30000ms不满足测试预算 | 第75行要求两it机械改900000ms、hook至少180000ms、outer至少3600秒，单worker/retry0；原任务deadlineMs120000/maxCalls/maxTokens全部保持。模块命令的testTimeout/hookTimeout与此一致，未改变生产预算。 |
| 替代回归可能丢原业务断言 | 第76-77行限制文件搬移只作同源相对import解析、裸包走backend原依赖；原两it名称、所有业务语句、expect表达式/参数/数量和顺序保持，必须完整文本反向归一或等价机械映射逐字检查，失败停止。该约束强于只比通过数量，不允许subset或helper代签。 |
| 原验证结果可能被等价结果覆盖 | 第79行要求分列旧suite未运行与runtime等价实际结果，并列明父子driver完成、零模型skip、三来源HTTP3/1、maxCalls13/账本8及后加来源不改冻结预算的完整原断言。新隔离loopback与0真实模型保留。 |
| 变更是否扩大范围 | 实核git diff仅修改原第51行、追加Round2执行约束，并在MODULE_SCOPE增加当前审核输入与等价config命令；原runtime写集已存在，两生产/三测试及产品行为边界没有扩展。 |

大白话：保留原测试的全部检查，把会写出范围的构建步骤换成已冻结的worker；先证明副本只有允许的机械差异，再实际运行，报告如实写明旧文件没有运行。

```mermaid
flowchart LR
 A[锁定原两it全部文本] --> B[仅作允许的机械搬移]
 B --> C[完整反向归一核对]
 C --> D[隔离运行完整等价回归]
 D --> E[旧suite未运行与新结果分列]
```

## 证据限度

`RECHECK_CONTEXT.json` 的 `changed_line_refs` 为空；本轮从 `21aa443545a740004c033ba5de30ddf0ea051afb` 到当前 HEAD 的真实 git diff 核对精确修改，且没有新增 finding，未制造无来源的增量 finding。

本次只读核对规格、原packet、精确diff及文件哈希，只写本轮获授权的两份报告。没有生成/运行机械副本，没有测试、RED/GREEN、浏览器、RPC、数据库访问、模型、构建、control或commit；controller94030未停止或重启，T1310未复审。

后续必须实际生成并核验机械副本、保留完整before/after/diff与反向归一结果，再运行完整两it和原SPEC指定的生产组合RED/GREEN。当前销账仅说明规格给出了可执行约束，不能代签这些执行结果，也不能改变原U05失败与原任务禁重发边界。
