# T1110 EXP2 收尾证据与额外形状探针静态审查

结论：本轮收尾证据与已保存的原始收据、固定日志、源码 SHA 一致。形状探针最初的迟到 evaluate 问题已修正，最终文本未发现剩余必修静态缺陷；集成仍未实现、未编译或运行，不签验收结果。额外实验必须如实记为同族第 3/2 次，当前 DEC 仍待用户确认，不能执行。

本审查没有运行测试/type、API、浏览器、服务、脚本或第三实验，没有写共享源码/控制面；只读现存文件并写本 `/tmp` 意见。

## EXP2 证据一致性

已核 `exp2-result.json`、`exp2-cleanup-restoration.json`、研究卡和已有私有原始 final/after 收据。原始 final 为 `collection-db52c710-52`、generation 2、failed / EXPORT_FAILED / committedPages 0，startedAt `04:46:10.617Z`、updatedAt `04:54:23.529Z`；原 deadline `05:16:10.617Z` 未续期。after 收据实际 reports.total 0、原 62 failed/0、原 83 failed/accountId null，与汇总一致。

result 列出的 9 个工件 SHA/大小、4 个私有收据 SHA 全部匹配。cleanup 记录的正式三源 SHA 也与当前源码逐份匹配，没有把诊断候选合入正式源码。

运行版本仍准确区分：旧源码重建不是内存哈希证明，`runtimeExactSha256=UNKNOWN`，修后磁盘执行为 NOT_RUN。四行固定事件保持 identityFields / IDENTITY_MISSING、原 onStopped 返回后的停止标记及 identityRejected；没有健康或主动停止证据。没有据此断言 Cookie 失效或原 62/83 根因。

新增 `exp2-sdk-fixed-protocol.json` 的私有日志 SHA 与现存日志一致，四个机械布尔全部 false，投影与原固定协议片段匹配。这是同一 EXP2 的既有日志整理，不能计为新实验，也不能由 false 推导所有内部 evaluate 都没有出错；只证明最终被记录的异常没有匹配这些协议签名。

cleanup 文档把研究宿主正常停止/进程组 0 与停止回调标记分开记录，恢复正式源 31410/PID 45377、两个 driver disabled、5 个公开读 200、原状态和报告 0；与终态时间和正式 SHA 没有冲突。本审查没有重新执行 OS 检查或 HTTP 读取，故不代签实时物理清理或正式停止验收。

## 最终形状探针

审查最终 SHA：`24015bcca66136d8061623a3ac8281852d6ff086724ad430b36f47fde2037691`。不再将任务最初给出的 `f0de904a…` 作为最终候选版本。

最初 `Promise.resolve().then` 直接发出 evaluate，已排队的取消/到期可能先发生仍发出迟到请求。我指出后 root 仅改静态候选；最终 `proposed-identity-shape-probe.ts:14-16` 在实际 SDK 调用前重新检查原 signal 和原剩余期限，没有重置已有 timer，也没有获得新的 deadline。

进入前、实际调用前、结果采纳前均检查原控制；单次观察 timer 使用 `controls.timeoutMs(120000)` 裁剪后的时间，abort listener 与 timer 在 finally 清理。迟到 evaluate 结果不进入形状输出。已发出的 SDK 操作不能仅靠 race 保证物理立即结束，仍须交回原 context close/guard/onStopped；该文件没有提前确认停止或自行释放 profile。

页面执行的是固定纯 JS 字符串，字符串内函数均自包含，不引用服务端变量/编译 helper。由静态文本看，转译器不会把 Node 侧 `__name` helper 注入字符串内部。此结论不是编译或真实 Playwright 运行证明，实际冷启动仍须冻结候选版本并保留观察到的版本标记。

输出经精确字段集合、固定 schema/readyState、布尔类型和 0..1000 整数校验。身份文本与 clipboard 只在页面内比较是否存在/相等；不返回 ID、昵称、原 URL/path/query、Cookie、正文、异常或截图。正常输出和 unavailable 输出均局部保护 logger。固定登录文案仅作机械形状观测，不能替代原 isLoggedOut 或决定 needsAuth。

catch 可在取消/观察失败时输出固定 unavailable；这只是本次观测不可用，不能解释为 DOM 不存在或登录失效。该辅助函数不改身份返回值，也不写 DB/报表。注释中的接缝最后仍抛原错误；原外层信号/期限优先逻辑负责保留 CANCELLED/TASK_TIMEOUT，普通 IDENTITY_MISSING 保留原失败。

集成目前只有注释，不能从独立辅助函数签实际接缝已正确：如用户批准，实际调用必须放在 context 关闭前、仅视频号 identityFields 的 typed IDENTITY_MISSING 路径，使用该操作的 `WechatOperationControls`（实际 `op`，不能误传外层可选 `WechatBrowserControls`），不得触发导航错误/公众号/登录刷新路径。并保持原 onStopped/pendingStop 所有权。这里是落实现有方案的接缝要求，不增加产品范围或新的质量门。

## 决策和额度

研究卡当前 researching、max_experiments 2、experiments 恰为 EXP1/EXP2、quota_exhausted true。DEC-WECHAT-1110-IDENTITY-EXTRA-PROBE 与卡内 pending_user_decision 都为待确认/尚未授权，`quotaOverrideNotGranted=true`，与提案一致。

提案明确同族追加一次、保留前两次、唯一新公开 intent、原 authority/profile/lease/心跳与 30 分钟期限、观察最多 120000ms/原剩余时间、原 120 分钟卡窗口不重置、身份之后下载之前停止、不搬 Cookie/新 QR/旧 ID 重发，恢复原测试服务。没有以新任务或新族重置额度，也没有假装官方工具支持超过 2 次或已 resume。

原实施方向及扫码授权不等于本次实验上限例外。当前可停在具体可审阅方案；只有明确例外授权后才可执行，并记实际 3/2，保工具真实限制/失败，不改门卫、删历史或伪造 actor/PASS。后续机制与边界仍需实际验证和独立闭合，本次静态意见不能作 GREEN/CLOSE。
