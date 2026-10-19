# 新close正常构建的独立8轮零回合对照

结论：controlled **7成功、1失败**；前置status4成功。第2轮controlled在account/read得到CODEX_RPC_REJECTED、上游int32=-32603。原失败未重试，不能说close修复已解决RPC拒绝，也不代签聊天/普通任务/App。

| 轮次 | 流程 | status | controlled |
|---|---|---|---|
| 1 | status-then-controlled | OK | OK |
| 2 | controlled-only | — | CODEX_RPC_REJECTED / account/read / -32603 |
| 3 | status-then-controlled | OK | OK |
| 4 | controlled-only | — | OK |
| 5 | status-then-controlled | OK | OK |
| 6 | controlled-only | — | OK |
| 7 | status-then-controlled | OK | OK |
| 8 | controlled-only | — | OK |

HEAD6f75509fc715045035559d622c3fc9ffd932e16f；protocol3110cc16930c31b7b65a3fa60cf4ce63ab09e10af8bfde57846a2901cbec60a8；普通status1de879a6a271b2283cbf2437bd8b1070088141dbb3ff4ede8d0d5a55199aee58/executioncd50a5069fafdc67d0825cebea5e6eda6a5a9448428b272a2fbc1d5ec6405233。sourceBefore/After完全相等，sourceDrift=false。v2候选run/watch SHA与Root所审一致，新nonce/ownedTMP绑定见BINDING.json。

与前一59136实验是不同环境：直接继承正常工具shell的Codex runtime白名单环境，不读取旧进程env或用户account/config/DB，HOME/CODEX_HOME不修改也不打印/落值；仅将TMPDIR/TMP/TEMP隔离到本轮新owned目录。未启动Next。每轮新hash cwd，原createControlledCodexSession(nativeImages=false)最多一次，成功立即close；前置status是真实正常producer的非付费model/list/能力读取，watcher只保存PID/有限错误字段，不输出帧或message/data。thread/start、turn/start被诊断层拒绝，实际请求0，模型/资金/业务任务0。

本轮status错误帧安全投影共0项；direct第2轮保account/read/-32603。其余RPC OK不推断认证永远ready。每RPC120000ms、controlled960000ms、原status120000ms deadline及原ready/result/cleanup观察均保，外层13000000ms覆盖8轮完整有限串行与清理，未过期。进程exit0只表示实验与记录完成，不代表8轮全绿。

4个status在native PID确认close后对精确ChildProcess执行SIGKILL，并等待真实close；4 producerClosed均true，与原RequestIo.stop的terminate/close顺序一致。本轮不是先disconnect。直接及status全部原生child close=true；最终57个记录PID全ESRCH，launcher独占PGID空，ownedTMP lsof开放句柄0，详见CLOSURE.json。临时目录与证据均保留，未删除原失败。已通知Root本轮无在途握手，可继续严格full10；后续调查/新的有限同session观察仅候选，不以此重试本轮原失败。
