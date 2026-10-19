# T-1119 SPEC 独立初审

结论：**CHANGES_REQUIRED**。

SPEC 对事实边界处理正确：它保留并发与串行两次失败，明确当前文件副本不是报错瞬间证据，写坏源头仍为 UNKNOWN；只允许在无 dev 写者、SHA 不漂移、非 symlink 的条件下保存并移除两份明确派生文件，不清理整个 `.next`，失败继续保留。这不削弱 typecheck，也不需要新增产品方向审批。

## REV-001（major）

模块的正式 `verify_commands` 只有 `git diff --check`、一次 frontend typecheck、pmem 与 reconcile。它没有绑定 SPEC 验收所要求的：删除前 SHA 与非空 0700 副本、无 dev 写者、仅两文件闭集、生产产物非空、真实 Next dev 再生两份 dev 产物、浏览器结束后的最终 typecheck，以及确认 dev 路径仍被 tsc 消费。这样任务可能在核心维护闭环未发生时通过模块 Gate。

建议补一个受同一闭集约束的私有维护/核验入口或等价精确命令，并让模块命令实际覆盖上述步骤。不得扩大为清理 `.next`，也不得把后续 T-1120 的浏览器执行当作 T-1119 自身的隐含验收；当前两个任务没有依赖绑定。

绑定：SPEC `840d460b31b852c0b3395b54061565d7475983c11436ec2b988c39d5151a5d48`；modules `00a551bd1a33f6aecc31a98c0ddfdc126dac06ed415411e3ebfe7fd3182e5307`；constitution `86bc2c8add6a01ebf5b2ecf9de05d448770ca14a4e0bdbbf376fffc6387e3800`。
