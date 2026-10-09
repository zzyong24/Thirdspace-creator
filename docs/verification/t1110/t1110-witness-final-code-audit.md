# T1110 内置微信 witness 最终只读复核

2026-10-09，HEAD `b1f0cc5462285e59531a329a42340abe84c8d0ac`，审阅包含当前未提交源码。仅审阅指定源码、合成测试和已有日志；未写工作树、操作浏览器/用户数据/Cookie/profile。为确认一个输入族，仅在内存 JSDOM 执行当前源码的 `isLoggedOut` callback；首次直接执行 TS 因类型标记失败，随后用项目既有 TypeScript 转译执行成功，未新增测试文件或伪记 TDD 红测。

**结论：午夜窗口冻结、无 frame 请求及被动新请求/取消/原期限用例已闭合；隐藏登录提示修复仍有一个确定性遗漏，需要修复。** 此结论只覆盖已查代码，不代签真人扫码、实际 Chrome 操作或整体 T1110 Gate。

| 项目 | 本轮核查 |
|---|---|
| 午夜窗口 | `wechat-dom-witness.ts:135` 在 prepare 开始冻结 target；请求 predicate 和数据 ready 比较分别在 :158、:168 复用同 target。`wechat-dom-witness.test.ts:74–85` 用旧 response、详情 30 click 产生 fresh request/response，并跨上海午夜，断言 now 仅调用一次。闭合。 |
| 无 frame 请求 | witness :153 在 request listener 对 frame() 抛错做有限忽略，不打印 raw 错误/URL；:161 finally 移除 listener。test :76 实际触发抛错对象，随后 fresh 请求成功。闭合。 |
| 停止与 late response | test :87–110 在真实 source 注入内置 DOM witness 和明确 browser fixture，前两份 callback 后阻塞于 native response；分别取消和消耗原 240s deadline，断言关闭/停止确认、late response 不交第三份及 listener 移除。source :197–200 在 prepare/下载后、callback 前检查原 signal；:155–172 使用 inherited deadline 与停止协议。已覆盖本次接缝，未改预算、归属或未知重发规则。 |
| 隐藏提示 | witness :116 已增加 display/visibility 检查，但仍对可见父 div 的聚合 textContent 匹配登录提示。**未完全闭合，详见下面。** |

必须修复：`ai-worker/src/runtime/platform/wechat-dom-witness.ts:116`。

合成输入 `<div><span style="visibility:hidden">微信扫码登录</span></div>` 中，span 不可见，父 div 仍可见且 textContent 等于登录提示。当前源码 callback 实际返回 `true`。现有 test :25–29 只覆盖直接放在 body 下的隐藏 span，没有父容器。source :176 / :201 会把这个普通有效会话判为 `LOGIN_REQUIRED`；后续原生下载失败时尤其可能被此错误替换。应检查实际可见文字，排除不可见子树的文本，不可用父容器的聚合 textContent 为 Cookie 失效签证；保持真实可见扫码提示返回 true。最少补两平台的嵌套 CSS visibility:hidden/display:none/[hidden] 负例和真实显示正例。此问题已发送 root，未擅自修改。

内部完整性接缝仍正确：source :145 带出 expectedRows，parser :305–306 在提交前核对实际单篇 CSV 行数，collector :63 把 mismatch 稳定映射为 REPORT_PARSE_FAILED。公共 DB integration :117–127 的 expected13/CSV10 保原两份可公开回读，不把第三份写入。公众号 nativeDateInputs/href 及单篇原生响应日期协议未被本轮修复放宽；正式 composition :4604–4605 已注入内置 witness，configured 可为 true。此装配成立不等于本人产品 QR 已验证。

读取到的日志：

- `real-protocol-public-chain-final.log`：2 文件 32 PASS，21:49:07。
- `current-ui-logic-green.log`：3 文件 39 PASS，21:58:52。
- `real-worker-final.log`：3 文件 33 PASS，22:02:25。源码当前已含新增 cancel/deadline 两例，但尚未定位 root 所报 35 worker PASS 的新日志；`current-timeout.log:240–243` 的 35 PASS 是 backend execution 三文件，不能用来替代 worker 证据。
- 当前前后端 type 日志均只见正常命令/生成输出，无错误文本；退出 0 是 root 报告，本代理未重跑。

上述测试为 root 运行后本代理读取日志，不声称本代理执行。私有五文件/真实 DOM 观测为 root 独立证据，本代理未读私文件。产品公共 p4 扫码仍由人独立 Chrome 完成；Ego20 已交回用户，本代理未操作。

本轮源码 SHA256：

| 文件 | SHA256 |
|---|---|
| ai-worker/src/runtime/platform/wechat-dom-witness.ts | a28840408f4107de61dbc3f2c8526c30ebc92e3b13badc34c4febacb954f1949 |
| ai-worker/src/runtime/platform/wechat-dom-witness.test.ts | 1a83e86fd89ea499558759ae860bda006efeead9dd7d264cfcb2deb9cc193b05 |
| ai-worker/src/runtime/platform/wechat-browser-source.ts | 9a92c5c9e34266da6d0bb800c343fc14b3664190e5a92b6c1939b04d7fd05fcf |
| ai-worker/src/runtime/platform/wechat-browser-source.test.ts | 1fa26ea320687b8d2cadbebc4ce4ba4aad34d25ffc70642f38a08b9633949fe8 |
| ai-worker/src/runtime/platform/wechat-native-report-parser.ts | 7244f11d1d46c0edd4aeb190217d23b85dd8738a4cd578083c36f3202a8b9d07 |
| backend/src/application/collection/wechat-native-collector.ts | c09b829dc9ecf0b19b8b89ffa901a732f68500018d94b32d20d11d0a93f02dd9 |
| frontend/src/server/persistence-client.ts | 2d9175f1294f5244bd4bf71027c01e081ef3abf3d91a7add6614641d449e13dc |
