# T1125 私有冻结预检夹具修正独立 SPEC 复核（时间校正版）

实际系统时钟：UTC `2026-10-09T12:08:11Z`，本地 `2026-10-09T20:08:11+0800`。原报告保留；其 `reviewedAt` 不准确，本校正版替代该时间字段，其余结论维持 **PASS_WITH_EXACT_FIXTURE_AND_BATCH_GUARDS**。

## 同源 HEAD 绑定

本次审过的源码基线固定为 `reviewedSourceHead=ec5fa6a851b4a660eabb10d064b968e66baa026d`。三条路径的 blob OID 与完整 SHA 已逐项记录在同名 JSON。当前 HEAD 正是该提交，`ec5…HEAD` 的 `frontend/backend/contract/ai-worker/tools` 差异为空。

允许后续仅 docs/control 提交形成最终冻结 HEAD，但必须同时满足：

1. 三个 fixture 路径在最终 HEAD 的 blob OID和完整SHA均与 `ec5` 完全相同；
2. `git diff ec5..finalHead -- frontend backend contract ai-worker tools` 为空；
3. 最终 helper receipt明确记录reviewedSourceHead、finalHead、三路径OID/SHA和上述源码范围空diff；
4. 原clean、diff、四版本、tracked hashes、敏感文件名与全量密钥形状扫描继续通过。

这不是对任意未来 HEAD 的授权。`frontend/backend/contract/ai-worker/tools` 任一源码变化，或任一fixture路径、OID、SHA、完整命中集合变化，都会使本例外失效，必须重新独立复核。

原审查约束继续有效：只有path、whole-source SHA及该文件全部 `rule/line/length/matchSHA` 同时精确一致时才分类六条合成fixture；其它文件、额外命中与敏感文件名仍fail closed。未执行helper或打包，不签实现GREEN。
