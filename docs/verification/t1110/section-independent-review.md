# T-1110 内部失败观测与 SDK 预算独立审查

审查对象：`/Users/zyongzhu/.codex/worktrees/canvas-binding-fixes/Thirdspace-creator` 当前未提交的 `wechat-browser-source.ts/.test.ts` 与 `wechat-dom-witness.ts/.test.ts` 四个文件。仅核查五字段失败观测和显式 SDK 预算；未修改产品树、服务契约或共享 guard，未操作浏览器或读取真实账号数据。评审模式为 homogeneous inherited；独立读代码不代表跨模型评审。

本次差异未发现具体阻断项。该结论限于上述增量，不等于 T-1110 完整验收或真实平台通过。

- **隐私边界成立。** `wechat-dom-witness.ts:31–48` 在已选定的同一 frame 中，只产生 `exactTabCount`、`visibleTabCount`、`frameElementVisible`、`documentReadyState`、`bodyTextLength`。正文只在浏览器内计算长度，没有字符串、HTML、URL、身份或认证字段进入快照。`wechat-browser-source.ts:41–50` 再次按有限整数、布尔值、readyState 枚举重构新对象；非法字段整份丢弃，额外字段与原对象引用不传播。该快照仅在视频号 prepare 阶段的 `REPORT_SECTION_MISSING` 接入内部诊断。诊断不输出异常 message 或 cause，诊断端口抛错不影响原失败及关闭。
- **没有新增报表重试或重选。** 缺标签观察只有一次，沿原 frame/locator 读取；成功路径、重复标签路径不启用观察。观察完成或失败均继续抛出原 `REPORT_SECTION_MISSING`，不会点击标签、切日期、下载或调用 onReport。已有启动层 system Chrome → bundled fallback 保留原行为；本增量未新增导出或任务重发。
- **原取消与期限优先于新增观察。** 观察前后、catch 内均复核 signal 和原剩余期限。观察自己的上限至多 120000 ms，并受原剩余期限收窄；挂起观察由 signal/有限 race 结束，晚快照不追加第二条诊断，不触发提交。原期限已过但 timer 尚未派发时，`timeoutMs()` 的期限错误继续传播，不被恢复为 SECTION_MISSING。source 下载后进入 onReport 前仍有原 signal 检查；本增量没有另建晚提交路径。此结论不替代 backend 对已进入异步提交的写库检查。
- **SDK 预算真实落到消费者。** `wechat-browser-source.ts:117–128` 的 `launchPersistentContext` 显式 `timeout = min(120000, 原 deadline 剩余值)`；每次已有 fallback 调用都重新取同一个绝对 deadline 的剩余值，调用 SDK 前检查原 signal。首轮耗时 45000 ms、总剩余原为 90000 ms 的合成链中，第二轮仅获 45000 ms。managed 冻结 `end` 为绝对 deadline，不因启动或 fallback 续期。单次 guard/排队预算显式为 370000 ms；外层默认预算计入现有排队、启动尝试和清理余量，较早父 deadline 仍优先。
- **未新增提前释放。** 本增量未改 source finally/closeProfile 或共享 guard 停止协议。诊断失败和观察取消均走原关闭；停止未确认保留 `onStopUnconfirmed` 清理回调，不调用虚假的 onStopped。既有合成回归覆盖关闭失败时未释放，以及实际 retry 关闭后才释放。不能据此声称所有物理关闭等待都已有限化，也不能把本次观察结论提升为完整宿主租约证明。

证据为根代理本轮实际日志，本审查未重新运行测试：`/tmp/t1110-section-root-red.log` 显示靶向 **7 failed / 60 skipped**，退出 1；`/tmp/t1110-section-root-green.log` 显示三文件 **67 passed**（含 parser 回归）。`/tmp/t1110-section-root-type.log` 当前仅有 `tsc --noEmit` 启动信息且无诊断；该文本不包含结束/退出码，本审查不代签 typecheck 已完成。

必须保留的限制：共享 `chromium-guard.ts:304` 的首次 `await ensureChromiumLaunchable(...)` 在启动 race (`:312`) 之前；锁清理 `:337` 的 await 也在下一次 attempt/race 之前。显式 SDK timeout 与 source 的 deadline timer **没有使这些预检 await 本身可中断或独立返回**。本次没有修改或补验该共享路径。source finally 的实际 close 等待仍使用原协议，外层 pending-stop 与 primary reason 归宿主/backend执行链负责；本次四文件审查没有重新验收该完整链路。

真实微信平台当前链路仍未完成；67 项是合成 SDK/DOM/下载数据测试，不能替代扫码、实际 frame 标签、原生文件下载或真实落库验收，也没有产生本轮真实平台 PASS。
