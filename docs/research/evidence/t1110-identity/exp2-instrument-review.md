# T1110 身份研究 EXP2 实际仪器补充审查

结论：当前仪器有一个需要在提交本轮唯一新 intent 前修正的执行边界问题：研究日志落盘成为无原 signal/deadline 的串行等待。固定布尔与受管身份读取的权限范围未发现新的泄露或归属绕过。此为只读静态审查，不是编译、运行、GREEN、研究 CLOSE 或真人根因认证。

## 核对对象与一致性

已阅读 `/tmp/t1110-prepare-identity-only-exp2.mjs`、`/tmp/t1110-identity-exp2-source-manifest.json` 和清单指向的实际 shadow 三文件。没有执行准备脚本、测试、API 或浏览器操作，没有改共享源码或任务状态。

实际文件 SHA 与 manifest 全部一致：

- research browser source：`846c2278b53fdc17e3b43850aa5649c444f89669916577c8747918e54cf7380d`。
- candidate DOM witness：`9eedfeca552e4b6d508a9c57b22e0b8e794e57230b078311029198305e5a1025`。
- identity-only composition：`7b6b7f9ad5b9a483d8d4673484dd50a5436f7b71abc585c90b84a28bf52f46bf`。

同时重新计算正式三源 SHA，仍分别为 `f172f920…`、`10d7b940…`、`ab110535…`，与 manifest 正式基线一致。manifest 明确是 `EXP-2 planned not executed`，candidate GREEN/type 均 NOT_RUN；本审查不改变这些状态。

## 必须先处理的具体问题

实际 shadow `persistence-client.ts:4699-4710` 的 `mark` 会异步 import 并 `appendFile`，没有传原 signal，没有原期限检查，也没有有限等待。它被启动前、`onStopped`、健康结果、异常传播和主动停止逐项 await。因此日志 I/O 可以拖延真实 SDK 开始、原错误返回以及停止回调完成。原 backend 的 30 分钟 race 仍在，不能把它理解为该新增日志消费者已经有独立预算；尤其尚未启动浏览器时就可能被日志挂住，影响本轮实验解释。

`void mark` 的诊断和停止未确认记录还会并发落盘，可能乱序或晚于公开结果；而健康、主动停止标记前没有复核原 signal/end。若身份/物理停止之后日志写入耗时跨过期限，这段仪器仍能继续写出健康与主动停止记录。它不会调用 report commit，但这样的私有记录不能证明有效期限内完成本轮实验。

最小修正是使固定事件记录不成为执行、停止或错误传播的 Promise 等待：可在实际事件点同步生成有限固定记录，使用已有受管服务日志/内存记录，任何诊断输出失败局部吞掉。不要新增第二执行 timer、生产者或服务契约。若仍保留异步私有文件，必须明确它只是尽力落盘，不能延后上述链路，不能拿文件顺序证明因果，也不能用迟到记录补签健康；原执行路径在调用身份读取、记录健康和主动停止前复核原 signal/原 end。清理事实可以在真正停止之后记录，但必须与有效期限内的健康结果分开解释。

实际 research browser source `:282` 直接 `console.warn` 后才走原诊断和取消/期限优先逻辑。固定协议输出应局部 try/catch，确保 logger 抛错时仍传播原错误与原 signal reason；这是保持诊断旁路所需的最小保护。

## 已保留的边界

- 实际 composition 仍经原 `authorizeBindingTarget`、`hostProfileLifecycle.acquire`、原 collector claim/renew/fail 与 pending-stop 注册；只替换 `collectReports` 适配器。
- 适配器委托 `readIdentity(platform, directory, expected, 原 signal/deadline/onStopped/onStopUnconfirmed)`，没有调用 prepare、download、parser、onReport 或 commitPage，健康后抛固定 `RESEARCH_IDENTITY_ONLY_STOP`。
- `physicalStopConfirmed` 当前在 `await options.onStopped()` 成功之后才生成，没有先凭 OS Chrome 数量或公开终态释放 profile。问题是新增日志等待拖住回调返回，不是发现提前释放。
- SDK 仪器只输出固定 schema、原 trace 固定阶段、白名单身份分段和四个布尔。没有输出原 message、stack、URL、正文、账号身份或目录。这个额外仪器确实只在 shadow research source 中，正式 production candidate 不含它。
- `nameHelperUndefined` 和 `executionContextDestroyed` 是 message 的机械签名，只有 `sdkEvaluate`/`javascriptReferenceError` 含方法前缀约束。布尔可以区分本轮看到的签名，不能单凭名字认定已经证明 SDK 内部根因；应结合阶段及 evaluate 前缀解释，不改 auth 分类。

本轮 authority 方案仍可限定在唯一明确新研究 intent、正常受管已绑定视频号 profile、原公开 session/group/membership 与原任务期限内；停止/checkout 不确认就结束，不抢锁、不搬 Cookie、不接管 Ego，不重发原 62/83。EXP1 已登记 1/2，本轮最多再执行一次。修正仪器不等于恢复产品 PASS；普通失败、取消、期限、物理停止未确认和身份健康后主动研究停止必须如实分别登记。
