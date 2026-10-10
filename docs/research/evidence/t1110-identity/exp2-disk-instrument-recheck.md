# T1110 身份研究 EXP2 仪器修正复核

结论：实际 `/tmp` 仪器已消除上轮指出的具体阻断。本次静态复核通过，未发现需要阻止既定唯一 EXP2 身份探针的新问题。该结论只针对研究仪器，不是运行、编译、GREEN、研究 CLOSE 或产品 PASS。

已只读检查修正脚本、manifest 和实际 shadow 源码，没有执行脚本、测试、API、浏览器或服务操作，也没有改共享文件或状态。

实际三文件 SHA 全部与更新的 manifest 一致：

- research browser source：`e85b51addfd0d0b84e7d04bf23820c73107db2ae3ec504c77758db43a7b6efe7`。
- DOM witness：`9eedfeca552e4b6d508a9c57b22e0b8e794e57230b078311029198305e5a1025`。
- identity-only composition：`4f9601f699bd8c25b60434eb2522b9bbf53e6897bbc6a5ce6e245f6c05c13448`。

正式三源也重新计算了 SHA，仍匹配原 `f172f920…`、`10d7b940…`、`ab110535…` 基线。清单仍明确 `planned not executed`、candidate GREEN/type NOT_RUN；没有用本次静态审查改变这些证据状态。

## 已核实的修正

`mark` 现为同步固定 JSON 记录，并局部 try/catch。实际适配器不再包含 appendFile、异步 import 或 await/void mark，因此日志 Promise 不再拖住启动、原错误传播或停止链。

`onStopped` 只 await 原 `options.onStopped()`，成功之后同步记录 `physicalStopConfirmed`。`onStopUnconfirmed` 仍先交回原 pending-stop 所有者。没有增加提前释放、手动清锁或假停止确认。

`identityHealthy` 与 `researchActiveStop` 前均执行 `options.signal.throwIfAborted()` 和原 `options.deadlineAt` 检查。超期抛出的固定 `TASK_TIMEOUT` 会被现存 backend `reasonOf` 的固定 code/message 规则识别；取消保留原 signal reason。身份调用本身仍传原 signal/deadline，并受原 worker 的期限与 guarded launch 约束。没有续期、重新生成 attempt 或延长浏览器操作预算。

research source 的固定协议 JSON 输出已局部 try/catch，之后仍按原路径 emitDiagnostic、优先处理 signal/期限、保留 typed failure 并 finally close。适配器另一个 `onDiagnostic` 的 console 输出虽未局部包裹，但调用处既有 `emitDiagnostic` 整体 try/catch，故 logger 抛错不会遮盖原错误或关闭；最坏是该条观测缺失，不能补造。

## 范围与证据限制

authority、profile acquire、collector lease/heartbeat/原 30 分钟期限、pendingMap 与 host cleanup 注册均保留。适配器仅委托真实 `readIdentity`，身份读取成功后固定主动研究停止，没有 prepare、download、parser、onReport 或 commitPage 路径；普通 SDK 失败不改为 needsAuth。

固定分段及四布尔仍不输出原 message/stack/URL/正文/身份或目录，也不参与授权或运行判断。`nameHelperUndefined` 等布尔只是机械签名；必须结合本轮阶段与 evaluate 前缀解释，不能单凭布尔认定完整根因。日志缺失、服务输出尚未落盘、停止未确认和迟到清理都必须如实记录，不能机械声称所有 OS I/O 即时结束。

唯一新研究 intent、原正常受管已绑定视频号 profile、原公开权限与原任务期限、身份后停止、至多本卡剩余一次实验的限制仍成立。是否实际执行以及最终终态/0 报告/物理停止证据，需要 root 记录当场结果；本报告未独立确认服务启动、旧服务 OS 退出、浏览器数量或任何真实探针结果。
