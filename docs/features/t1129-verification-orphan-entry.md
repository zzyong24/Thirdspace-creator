# T1129 验证清单的孤儿扫描入口写错

T1127实际static命令组合exit1。boundary/semantic/diff各自0，但根会话误写 `orphan-check.mjs`，Node实际MODULE_NOT_FOUND，扫描没有执行。`rg --files orchestrator/process`查到唯一正式入口 `orphan-scan.mjs`。原失败保留N/t1127-static-after.json/log，不当成产品RED、全局债务或已通过检查。

仅改modules.config的T1127正式命令为原扫描入口，执行当前真实扫描保原退出码/所有规则。无产品、源码测试、预算、原SPEC范围变更；当前独立实施复核另核机械校正和实际结果。T1127尚未完成，完整reconcile仍待跑。
